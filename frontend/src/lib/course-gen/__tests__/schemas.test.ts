import { describe, expect, it } from "vitest";
import { lessonScriptSchema, roadmapSchema } from "../schemas";
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
    expect(() => lessonScriptSchema.parse({ moduleId: "m1", title: "Lesson", steps })).toThrow(
      /match one option/,
    );
  });

  it("rejects a zero parabola coefficient", () => {
    expect(() =>
      lessonScriptSchema.parse({
        moduleId: "m1",
        title: "Lesson",
        steps: validSteps,
        diagram: { parabola: { a: 0, b: 1, c: 2 } },
      }),
    ).toThrow();
  });
});

describe("generated lesson math", () => {
  it("accepts valid KaTeX and rejects malformed expressions", () => {
    const script = lessonScriptSchema.parse({ moduleId: "m1", title: "Lesson", steps: validSteps });
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
});
