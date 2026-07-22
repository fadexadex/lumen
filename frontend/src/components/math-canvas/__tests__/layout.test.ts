import { describe, expect, it } from "vitest";
import { layoutScript, wrappedLineCount } from "../layout";
import type { LessonScript } from "@/lib/types";

describe("dynamic MathCanvas layout", () => {
  it("lays each step out as its own horizontal page at a stable top edge", () => {
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

    const { beats, width } = layoutScript(script);
    const stepTitles = beats.filter(
      (beat): beat is Extract<(typeof beats)[number], { kind: "title" }> => beat.kind === "title",
    );
    expect(wrappedLineCount(script.title, 18)).toBeGreaterThan(1);
    // Titles share a top edge (pages, not a vertical scroll)…
    expect(stepTitles[1]!.y).toBe(stepTitles[0]!.y);
    expect(stepTitles[2]!.y).toBe(stepTitles[0]!.y);
    // …and march rightward, one page apart, monotonically.
    expect(stepTitles[1]!.x).toBeGreaterThan(stepTitles[0]!.x + 1000);
    expect(stepTitles[2]!.x).toBeGreaterThan(stepTitles[1]!.x + 1000);
    expect(width).toBeGreaterThanOrEqual(stepTitles[2]!.x);
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
    const firstTitle = beats.find((beat) => beat.kind === "title")!;
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

  it("keeps the visual in one stable position as the active section changes", () => {
    const script: LessonScript = {
      moduleId: "moving-visual",
      title: "Functions",
      steps: [
        { kind: "explanation", title: "First", body: "Start here." },
        { kind: "example", title: "Second", lines: [{ math: "y=x^2" }] },
      ],
      visual: {
        kind: "animation",
        title: "Function graph",
        goal: "Relate the equation and graph.",
        advance: "step",
        scenes: [
          {
            primitive: "plotFunction",
            fn: "parabola",
            a: 1,
            b: 0,
            c: 0,
            narration: "The graph matches the equation.",
          },
        ],
      },
    };

    const first = layoutScript(script, 0).beats.find((beat) => beat.kind === "visual")!;
    const second = layoutScript(script, 1).beats.find((beat) => beat.kind === "visual")!;
    // Same vertical position every step — it never drifts up or down…
    expect(second.y).toBe(first.y);
    // …but it travels to the active step's page so it always sits beside the
    // prose being discussed (this is what removes the zoom-to-see-graph pain).
    expect(second.x).toBeGreaterThan(first.x + 1000);
    expect(second.step).toBe(1);
  });

  it("does not lay out the legacy prose-copying fallback as a visual", () => {
    const script: LessonScript = {
      moduleId: "legacy-fallback",
      title: "Slope",
      steps: [{ kind: "explanation", title: "What is slope?", body: "Slope measures change." }],
      visual: {
        kind: "animation",
        title: "See slope as a story of change",
        goal: "Reveal the lesson's mathematical reasoning one clear step at a time.",
        advance: "step",
        scenes: [
          {
            primitive: "stepReveal",
            narration: "Follow how each line builds on the idea before it.",
            lines: [{ text: "What is slope?" }, { text: "Slope measures change." }],
          },
        ],
      },
    };

    expect(layoutScript(script).beats.some((beat) => beat.kind === "visual")).toBe(false);
  });
});
