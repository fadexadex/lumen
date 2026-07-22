import { describe, it, expect } from "vitest";
import { resolveTargets } from "@/lib/live/board-targets";
import { layoutScript } from "@/components/math-canvas/layout";
import { lessonScripts } from "@/lib/lesson-scripts";

const X_MIN = -10,
  X_MAX = 10,
  Y_MIN = -10,
  Y_MAX = 10;

describe("board-targets geometry", () => {
  const script = lessonScripts["quad-1"]; // a=1,b=-5,c=6 -> roots at x=2,3
  const targets = resolveTargets(script);

  it("includes vertex/root1/root2/axisOfSymmetry/graph for a parabola script", () => {
    expect(targets.names).toEqual(
      expect.arrayContaining(["vertex", "root1", "root2", "axisOfSymmetry", "graph"]),
    );
  });

  it("computes the vertex world point independently from layoutScript's diagram beat", () => {
    const { beats } = layoutScript(script);
    const dia = beats.find((b) => b.kind === "diagram");
    expect(dia).toBeTruthy();
    if (!dia || dia.kind !== "diagram" || !dia.params) throw new Error("no diagram beat");

    const { a, b, c } = dia.params;
    const plotW = dia.w;
    const plotH = dia.h - 130; // must match ParabolaWidget / board-targets.ts exactly

    const graphToWorld = (gx: number, gy: number) => ({
      x: dia.x + ((gx - X_MIN) / (X_MAX - X_MIN)) * plotW,
      y: dia.y + (plotH - ((gy - Y_MIN) / (Y_MAX - Y_MIN)) * plotH),
    });

    const vx = -b / (2 * a);
    const vy = c - (b * b) / (4 * a);
    const expectedVertex = graphToWorld(vx, vy);

    const actualVertex = targets.point("vertex");
    expect(actualVertex).toBeTruthy();
    expect(Math.abs(actualVertex!.x - expectedVertex.x)).toBeLessThan(1);
    expect(Math.abs(actualVertex!.y - expectedVertex.y)).toBeLessThan(1);

    // independent sanity check on the math itself for a=1,b=-5,c=6
    expect(vx).toBeCloseTo(2.5, 6);
    expect(vy).toBeCloseTo(-0.25, 6);
  });

  it("places root1/root2 near graph x=2 and x=3 for a=1,b=-5,c=6", () => {
    const { beats } = layoutScript(script);
    const dia = beats.find((b) => b.kind === "diagram");
    if (!dia || dia.kind !== "diagram" || !dia.params) throw new Error("no diagram beat");
    const { a, b, c } = dia.params;
    const plotW = dia.w;
    const plotH = dia.h - 130;
    const graphToWorld = (gx: number, gy: number) => ({
      x: dia.x + ((gx - X_MIN) / (X_MAX - X_MIN)) * plotW,
      y: dia.y + (plotH - ((gy - Y_MIN) / (Y_MAX - Y_MIN)) * plotH),
    });

    const disc = b * b - 4 * a * c;
    expect(disc).toBeCloseTo(1, 6);
    const rootXs = [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)].sort(
      (x, y) => x - y,
    );
    expect(rootXs[0]).toBeCloseTo(2, 6);
    expect(rootXs[1]).toBeCloseTo(3, 6);

    const expectedWorldXs = rootXs.map((gx) => graphToWorld(gx, 0).x).sort((x, y) => x - y);
    const actualWorldXs = [targets.point("root1"), targets.point("root2")]
      .map((p) => p!.x)
      .sort((x, y) => x - y);

    expect(actualWorldXs.length).toBe(2);
    for (let i = 0; i < 2; i++) {
      expect(Math.abs(actualWorldXs[i] - expectedWorldXs[i])).toBeLessThan(1);
    }
  });

  it("returns null (not throw) for unknown target names", () => {
    expect(targets.point("does-not-exist")).toBeNull();
    expect(targets.rect("does-not-exist")).toBeNull();
  });

  it("gives every equation in a multi-line example its own described target", () => {
    expect(targets.names).toEqual(
      expect.arrayContaining(["step2.equation1", "step2.equation2", "step2.equation3"]),
    );
    expect(targets.descriptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "step2.equation1", text: "x^2 - 5x + 6 = 0" }),
        expect.objectContaining({ name: "step2.equation2", text: "2x^2 + 3x - 2 = 0" }),
        expect.objectContaining({ name: "step2.equation3", text: "x^2 = 9" }),
      ]),
    );
  });

  it("uses a line-sized rectangle for an equation highlight", () => {
    const rect = targets.rect("step2.equation1");
    expect(rect).toBeTruthy();
    expect(rect!.h).toBeLessThanOrEqual(64);
    expect(rect!.w).toBeLessThan(260);
  });
});
