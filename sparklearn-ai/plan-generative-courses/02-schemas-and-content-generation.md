# 02 · Schemas & Content Generation

Schema-first generation is what makes generative courses safe for MathCanvas. The model never
writes free HTML into the board — it fills **Zod schemas** that already match `src/lib/types.ts`.

---

## 1. Mirror existing types as Zod

`src/lib/course-gen/schemas.ts`:

```ts
import { z } from "zod";

export const roadmapModuleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(3).max(80),
  blurb: z.string().min(3).max(160),
});

export const roadmapSchema = z.object({
  topic: z.string(),
  modules: z.array(roadmapModuleSchema).min(4).max(10),
});

export const stepExplanationSchema = z.object({
  kind: z.literal("explanation"),
  title: z.string(),
  body: z.string().min(20).max(800),
  math: z.string().optional(), // KaTeX-compatible LaTeX
});

export const stepExampleSchema = z.object({
  kind: z.literal("example"),
  title: z.string(),
  lines: z
    .array(
      z.object({
        text: z.string().optional(),
        math: z.string().optional(),
      }),
    )
    .min(1)
    .max(12),
});

export const stepPracticeSchema = z.object({
  kind: z.literal("practice"),
  title: z.string(),
  prompt: z.string(),
  math: z.string().optional(),
  options: z.array(z.string()).min(2).max(5).optional(),
  answer: z.string(),
  hint: z.string().optional(),
});

export const lessonStepSchema = z.discriminatedUnion("kind", [
  stepExplanationSchema,
  stepExampleSchema,
  stepPracticeSchema,
]);

export const diagramSchema = z
  .object({
    parabola: z
      .object({
        a: z.number(),
        b: z.number(),
        c: z.number(),
        roots: z.array(z.number()).optional(),
        vertex: z.tuple([z.number(), z.number()]).optional(),
      })
      .optional(),
    tiles: z
      .object({
        xSquared: z.number().int().nonnegative(),
        x: z.number().int(),
        unit: z.number().int(),
        factored: z.tuple([z.string(), z.string()]).optional(),
      })
      .optional(),
    numberLine: z
      .object({
        points: z.array(z.object({ x: z.number(), label: z.string().optional() })),
        range: z.tuple([z.number(), z.number()]),
      })
      .optional(),
    captions: z.array(z.string()).optional(),
  })
  .optional();

export const lessonScriptSchema = z.object({
  moduleId: z.string(),
  title: z.string(),
  steps: z.array(lessonStepSchema).min(3).max(10),
  diagram: diagramSchema,
});
```

These schemas are the **source of truth** for generation. TypeScript types can be inferred:

```ts
export type GeneratedLessonScript = z.infer<typeof lessonScriptSchema>;
```

Keep them in sync with `types.ts` (or generate types from Zod to avoid drift).

---

## 2. Roadmap generation (fast path)

```ts
import { generateObject } from "ai";
import { mistral } from "@ai-sdk/mistral";

export async function generateRoadmap(profile: LearnerProfile) {
  const { object } = await generateObject({
    model: mistral("mistral-small-latest"),
    schema: roadmapSchema,
    prompt: `
You are Lumen, designing a calm learning path.
Topic: ${profile.topic}
Grade: ${profile.grade}
Learning style: ${profile.style}

Return 5–8 modules that progress from intuition → practice → mastery.
Module ids: short kebab-case (e.g. "quad-intro", "vertex-and-roots").
Blurbs: one short sentence, no marketing fluff.
`.trim(),
  });
  return object;
}
```

Target: **&lt; 5 seconds**.

### Stream the outline for the "planning" animation

The learner should **watch Lumen decide the shape of the course** — how many modules, what they
are — before any lesson content exists. Use `streamObject(roadmapSchema)` instead of
`generateObject` so modules **pop in one at a time** as the model emits them. This is the first
thing the learner sees and sells the "it's really thinking" moment (see `06 §7`, which removes the
old cosmetic delay).

```ts
import { streamObject } from "ai";
const { partialObjectStream } = streamObject({
  model: mistral("mistral-small-latest"),
  schema: roadmapSchema,
  prompt: buildRoadmapPrompt(profile),
});
for await (const partial of partialObjectStream) {
  send("roadmap_partial", partial); // client animates each new module card in
}
```

After the roadmap resolves, stream **statuses** for lessons (below) rather than the objects.

---

## 3. Lesson generation (streamed)

```ts
import { streamObject } from "ai";
import { mistral } from "@ai-sdk/mistral";

export function streamLesson(args: {
  profile: LearnerProfile;
  module: { id: string; title: string; blurb: string };
  priorModules: { title: string }[];
  brief?: CuratedBrief | null;
}) {
  return streamObject({
    model: mistral("mistral-small-latest"),
    schema: lessonScriptSchema,
    prompt: buildLessonPrompt(args),
  });
}
```

### Prompt rules (critical for math)

```
- Every math field MUST be valid KaTeX (e.g. "x^2 - 5x + 6", "\\frac{-b}{2a}").
- Prefer ascii-friendly latex: x^2, \\pm, \\frac{a}{b}. No Unicode operators in math fields.
- Practice steps MUST include a correct answer matching one option if options exist.
- For quadratic graphing modules, include diagram.parabola with consistent a,b,c and
  optional roots/vertex that MATCH the equation (compute them; don't invent).
- Voice: warm, short sentences, age-appropriate for grade ${grade}.
- Style "${style}": stories → narrative framing; examples → more worked lines;
  step-by-step → numbered clarity; challenge → harder practice, leaner prose.
- Do not reference previous modules by wrong titles; build only on: ${priorTitles}.
```

### Partial streaming to the client

`streamObject` yields partial objects. Map to SSE:

```ts
for await (const partial of result.partialObjectStream) {
  send({ type: "module_partial", id: moduleId, partial });
}
const final = await result.object;
const checked = lessonScriptSchema.parse(final);
await validateMathConsistency(checked); // custom
send({ type: "module_ready", id: moduleId, script: checked });
```

MathCanvas should **not** mount a partial script until `ready` (partials are for a skeleton UI /
progress text only). Or: allow partial only for `title` + first explanation body for a “typing
in” effect — never for practice answers until complete.

---

## 4. Validation & repair loop

After `parse`:

1. **Schema** — Zod.
2. **Math consistency** — if `diagram.parabola` present, recompute roots/vertex from a,b,c;
   overwrite model’s roots if wrong (don’t trust the LLM for arithmetic).
3. **KaTeX smoke** — try `katex.renderToString(math, { throwOnError: true })` for each math field;
   on failure, strip or repair that field.
4. **Answer check** — if options exist, `answer` must be ∈ options (or normalize).

On failure: one **repair** call:

```ts
generateObject({
  model: mistral("mistral-large-latest"), // stronger model ONLY for repair
  schema: lessonScriptSchema,
  prompt: `Fix this lesson script. Errors: ${errors}. Original JSON: ${json}`,
});
```

Two failures → `status: failed`.

---

## 5. Deterministic diagram helpers

```ts
export function enrichParabola(p: { a: number; b: number; c: number }) {
  const disc = p.b * p.b - 4 * p.a * p.c;
  const vertex: [number, number] = [-p.b / (2 * p.a), p.c - (p.b * p.b) / (4 * p.a)];
  const roots =
    disc < 0 || p.a === 0
      ? []
      : disc === 0
        ? [-p.b / (2 * p.a)]
        : [(-p.b + Math.sqrt(disc)) / (2 * p.a), (-p.b - Math.sqrt(disc)) / (2 * p.a)];
  return { ...p, roots, vertex };
}
```

Always run this server-side before persisting. The model suggests a,b,c; **you** own roots/vertex.
That keeps Live board-targets (`../plan/05`) correct.

---

## 6. Caching & idempotency

- Cache key: `hash(topic|grade|style|moduleId|briefVersion)`.
- Same learner re-entering a ready module → serve cache, no re-gen.
- “Regenerate” button bumps a `nonce` in the key.

## 7. Free-tier model notes (Mistral)

- **`mistral-small-latest` for volume** (roadmap + N lessons + session summaries). Fast, cheap,
  supports JSON-schema structured output and tool calls — the workhorse.
- **`mistral-large-latest` only for repair** and final practice/answer checking, where small is
  occasionally weak on arithmetic-sensitive fixes.
- The ~1M free-token budget comfortably covers a full course + retries; you are not TPM-boxed the
  way Gemini Live is (`../plan/11`).
- Cap `max(modules) = 8` on free demos anyway (latency + curation cost, not token cost).
- Mistral honours `response_format`/structured outputs; if a `streamObject` call ever emits loose
  JSON, tighten via the SDK's schema mode before falling back to the repair loop.

Next: `03` — Vercel generative UI tools → React components.
