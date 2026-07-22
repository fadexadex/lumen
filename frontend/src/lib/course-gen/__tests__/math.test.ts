import { describe, it, expect } from "vitest";
import {
  cleanGeneratedProse,
  createFallbackVisual,
  enrichParabola,
  enrichScript,
} from "@/lib/course-gen/math";
import { lessonScripts } from "@/lib/lesson-scripts";
import type { LessonScript } from "@/lib/types";

describe("enrichParabola", () => {
  it("reproduces the hand-authored quad-1 fixture (x^2 - 5x + 6)", () => {
    const { roots, vertex } = enrichParabola({ a: 1, b: -5, c: 6 });
    // quad-1 in lesson-scripts.ts: roots [2, 3], vertex [2.5, -0.25]
    expect(new Set(roots)).toEqual(new Set([2, 3]));
    expect(vertex).toEqual([2.5, -0.25]);
  });

  it("agrees with the fixture's own stored roots/vertex", () => {
    const fixture = lessonScripts["quad-1"].diagram!.parabola!;
    const { roots, vertex } = enrichParabola({ a: fixture.a, b: fixture.b, c: fixture.c });
    expect(new Set(roots)).toEqual(new Set(fixture.roots));
    expect(vertex).toEqual(fixture.vertex);
  });

  it("returns no roots when the discriminant is negative", () => {
    // x^2 + 1 = 0 has no real roots; vertex at (0, 1)
    const { roots, vertex } = enrichParabola({ a: 1, b: 0, c: 1 });
    expect(roots).toEqual([]);
    expect(vertex).toEqual([0, 1]);
  });

  it("returns a single (double) root when the discriminant is zero", () => {
    // x^2 - 2x + 1 = (x-1)^2 → one root at x = 1
    const { roots, vertex } = enrichParabola({ a: 1, b: -2, c: 1 });
    expect(roots).toEqual([1]);
    expect(vertex).toEqual([1, 0]);
  });

  it("degrades gracefully for a non-quadratic (a = 0)", () => {
    const { roots, vertex } = enrichParabola({ a: 0, b: 2, c: 4 });
    expect(roots).toEqual([]);
    expect(vertex).toEqual([0, 4]);
  });

  it("overrides model-provided (wrong) roots/vertex on the script", () => {
    const bad: LessonScript = {
      moduleId: "x",
      title: "t",
      steps: [{ kind: "explanation", title: "a", body: "b".repeat(20) }],
      diagram: { parabola: { a: 1, b: -5, c: 6, roots: [99, 99], vertex: [0, 0] } },
    };
    const fixed = enrichScript(bad).diagram!.parabola!;
    expect(new Set(fixed.roots)).toEqual(new Set([2, 3]));
    expect(fixed.vertex).toEqual([2.5, -0.25]);
  });

  it("synchronizes a generated parabola scene with the live graph contract", () => {
    const script: LessonScript = {
      moduleId: "visual-graph",
      title: "Graph it",
      steps: [
        {
          kind: "explanation",
          title: "Shape",
          body: "A parabola has a turning point on its curve.",
        },
      ],
      visual: {
        kind: "animation",
        title: "Parabola",
        goal: "Show the turning point.",
        advance: "step",
        scenes: [
          {
            primitive: "plotFunction",
            narration: "The curve turns at its vertex.",
            fn: "parabola",
            a: 1,
            b: -4,
            c: 3,
          },
        ],
      },
    };

    const fixed = enrichScript(script).diagram!.parabola!;
    expect(fixed).toEqual({ a: 1, b: -4, c: 3, roots: [3, 1], vertex: [2, -1] });
  });

  it("normalizes an explicitly requested number line when the model chose a line plot", () => {
    const script: LessonScript = {
      moduleId: "number-line-fix",
      title: "Show the solution",
      steps: [
        { kind: "explanation", title: "Solution", body: "Mark the solution where it belongs." },
      ],
      visual: {
        kind: "animation",
        title: "Solution position",
        goal: "Locate the solution.",
        advance: "step",
        scenes: [
          {
            primitive: "plotFunction",
            narration: "Show the solution x = 4 on the number line.",
            fn: "line",
            a: 1,
            b: -4,
            c: 0,
          },
        ],
      },
    };

    const visual = enrichScript(script).visual;
    expect(visual?.kind).toBe("animation");
    if (visual?.kind !== "animation") throw new Error("expected animation");
    expect(visual.scenes[0]).toMatchObject({
      primitive: "numberLineWalk",
      hops: [{ to: 4, label: "x = 4" }],
    });
  });
});

describe("cleanGeneratedProse", () => {
  it("removes Markdown decoration without removing inline math delimiters", () => {
    expect(cleanGeneratedProse("Use **<** and `$a^2 + b^2 = c^2$`.")).toBe(
      "Use < and $a^2 + b^2 = c^2$.",
    );
  });

  it("does not duplicate lesson prose when a rich visual cannot be repaired", () => {
    const script: LessonScript = {
      moduleId: "fallback",
      title: "Solving simple equations",
      steps: [
        { kind: "explanation", title: "Keep balance", body: "Do the same thing to both sides." },
        { kind: "example", title: "Work it", lines: [{ math: "x+2=5" }, { math: "x=3" }] },
        {
          kind: "practice",
          title: "Try",
          prompt: "Solve the equation.",
          math: "x+4=9",
          answer: "5",
        },
      ],
    };

    const visual = createFallbackVisual(script);
    expect(visual.kind).toBe("none");
    if (visual.kind !== "none") throw new Error("expected deliberate none fallback");
    expect(visual.reason).toContain("trustworthy interactive visual");
  });
});
