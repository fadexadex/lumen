import { streamRoadmap, streamLesson, repairLesson, repairLessonContent } from "./generate";
import { createFallbackVisual, enrichScript } from "@/lib/course-gen/math";
import { lessonScriptSchema } from "@/lib/course-gen/schemas";
import { assertLessonMath } from "@/lib/course-gen/validation";
import type { LearnerProfile, LessonScript } from "@/lib/types";
import type { Course, CourseModule, CourseStreamEvent } from "@/lib/course-gen/types";

type Send = (event: CourseStreamEvent) => void;

/**
 * Two-wave course generation (see docs/plan-generative-courses-build.html):
 *   Wave A (foreground): roadmap -> Module 0 priority -> Modules 1..N background pool.
 *   Wave B (resources):  Tavily enrichment — added in a later phase.
 *
 * `send` emits one SSE event. The passed `course` is kept in the shared Map so
 * GET /api/course/:id can serve reconnects.
 */
export async function runCourse(opts: { course: Course; profile: LearnerProfile; send: Send }) {
  const { course, profile, send } = opts;
  send({ type: "course", id: course.id, topic: course.topic });

  // ---- Roadmap (streamed pop-in) ----
  let outline;
  try {
    outline = await streamRoadmap(profile, (modules) => send({ type: "roadmap_partial", modules }));
  } catch (err) {
    send({ type: "module_status", id: "roadmap", status: "failed", error: errMsg(err) });
    send({ type: "done" });
    return;
  }

  course.topic = outline.topic || course.topic;
  course.modules = outline.modules.map((m): CourseModule => ({
    id: m.id,
    title: m.title,
    blurb: m.blurb,
    status: "pending",
  }));
  course.updatedAt = Date.now();
  send({ type: "roadmap", modules: course.modules });

  // ---- Module 0: priority, foreground ----
  await generateOne({ course, index: 0, profile, send });

  // ---- Modules 1..N: background pool (concurrency 2) ----
  const rest = course.modules.map((_, i) => i).slice(1);
  await mapPool(rest, 2, (index) => generateOne({ course, index, profile, send }));

  send({ type: "done" });
}

async function generateOne(opts: {
  course: Course;
  index: number;
  profile: LearnerProfile;
  send: Send;
}) {
  const { course, index, profile, send } = opts;
  const mod = course.modules[index];
  if (!mod) return;
  mod.status = "generating";
  course.updatedAt = Date.now();
  send({ type: "module_status", id: mod.id, status: "generating" });

  const priorModules = course.modules.slice(0, index);
  try {
    let raw: unknown;
    try {
      // Throttle partials to ~5/sec — the SDK emits hundreds per lesson and the
      // client only uses them for optional skeleton UX.
      let lastPartial = 0;
      raw = await streamLesson({
        profile,
        module: mod,
        priorModules,
        onPartial: (partial) => {
          const now = Date.now();
          if (now - lastPartial < 200) return;
          lastPartial = now;
          send({ type: "module_partial", id: mod.id, partial: partial as Partial<LessonScript> });
        },
      });
    } catch (streamErr) {
      try {
        raw = await repairLesson({ profile, module: mod, priorModules, cause: errMsg(streamErr) });
      } catch (visualRepairErr) {
        const content = await repairLessonContent({
          profile,
          module: mod,
          priorModules,
          cause: errMsg(visualRepairErr),
        });
        const core = { ...(content as object), moduleId: mod.id } as LessonScript;
        raw = { ...core, visual: createFallbackVisual(core) };
      }
    }

    let parsed;
    try {
      parsed = lessonScriptSchema.parse({ ...(raw as object), moduleId: mod.id });
      assertLessonMath(parsed);
    } catch (validationErr) {
      try {
        raw = await repairLesson({
          profile,
          module: mod,
          priorModules,
          cause: errMsg(validationErr),
        });
      } catch (visualRepairErr) {
        const content = await repairLessonContent({
          profile,
          module: mod,
          priorModules,
          cause: errMsg(visualRepairErr),
        });
        const core = { ...(content as object), moduleId: mod.id } as LessonScript;
        raw = { ...core, visual: createFallbackVisual(core) };
      }
      parsed = lessonScriptSchema.parse({ ...(raw as object), moduleId: mod.id });
      assertLessonMath(parsed);
    }

    // The server, rather than the model, owns diagram arithmetic.
    const script = enrichScript(parsed);

    mod.status = "ready";
    mod.script = script;
    course.updatedAt = Date.now();
    send({ type: "module_ready", id: mod.id, script });
  } catch (err) {
    mod.status = "failed";
    mod.error = errMsg(err);
    course.updatedAt = Date.now();
    send({ type: "module_status", id: mod.id, status: "failed", error: mod.error });
  }
}

/** Retry one failed module without restarting the rest of the course. */
export async function retryCourseModule(course: Course, moduleId: string): Promise<CourseModule> {
  const index = course.modules.findIndex((module) => module.id === moduleId);
  if (index < 0) throw new Error("module not found");
  const module = course.modules[index];
  if (module.status === "generating") throw new Error("module is already generating");

  // A transient provider failure must not discard a lesson that was already
  // generated and persisted successfully. This can happen when a stale failed
  // status is applied after the ready payload, or when a learner retries while
  // background generation is being rate-limited.
  if (module.script) {
    try {
      const parsed = lessonScriptSchema.parse({ ...module.script, moduleId: module.id });
      assertLessonMath(parsed);
      module.script = enrichScript(parsed);
      module.status = "ready";
      module.error = undefined;
      course.updatedAt = Date.now();
      return module;
    } catch {
      // The cached payload is genuinely unusable; regenerate it below.
    }
  }

  module.error = undefined;
  await generateOne({ course, index, profile: course.profile, send: () => {} });
  return course.modules[index];
}

/** Run `fn` over `items` with at most `size` promises in flight. */
async function mapPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
