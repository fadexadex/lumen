import { describe, it, expect } from "vitest";
import { enrichParabola, enrichScript } from "@/lib/course-gen/math";
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
});
