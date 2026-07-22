import { z } from "zod";

/**
 * Zod mirrors of the rendered shapes in src/lib/types.ts. These are the source
 * of truth for generation: the model fills these schemas, never free HTML/JS.
 * Keep in sync with types.ts (LessonScript / Roadmap / LessonDiagram).
 */

export const roadmapModuleSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/, "kebab-case ids only")
    .min(3)
    .max(48),
  title: z.string().min(3).max(80),
  blurb: z.string().min(3).max(160),
});
export type RoadmapModuleInput = z.infer<typeof roadmapModuleSchema>;

export const roadmapSchema = z.object({
  topic: z.string().min(1).max(80),
  modules: z.array(roadmapModuleSchema).min(4).max(10),
});
export type RoadmapInput = z.infer<typeof roadmapSchema>;

/* ---------- lesson steps ---------- */

export const stepExplanationSchema = z.object({
  kind: z.literal("explanation"),
  title: z.string().min(2).max(120),
  body: z.string().min(20).max(800),
  math: z.string().max(200).optional(), // KaTeX-compatible LaTeX
});

export const stepExampleSchema = z.object({
  kind: z.literal("example"),
  title: z.string().min(2).max(120),
  lines: z
    .array(z.object({ text: z.string().max(300).optional(), math: z.string().max(200).optional() }))
    .min(1)
    .max(12),
});

export const stepPracticeSchema = z.object({
  kind: z.literal("practice"),
  title: z.string().min(2).max(120),
  prompt: z.string().min(4).max(400),
  math: z.string().max(200).optional(),
  options: z.array(z.string().max(120)).min(2).max(5).optional(),
  answer: z.string().min(1).max(200),
  hint: z.string().max(300).optional(),
});

export const lessonStepSchema = z.discriminatedUnion("kind", [
  stepExplanationSchema,
  stepExampleSchema,
  stepPracticeSchema,
]);

/* ---------- diagram (model suggests a,b,c; server owns roots/vertex) ---------- */

export const parabolaArgsSchema = z.object({
  a: z.number(),
  b: z.number(),
  c: z.number(),
  caption: z.string().max(160).optional(),
});

export const tilesArgsSchema = z.object({
  xSquared: z.number().int().nonnegative(),
  x: z.number().int(),
  unit: z.number().int(),
  factored: z.tuple([z.string(), z.string()]).optional(),
});

export const numberLineArgsSchema = z.object({
  points: z
    .array(z.object({ x: z.number(), label: z.string().max(40).optional() }))
    .min(1)
    .max(12),
  range: z.tuple([z.number(), z.number()]),
});

export const diagramSchema = z
  .object({
    // Model only provides a,b,c; roots/vertex are stripped and recomputed server-side.
    parabola: z.object({ a: z.number(), b: z.number(), c: z.number() }).optional(),
    tiles: tilesArgsSchema.optional(),
    numberLine: numberLineArgsSchema.optional(),
    captions: z.array(z.string().max(200)).max(8).optional(),
  })
  .optional();

export const lessonScriptSchema = z.object({
  moduleId: z.string().min(1),
  title: z.string().min(2).max(120),
  steps: z.array(lessonStepSchema).min(3).max(10),
  diagram: diagramSchema,
});
export type LessonScriptInput = z.infer<typeof lessonScriptSchema>;

/* ---------- generative-UI tool args (Channel B) ---------- */

export const practiceArgsSchema = z.object({
  prompt: z.string().min(4).max(400),
  options: z.array(z.string().max(120)).min(2).max(5),
  answer: z.string().min(1).max(200),
  hint: z.string().max(300).optional(),
});

export const workedArgsSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  lines: z
    .array(z.object({ text: z.string().max(300).optional(), math: z.string().max(200).optional() }))
    .min(1)
    .max(16),
});

export const equationArgsSchema = z.object({
  latex: z.string().min(1).max(200),
  caption: z.string().max(160).optional(),
});
