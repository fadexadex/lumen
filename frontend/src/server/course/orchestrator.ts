import { streamRoadmap, streamLesson, repairLesson } from "./generate";
import { enrichScript } from "@/lib/course-gen/math";
import { lessonScriptSchema } from "@/lib/course-gen/schemas";
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
      raw = await streamLesson({
        profile,
        module: mod,
        priorModules,
        onPartial: (partial) =>
          send({ type: "module_partial", id: mod.id, partial: partial as Partial<LessonScript> }),
      });
    } catch (streamErr) {
      // One repair pass on the stronger model before giving up.
      raw = await repairLesson({ profile, module: mod, priorModules, cause: errMsg(streamErr) });
    }

    // Re-parse defensively, force the correct moduleId, then let the server own
    // the diagram arithmetic (roots/vertex).
    const parsed = lessonScriptSchema.parse({ ...(raw as object), moduleId: mod.id });
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
