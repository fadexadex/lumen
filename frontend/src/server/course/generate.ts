import { streamObject, generateObject } from "ai";
import { mistral } from "@ai-sdk/mistral";
import { roadmapSchema, lessonScriptSchema, lessonContentSchema } from "@/lib/course-gen/schemas";
import type { LearnerProfile, RoadmapModule } from "@/lib/types";

const SMALL = "mistral-small-latest";
const LARGE = "mistral-large-latest";

type LessonModule = Pick<RoadmapModule, "id" | "title" | "blurb">;

/**
 * Stream a course outline. Calls `onPartial(modules)` each time the model emits
 * another module — that drives the roadmap pop-in / onboarding action feed.
 */
export async function streamRoadmap(
  profile: LearnerProfile,
  onPartial: (modules: Partial<RoadmapModule>[]) => void,
) {
  const result = streamObject({
    model: mistral(SMALL),
    schema: roadmapSchema,
    prompt: buildRoadmapPrompt(profile),
  });

  let lastLen = 0;
  for await (const partial of result.partialObjectStream) {
    const modules = (partial?.modules ?? []).filter(
      (m): m is Partial<RoadmapModule> => !!m && !!m.title,
    );
    if (modules.length !== lastLen) {
      lastLen = modules.length;
      onPartial(modules);
    }
  }
  return await result.object;
}

/**
 * Stream a single lesson (Wave A content). Calls `onPartial` for skeleton UX.
 * Returns the raw validated script (before diagram enrichment).
 */
export async function streamLesson(args: {
  profile: LearnerProfile;
  module: LessonModule;
  priorModules: LessonModule[];
  onPartial: (partial: unknown) => void;
}) {
  const result = streamObject({
    model: mistral(SMALL),
    schema: lessonScriptSchema,
    prompt: buildLessonPrompt(args),
  });
  for await (const partial of result.partialObjectStream) {
    args.onPartial(partial);
  }
  return await result.object;
}

/**
 * Repair pass: mistral-small streaming occasionally emits JSON that misses the
 * schema. Retry once, non-streamed, on the stronger model.
 */
export async function repairLesson(args: {
  profile: LearnerProfile;
  module: LessonModule;
  priorModules: LessonModule[];
  cause?: string;
}) {
  const { object } = await generateObject({
    model: mistral(LARGE),
    schema: lessonScriptSchema,
    prompt: `${buildLessonPrompt(args)}

A previous attempt failed schema validation (${args.cause ?? "invalid JSON"}).
Return ONLY a valid LessonScript JSON object that matches the schema exactly.
moduleId MUST be "${args.module.id}". Do not add commentary.`,
  });
  return object;
}

/** Last-resort content pass. The server attaches a trusted step visual afterward. */
export async function repairLessonContent(args: {
  profile: LearnerProfile;
  module: LessonModule;
  priorModules: LessonModule[];
  cause?: string;
}) {
  const { object } = await generateObject({
    model: mistral(LARGE),
    schema: lessonContentSchema,
    prompt: `${buildLessonPrompt(args)}

Both attempts to generate the rich visual object failed (${args.cause ?? "invalid visual JSON"}).
Return the core lesson content only. Omit visual entirely; the server will attach a safe visual.
Return ONLY valid JSON matching the provided schema. moduleId MUST be "${args.module.id}".`,
  });
  return object;
}

function buildRoadmapPrompt(p: LearnerProfile) {
  return `
You are Lumen, a calm, encouraging tutor designing a learning path.
Topic: ${p.topic}
Grade: ${p.grade}
Learning style: ${p.style}

Return 5-8 modules that progress from intuition -> practice -> mastery.
- Module ids: short kebab-case, e.g. "quad-intro", "vertex-and-roots".
- Titles: plain and inviting, no marketing fluff.
- Blurbs: one short sentence describing what the learner will get.
Order matters: each module should build on the ones before it.
`.trim();
}

function buildLessonPrompt(args: {
  profile: LearnerProfile;
  module: LessonModule;
  priorModules: LessonModule[];
}) {
  const { profile, module, priorModules } = args;
  const priorTitles = priorModules.map((m) => m.title).join(", ") || "(none yet)";
  return `
You are Lumen teaching "${module.title}" on a calm interactive whiteboard.
Module goal: ${module.blurb}
Learner: grade ${profile.grade}, prefers "${profile.style}" learning.
Earlier modules (build on these, don't repeat): ${priorTitles}

Write a LessonScript with 3-7 steps mixing "explanation", "example", and "practice".
Rules:
- moduleId MUST be exactly "${module.id}".
- Every math field MUST be valid KaTeX: use x^2, \\frac{a}{b}, \\pm, \\sqrt{}. No unicode math operators.
- Prose fields must be plain text, not Markdown. Put inline math in $...$ and standalone equations in math fields.
- Practice steps MUST include an "answer"; if "options" are given, the answer MUST match one option exactly.
- Every lesson MUST include visual. Use kind "animation" with 2-5 coherent scenes whenever a
  visual can improve understanding. Use kind "none" only when a visual would genuinely add no
  instructional value, and state the specific reason.
- Choose the visual primitive by meaning: plotFunction for graphs; numberLineWalk for ordering,
  signed movement, intervals, or inequalities; algebraTiles for combining/factoring terms;
  balanceScale for preserving equality; partitionGrid for area, arrays, multiplication, or
  probability; fractionBar for fractions/ratios; countObjects for grouping; geometryTransform
  for spatial transformations; stepReveal for a calculation whose changing lines are the visual.
- Sequence scenes so each one adds one idea. Keep narration to one short spoken sentence. Vary
  primitives when that makes the concept clearer; never add a decorative or unrelated graphic.
- Set visual.advance to "step". All values must be internally consistent and inside the schema.
- If a visual scene is plotFunction with fn "parabola", also include diagram.parabola with the
  same a, b, c ONLY (no roots or vertex). This preserves the live tutor's interactive graph tools.
- Keep plot coefficients and other counts small enough to read on a classroom whiteboard.
- Voice: warm, short sentences, age-appropriate for grade ${profile.grade}.
- Style "${profile.style}": stories -> narrative framing; examples -> more worked lines;
  step-by-step -> numbered clarity; challenge -> leaner prose, harder practice.
`.trim();
}
