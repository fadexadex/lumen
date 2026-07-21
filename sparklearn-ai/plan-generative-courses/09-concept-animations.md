# 09 · Concept Animations (Dynamic, Unpredictable Board)

The product goal: the learner **does not know what to expect on the board**. A concept can be
broken down by a purpose-built animation — a balance scale for equations, a partition grid for
factoring, a morphing curve for transformations — chosen and directed by the model on the fly.

The hard constraint from `00` still holds: **the model never emits arbitrary HTML/JS/CSS.** We
get unpredictability from **composition, sequencing, and parameters over a trusted primitive
library** — not from letting the model invent code.

Two levels, shipped in order:

- **Level A (now)** — Rich composable primitive library. ~15–25 animation primitives; the model
  picks, parameterizes, and **sequences** them into a multi-scene storyboard. This doc specifies A.
- **Level B (later)** — Constrained keyframe DSL over the same primitives for genuinely
  "invented" motion. Sketched in §7; do not build until A is solid.

---

## 1. The storyboard model

The unit the model generates is a **ConceptAnimation**: an ordered list of scenes. Each scene
picks one primitive, gives it typed params, and carries a one-line narration the tutor can speak
(or that renders as a caption). Novelty = which primitives, in what order, with what params.

```
ConceptAnimation
 ├─ scene 0 · { primitive: "balanceScale", params: {...}, narration: "..." }
 ├─ scene 1 · { primitive: "morphCurve",   params: {...}, narration: "..." }
 └─ scene 2 · { primitive: "partitionGrid",params: {...}, narration: "..." }
```

The renderer plays scenes in order (auto-advance on a timer, on tutor voice cue, or on learner
"next"). Each primitive is a deterministic React/SVG component you own.

---

## 2. Schema (`src/lib/course-gen/schemas.ts`, additive)

```ts
export const conceptSceneSchema = z.discriminatedUnion("primitive", [
  z.object({
    primitive: z.literal("plotFunction"),
    narration: z.string().max(160),
    fn: z.enum(["parabola", "line", "abs", "cubic", "sqrt", "exp", "sin"]),
    coeffs: z.record(z.string(), z.number()), // {a,b,c} etc — enriched server-side
    highlight: z.array(z.enum(["vertex", "root", "intercept", "asymptote"])).optional(),
  }),
  z.object({
    primitive: z.literal("morphCurve"),
    narration: z.string().max(160),
    from: z.record(z.string(), z.number()),
    to: z.record(z.string(), z.number()),
    durationMs: z.number().int().min(400).max(6000),
  }),
  z.object({
    primitive: z.literal("balanceScale"),
    narration: z.string().max(160),
    left: z.array(z.object({ label: z.string(), weight: z.number() })).max(6),
    right: z.array(z.object({ label: z.string(), weight: z.number() })).max(6),
    op: z.enum(["add", "subtract", "divide", "multiply"]).optional(),
  }),
  z.object({
    primitive: z.literal("partitionGrid"),
    narration: z.string().max(160),
    rows: z.number().int().min(1).max(12),
    cols: z.number().int().min(1).max(12),
    labels: z.object({ top: z.string().optional(), side: z.string().optional() }).optional(),
    fill: z.array(z.object({ r: z.number().int(), c: z.number().int(), color: z.string() })).optional(),
  }),
  z.object({
    primitive: z.literal("numberLineWalk"),
    narration: z.string().max(160),
    range: z.tuple([z.number(), z.number()]),
    hops: z.array(z.object({ to: z.number(), label: z.string().optional() })).max(12),
  }),
  z.object({
    primitive: z.literal("countObjects"),
    narration: z.string().max(160),
    shape: z.enum(["dot", "square", "apple", "star"]),
    total: z.number().int().min(1).max(60),
    groups: z.number().int().min(1).max(12).optional(),
  }),
  z.object({
    primitive: z.literal("vectorField"),
    narration: z.string().max(160),
    kind: z.enum(["gradient", "flow", "force"]),
    density: z.number().int().min(4).max(16).optional(),
  }),
  z.object({
    primitive: z.literal("geometryTransform"),
    narration: z.string().max(160),
    shape: z.enum(["triangle", "square", "circle", "polygon"]),
    transform: z.enum(["translate", "rotate", "reflect", "scale", "shear"]),
    amount: z.number(),
  }),
  z.object({
    primitive: z.literal("stepReveal"),
    narration: z.string().max(160),
    lines: z.array(z.object({ text: z.string().optional(), math: z.string().optional() })).max(10),
  }),
  z.object({
    primitive: z.literal("fractionBar"),
    narration: z.string().max(160),
    parts: z.number().int().min(1).max(24),
    shaded: z.number().int().min(0).max(24),
    compareTo: z.object({ parts: z.number().int(), shaded: z.number().int() }).optional(),
  }),
  // …extend toward ~15–25. Keep every primitive deterministic + param-only.
]);

export const conceptAnimationSchema = z.object({
  title: z.string().max(80),
  goal: z.string().max(160), // the concept this animation breaks down
  advance: z.enum(["auto", "voice", "manual"]).default("voice"),
  scenes: z.array(conceptSceneSchema).min(1).max(8),
});
export type ConceptAnimation = z.infer<typeof conceptAnimationSchema>;
```

Add `conceptAnimation: conceptAnimationSchema.optional()` to `lessonScriptSchema` so a lesson step
can carry a full breakdown, **and** expose it as a Gen-UI tool (`showConceptAnimation`) so Live /
studio can drop one mid-conversation.

---

## 3. Primitive registry

One registry, imported by both the schema (which primitives exist) and the renderer (how each
draws). Mirrors `ui-registry.ts` from `03`.

```ts
// src/lib/course-gen/animation-registry.ts
import { PlotFunction } from "@/components/animations/PlotFunction";
import { MorphCurve } from "@/components/animations/MorphCurve";
import { BalanceScale } from "@/components/animations/BalanceScale";
// …
export const ANIMATION_PRIMITIVES = {
  plotFunction: PlotFunction,
  morphCurve: MorphCurve,
  balanceScale: BalanceScale,
  partitionGrid: PartitionGrid,
  numberLineWalk: NumberLineWalk,
  countObjects: CountObjects,
  vectorField: VectorField,
  geometryTransform: GeometryTransform,
  stepReveal: StepReveal,
  fractionBar: FractionBar,
} as const;
```

Renderer:

```tsx
export function ConceptAnimationPlayer({ anim }: { anim: ConceptAnimation }) {
  const [i, setI] = useState(0);
  const scene = anim.scenes[i];
  const Primitive = ANIMATION_PRIMITIVES[scene.primitive];
  return (
    <div className="concept-anim">
      <Primitive key={i} {...scene} onDone={() => advance()} />
      <Caption text={scene.narration} />
      {/* advance: timer (auto) | tutor voice cue (voice) | learner tap (manual) */}
    </div>
  );
}
```

Each primitive component is built once with Framer Motion / SVG and is fully deterministic given
its params. The model can only reach behavior that a primitive already implements.

---

## 4. How the model directs it (generation)

Concept animations are generated by **Mistral** (`mistral-small-latest`) — either baked into the
lesson script at generation time, or emitted live via the `showConceptAnimation` Gen-UI tool.

Prompt rules (add to `buildLessonPrompt` / the Gen-UI system prompt):

```
- When a concept is easier to SEE than to read, add a conceptAnimation that breaks it down.
- Choose the primitive that fits the idea (balanceScale for solving equations, partitionGrid
  for factoring/area models, morphCurve for transformations, numberLineWalk for integers…).
- Sequence 2–5 scenes that build the intuition step by step. Vary primitives across modules so
  the board feels fresh — do not default to the same primitive every time.
- Every numeric param must be self-consistent; graph/curve params are recomputed server-side.
- narration is ONE short spoken line per scene.
```

The "unpredictability" is intentional and safe: the learner can't predict *which* primitive or
*sequence* they'll get, but every primitive is a component you trust.

---

## 5. Validation (reuse `02` loop)

- Schema (Zod discriminated union) — unknown primitive ⇒ reject.
- **Enrich math server-side**: `plotFunction` / `morphCurve` coeffs run through `enrichParabola`
  and friends; the model's roots/vertex/intercepts are overwritten with computed values.
- Param bounds already in schema (grid ≤ 12×12, scenes ≤ 8) cap runaway animations.
- One repair call (`mistral-large-latest`) on failure, then fall back to a plain `stepReveal`.

---

## 6. Integration with Live tutor (`../plan/`)

- When Live is active, prefer the tutor **narrating an existing on-board animation** over mounting
  a second one — one visual authority (`../plan/07`).
- Add a Live RPC command `play_concept_scene(target, sceneIndex)` so the voice agent can advance
  scenes in time with speech (`advance: "voice"`). Keeps the payload tiny (an index), respecting
  the Gemini Live budget in `../plan/11`.
- Named targets inside an animation (`scene2.vertex`) resolve through the same `board-targets`
  path so "circle the vertex" still works on an animated scene.

---

## 7. Level B (later — do not build yet)

A constrained keyframe DSL over the same primitives: the model supplies ordered keyframes
(`{ t, prop, value, ease }`) for a whitelisted set of SVG props on named elements. Genuinely
"invented" motion, still no code execution. Gate it behind heavy validation (prop allowlist,
value clamps, max keyframes) and a preview/repair pass. Revisit once Level A ships and the
primitive catalog has proven itself in demos.

---

## 8. Build checklist

- [ ] `conceptAnimationSchema` + `conceptScene` union in `schemas.ts`; wired into `lessonScript`.
- [ ] `animation-registry.ts` + first 8–10 primitive components (Framer Motion / SVG).
- [ ] `ConceptAnimationPlayer` with the three advance modes.
- [ ] `showConceptAnimation` Gen-UI tool + Live RPC `play_concept_scene`.
- [ ] Server-side math enrichment for `plotFunction` / `morphCurve`.
- [ ] Prompt rules added; a demo module renders ≥2 different primitives.

Next: `../plan/11-live-context-budget.md` for how Live stays under 65k TPM while narrating these.
