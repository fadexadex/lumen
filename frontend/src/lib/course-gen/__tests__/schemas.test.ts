import { describe, expect, it } from "vitest";
import {
  lessonContentGenerationSchema,
  lessonScriptSchema,
  normalizeGeneratedLessonContent,
  roadmapSchema,
} from "../schemas";
import { assertLessonMath } from "../validation";

const validSteps = [
  {
    kind: "explanation" as const,
    title: "Idea",
    body: "A sufficiently detailed explanation.",
    math: "x^2 + 1",
  },
  { kind: "example" as const, title: "Example", lines: [{ math: "x = \\frac{1}{2}" }] },
  {
    kind: "practice" as const,
    title: "Try it",
    prompt: "Which answer is correct?",
    options: ["1", "2"],
    answer: "2",
  },
];

const validVisual = {
  kind: "animation" as const,
  title: "See the steps",
  goal: "Show how each equivalent line follows from the last.",
  advance: "step" as const,
  scenes: [
    {
      primitive: "stepReveal" as const,
      narration: "Each line keeps the same solution.",
      lines: [{ math: "x + 2 = 5" }, { math: "x = 3" }],
    },
  ],
};

describe("generated course schemas", () => {
  it("rejects duplicate module ids", () => {
    const module = { id: "same-id", title: "First module", blurb: "A useful module" };
    expect(() =>
      roadmapSchema.parse({ topic: "Algebra", modules: [module, module, module, module] }),
    ).toThrow(/unique/);
  });

  it("rejects a practice answer that is not one of the options", () => {
    const steps = validSteps.map((step) => ({ ...step }));
    steps[2] = { ...steps[2], answer: "3" } as (typeof validSteps)[number];
    expect(() =>
      lessonScriptSchema.parse({ moduleId: "m1", title: "Lesson", steps, visual: validVisual }),
    ).toThrow(/match one option/);
  });

  it("rejects a zero parabola coefficient", () => {
    expect(() =>
      lessonScriptSchema.parse({
        moduleId: "m1",
        title: "Lesson",
        steps: validSteps,
        visual: validVisual,
        diagram: { parabola: { a: 0, b: 1, c: 2 } },
      }),
    ).toThrow();
  });

  it("recovers usable lesson content when generated choices do not match the answer", () => {
    const generated = lessonContentGenerationSchema.parse({
      moduleId: "m1",
      title: "Lesson",
      steps: [
        validSteps[0],
        validSteps[1],
        {
          kind: "practice",
          title: "Classify all four",
          prompt: "Classify the equations in order.",
          options: ["yes", "no", "yes", "no"],
          answer: "yes, no, yes, no",
        },
      ],
      // Structured-output models sometimes emit incomplete optional diagrams.
      diagram: { numberLine: { points: [] } },
    });

    const recovered = normalizeGeneratedLessonContent(generated);

    expect(recovered.steps[2]).toMatchObject({
      kind: "practice",
      answer: "yes, no, yes, no",
    });
    expect(recovered.steps[2]).not.toHaveProperty("options");
    expect(recovered).not.toHaveProperty("diagram");
  });
});

describe("generated lesson math", () => {
  it("accepts valid KaTeX and rejects malformed expressions", () => {
    const script = lessonScriptSchema.parse({
      moduleId: "m1",
      title: "Lesson",
      steps: validSteps,
      visual: validVisual,
    });
    expect(() => assertLessonMath(script)).not.toThrow();
    expect(() =>
      assertLessonMath({
        ...script,
        steps: [
          { ...script.steps[0], kind: "explanation", math: "\\frac{" },
          ...script.steps.slice(1),
        ],
      }),
    ).toThrow(/invalid KaTeX/);
  });

  it("requires either a trusted animation or a deliberate none", () => {
    expect(() =>
      lessonScriptSchema.parse({ moduleId: "m1", title: "Lesson", steps: validSteps }),
    ).toThrow();

    expect(() =>
      lessonScriptSchema.parse({
        moduleId: "m1",
        title: "Lesson",
        steps: validSteps,
        visual: { kind: "none", reason: "A visual would not clarify this review lesson." },
      }),
    ).not.toThrow();
  });

  it("rejects internally inconsistent visual parameters", () => {
    expect(() =>
      lessonScriptSchema.parse({
        moduleId: "m1",
        title: "Lesson",
        steps: validSteps,
        visual: {
          kind: "animation",
          title: "Number line",
          goal: "Walk through signed values.",
          advance: "step",
          scenes: [
            {
              primitive: "numberLineWalk",
              narration: "Move to a value outside the line.",
              range: [-5, 5],
              start: 0,
              hops: [{ to: 9 }],
            },
          ],
        },
      }),
    ).toThrow(/number-line positions/);
  });
});
