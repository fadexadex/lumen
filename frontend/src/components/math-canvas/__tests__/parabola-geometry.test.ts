import { describe, expect, it } from "vitest";
import { parabolaViewport } from "../parabola-geometry";

describe("parabolaViewport", () => {
  it("expands upward to keep a high downward-opening vertex visible", () => {
    const view = parabolaViewport(-1.2, 0, 20);

    expect(view.yMax).toBeGreaterThan(20);
    expect(view.yMin).toBeLessThanOrEqual(0);
    expect(view.yTicks).toContain(20);
  });

  it("keeps the familiar default window for ordinary quadratics", () => {
    expect(parabolaViewport(1, -4, 3)).toMatchObject({
      xMin: -10,
      xMax: 10,
      yMin: -10,
      yMax: 10,
    });
  });

  it("expands downward for a low upward-opening vertex", () => {
    const view = parabolaViewport(1, 0, -24);
    expect(view.yMin).toBeLessThan(-24);
    expect(view.yMax).toBeGreaterThanOrEqual(0);
  });
});
