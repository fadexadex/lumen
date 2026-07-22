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

export const roadmapSchema = z
  .object({
    topic: z.string().min(1).max(80),
    modules: z.array(roadmapModuleSchema).min(4).max(10),
  })
  .superRefine(({ modules }, ctx) => {
    const seen = new Set<string>();
    modules.forEach((module, index) => {
      if (seen.has(module.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["modules", index, "id"],
          message: "module ids must be unique",
        });
      }
      seen.add(module.id);
    });
  });
export type RoadmapInput = z.infer<typeof roadmapSchema>;

/* ---------- lesson steps ---------- */

export const stepExplanationSchema = z.object({
  kind: z.literal("explanation"),
  title: z.string().min(2).max(120),
  body: z.string().min(20).max(800),
  math: z.string().max(200).optional(), // KaTeX-compatible LaTeX
});

const workedLineSchema = z
  .object({ text: z.string().max(300).optional(), math: z.string().max(200).optional() })
  .refine((line) => Boolean(line.text?.trim() || line.math?.trim()), {
    message: "each worked line needs text or math",
  });

export const stepExampleSchema = z.object({
  kind: z.literal("example"),
  title: z.string().min(2).max(120),
  lines: z.array(workedLineSchema).min(1).max(12),
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

/* ---------- trusted generative visuals ---------- */

const sceneNarration = z.string().min(4).max(160);
const bounded = z.number().finite().min(-100).max(100);

const plotFunctionSceneSchema = z.object({
  primitive: z.literal("plotFunction"),
  narration: sceneNarration,
  fn: z.enum(["parabola", "line", "absolute", "cubic"]),
  a: bounded,
  b: bounded,
  c: bounded,
  highlight: z
    .array(z.enum(["vertex", "roots", "intercept"]))
    .max(3)
    .optional(),
});

const numberLineWalkSceneSchema = z.object({
  primitive: z.literal("numberLineWalk"),
  narration: sceneNarration,
  range: z.tuple([bounded, bounded]),
  start: bounded,
  hops: z
    .array(z.object({ to: bounded, label: z.string().max(40).optional() }))
    .min(1)
    .max(10),
});

const algebraTilesSceneSchema = z.object({
  primitive: z.literal("algebraTiles"),
  narration: sceneNarration,
  xSquared: z.number().int().min(-8).max(8),
  x: z.number().int().min(-12).max(12),
  unit: z.number().int().min(-24).max(24),
  factored: z.tuple([z.string().min(1).max(80), z.string().min(1).max(80)]).optional(),
});

const balanceScaleSceneSchema = z.object({
  primitive: z.literal("balanceScale"),
  narration: sceneNarration,
  left: z
    .array(z.object({ label: z.string().min(1).max(30), weight: bounded }))
    .min(1)
    .max(5),
  right: z
    .array(z.object({ label: z.string().min(1).max(30), weight: bounded }))
    .min(1)
    .max(5),
  operation: z.string().max(60).optional(),
});

const partitionGridSceneSchema = z.object({
  primitive: z.literal("partitionGrid"),
  narration: sceneNarration,
  rows: z.number().int().min(1).max(12),
  cols: z.number().int().min(1).max(12),
  shaded: z.number().int().min(0).max(144),
  rowLabel: z.string().max(30).optional(),
  colLabel: z.string().max(30).optional(),
});

const fractionBarSceneSchema = z.object({
  primitive: z.literal("fractionBar"),
  narration: sceneNarration,
  parts: z.number().int().min(1).max(24),
  shaded: z.number().int().min(0).max(24),
  compareTo: z
    .object({
      parts: z.number().int().min(1).max(24),
      shaded: z.number().int().min(0).max(24),
    })
    .optional(),
});

const countObjectsSceneSchema = z.object({
  primitive: z.literal("countObjects"),
  narration: sceneNarration,
  shape: z.enum(["dot", "square", "star"]),
  total: z.number().int().min(1).max(60),
  groups: z.number().int().min(1).max(12),
});

const geometryTransformSceneSchema = z.object({
  primitive: z.literal("geometryTransform"),
  narration: sceneNarration,
  shape: z.enum(["triangle", "square", "rectangle"]),
  transform: z.enum(["translate", "rotate", "reflect", "scale"]),
  amount: z.number().finite().min(-360).max(360),
});

const stepRevealSceneSchema = z.object({
  primitive: z.literal("stepReveal"),
  narration: sceneNarration,
  lines: z.array(workedLineSchema).min(1).max(8),
});

export const conceptSceneSchema = z.discriminatedUnion("primitive", [
  plotFunctionSceneSchema,
  numberLineWalkSceneSchema,
  algebraTilesSceneSchema,
  balanceScaleSceneSchema,
  partitionGridSceneSchema,
  fractionBarSceneSchema,
  countObjectsSceneSchema,
  geometryTransformSceneSchema,
  stepRevealSceneSchema,
]);

const conceptAnimationBaseSchema = z.object({
  kind: z.literal("animation"),
  title: z.string().min(2).max(80),
  goal: z.string().min(4).max(160),
  advance: z.literal("step").default("step"),
  scenes: z.array(conceptSceneSchema).min(1).max(5),
});

function validateConceptScenes(
  scenes: z.infer<typeof conceptAnimationBaseSchema>["scenes"],
  ctx: z.RefinementCtx,
) {
  scenes.forEach((scene, index) => {
    if (scene.primitive === "plotFunction" && scene.a === 0 && scene.fn !== "line") {
      ctx.addIssue({ code: "custom", path: ["scenes", index, "a"], message: "a must be non-zero" });
    }
    if (scene.primitive === "numberLineWalk") {
      const [min, max] = scene.range;
      if (
        min >= max ||
        scene.start < min ||
        scene.start > max ||
        scene.hops.some((hop) => hop.to < min || hop.to > max)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["scenes", index],
          message: "number-line positions must fit an increasing range",
        });
      }
    }
    if (scene.primitive === "partitionGrid" && scene.shaded > scene.rows * scene.cols) {
      ctx.addIssue({
        code: "custom",
        path: ["scenes", index, "shaded"],
        message: "shaded cells exceed the grid",
      });
    }
    if (scene.primitive === "fractionBar") {
      if (
        scene.shaded > scene.parts ||
        (scene.compareTo && scene.compareTo.shaded > scene.compareTo.parts)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["scenes", index],
          message: "shaded parts exceed total parts",
        });
      }
    }
  });
}

export const conceptAnimationSchema = conceptAnimationBaseSchema.superRefine(({ scenes }, ctx) =>
  validateConceptScenes(scenes, ctx),
);

export const lessonVisualSchema = z
  .discriminatedUnion("kind", [
    conceptAnimationBaseSchema,
    z.object({ kind: z.literal("none"), reason: z.string().min(8).max(160) }),
  ])
  .superRefine((visual, ctx) => {
    if (visual.kind === "animation") validateConceptScenes(visual.scenes, ctx);
  });

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
    parabola: z
      .object({ a: z.number().refine((a) => a !== 0), b: z.number(), c: z.number() })
      .optional(),
    tiles: tilesArgsSchema.optional(),
    numberLine: numberLineArgsSchema.optional(),
    captions: z.array(z.string().max(200)).max(8).optional(),
  })
  .optional();

const lessonCoreShape = {
  moduleId: z.string().min(1),
  title: z.string().min(2).max(120),
  steps: z.array(lessonStepSchema).min(3).max(10),
};

const lessonContentShape = {
  ...lessonCoreShape,
  diagram: diagramSchema,
};

function validatePracticeAnswers(steps: z.infer<typeof lessonStepSchema>[], ctx: z.RefinementCtx) {
  steps.forEach((step, index) => {
    if (step.kind === "practice" && step.options && !step.options.includes(step.answer)) {
      ctx.addIssue({
        code: "custom",
        path: ["steps", index, "answer"],
        message: "answer must exactly match one option",
      });
    }
  });
}

/** Simpler recovery schema used only after both rich-visual generation attempts fail. */
export const lessonContentSchema = z
  .object(lessonContentShape)
  .superRefine(({ steps }, ctx) => validatePracticeAnswers(steps, ctx));

/**
 * Provider-facing recovery schema. Keep this deliberately smaller than the
 * rendered lesson schema: optional diagrams and cross-field choice validation
 * are common structured-output failure points and can be handled safely on the
 * server after generation.
 */
export const lessonContentGenerationSchema = z.object(lessonCoreShape);

export function normalizeGeneratedLessonContent(
  content: z.infer<typeof lessonContentGenerationSchema>,
): z.infer<typeof lessonContentSchema> {
  const steps = content.steps.map((step) => {
    if (step.kind !== "practice" || !step.options || step.options.includes(step.answer)) {
      return step;
    }

    // A mismatched option list is unsafe as multiple-choice UI, but the model's
    // answer remains useful as a free-response exercise. Dropping only the
    // choices preserves the lesson rather than rejecting the whole module.
    const { options: _options, ...freeResponse } = step;
    return freeResponse;
  });

  return lessonContentSchema.parse({ ...content, steps });
}

export const lessonScriptSchema = z
  .object({ ...lessonContentShape, visual: lessonVisualSchema })
  .superRefine(({ steps }, ctx) => validatePracticeAnswers(steps, ctx));
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
  lines: z.array(workedLineSchema).min(1).max(16),
});

export const equationArgsSchema = z.object({
  latex: z.string().min(1).max(200),
  caption: z.string().max(160).optional(),
});
