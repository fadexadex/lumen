import { describe, expect, it } from "vitest";
import { layoutScript, wrappedLineCount } from "../layout";
import type { LessonScript } from "@/lib/types";

describe("dynamic MathCanvas layout", () => {
  it("reserves space for a wrapped generated lesson title", () => {
    const script: LessonScript = {
      moduleId: "inequalities",
      title: "Understanding Inequalities and Their Symbols",
      steps: [
        {
          kind: "explanation",
          title: "What is an inequality?",
          body: "An inequality compares two values and tells us which value is larger or smaller.",
        },
        { kind: "example", title: "Example", lines: [{ math: "x < 4" }] },
        { kind: "practice", title: "Try it", prompt: "Choose the answer.", answer: "x < 4" },
      ],
    };

    const { beats } = layoutScript(script);
    const lessonTitle = beats[0];
    const firstStepTitle = beats[1];

    expect(wrappedLineCount(script.title, 18)).toBeGreaterThan(1);
    expect(firstStepTitle.y - lessonTitle.y).toBeGreaterThanOrEqual(180);
  });

  it("accounts for long generated step titles", () => {
    const script: LessonScript = {
      moduleId: "long-step",
      title: "Short title",
      steps: [
        {
          kind: "explanation",
          title: "Understanding what happens when both sides contain several variable terms",
          body: "Move like terms carefully before isolating the variable on one side of the inequality.",
        },
        { kind: "example", title: "Next step", lines: [{ math: "3x < 9" }] },
        { kind: "practice", title: "Try it", prompt: "Choose the answer.", answer: "x < 3" },
      ],
    };

    const { beats } = layoutScript(script);
    const firstTitle = beats.find((beat, index) => index > 0 && beat.kind === "title")!;
    const firstBody = beats.find((beat) => beat.kind === "text")!;
    expect(firstBody.y - firstTitle.y).toBeGreaterThanOrEqual(80);
  });

  it("places one stable visual frame for a generated animation", () => {
    const script: LessonScript = {
      moduleId: "fractions",
      title: "Equivalent fractions",
      steps: [
        {
          kind: "explanation",
          title: "Start",
          body: "Split the same whole into equal-sized pieces.",
        },
        { kind: "example", title: "Compare", lines: [{ math: "\\frac{1}{2}=\\frac{2}{4}" }] },
        { kind: "practice", title: "Try", prompt: "Shade an equivalent amount.", answer: "2/4" },
      ],
      visual: {
        kind: "animation",
        title: "Same amount, more pieces",
        goal: "Compare equivalent fractions.",
        advance: "step",
        scenes: [
          {
            primitive: "fractionBar",
            narration: "Both bars show the same amount.",
            parts: 4,
            shaded: 2,
            compareTo: { parts: 2, shaded: 1 },
          },
        ],
      },
    };

    const { beats } = layoutScript(script);
    const visual = beats.filter((beat) => beat.kind === "visual");
    expect(visual).toHaveLength(1);
    expect(visual[0].x).toBeGreaterThan(700);
  });
});
