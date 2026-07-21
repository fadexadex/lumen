import { describe, it, expect, beforeEach } from "vitest";
import { applyCommand, type CanvasCommand } from "@/lib/live/canvas-commands";
import { resolveTargets } from "@/lib/live/board-targets";
import type { CanvasControllerHandle } from "@/lib/live/canvas-agent-bridge";
import type { LumenCanvasController } from "@/components/math-canvas/annotation-layer";
import { lessonScripts } from "@/lib/lesson-scripts";

/**
 * Recording mock of LumenCanvasController — avoids jsdom SVG gaps (getTotalLength/animate)
 * while still exercising the real dispatch + target-resolution seam in canvas-commands.ts.
 */
function makeMockAnno() {
  const calls: { method: string; args: unknown[] }[] = [];
  let seq = 0;
  const anno: LumenCanvasController = {
    highlight: (...args) => {
      calls.push({ method: "highlight", args });
      return `mock-${++seq}`;
    },
    circle: (...args) => {
      calls.push({ method: "circle", args });
      return `mock-${++seq}`;
    },
    label: (...args) => {
      calls.push({ method: "label", args });
      return `mock-${++seq}`;
    },
    arrow: (...args) => {
      calls.push({ method: "arrow", args });
      return `mock-${++seq}`;
    },
    drawAxis: (...args) => {
      calls.push({ method: "drawAxis", args });
      return `mock-${++seq}`;
    },
    drawPath: (...args) => {
      calls.push({ method: "drawPath", args });
      return `mock-${++seq}`;
    },
    remove: (...args) => {
      calls.push({ method: "remove", args });
    },
    clear: (...args) => {
      calls.push({ method: "clear", args });
    },
  };
  return { anno, calls };
}

function makeHandle(): { handle: CanvasControllerHandle; calls: { method: string; args: unknown[] }[] } {
  const script = lessonScripts["quad-1"];
  const targets = resolveTargets(script);
  const { anno, calls } = makeMockAnno();
  const handle: CanvasControllerHandle = {
    anno: () => anno,
    targets,
    getView: () => ({ x: 0, y: 0, scale: 1 }),
    setView: () => {},
    // Returning null short-circuits panToRect's rAF animation loop — we only assert
    // dispatch succeeded ("ok"), not the pan animation itself.
    viewportEl: () => null,
    screenToWorld: (sx, sy) => ({ x: sx, y: sy }),
    worldToScreen: (wx, wy) => ({ x: wx, y: wy }),
    boardSize: { w: 1600, h: 1000 },
  };
  return { handle, calls };
}

describe("canvas-commands contract (TS<->Py dispatch + resolver guard)", () => {
  let handle: CanvasControllerHandle;
  let calls: { method: string; args: unknown[] }[];

  beforeEach(() => {
    const made = makeHandle();
    handle = made.handle;
    calls = made.calls;
  });

  const targetNames = resolveTargets(lessonScripts["quad-1"]).names;

  it("resolves the expected named targets for the quad-1 parabola script", () => {
    expect(targetNames).toEqual(
      expect.arrayContaining(["vertex", "root1", "root2", "axisOfSymmetry", "graph"]),
    );
  });

  // Mirrors plan 09 §B's CMDS list: one shot at every op the agent can emit.
  const CMDS: CanvasCommand[] = [
    { id: "c1", op: "highlight", args: { target: "step2.equation" } },
    { id: "c2", op: "circle", args: { target: "vertex", label: "vertex" } },
    { id: "c3", op: "drawAxis", args: {} },
    { id: "c4", op: "plotParabola", args: { a: 0.3, b: 0, c: -2 } },
    { id: "c5", op: "label", args: { target: "root1", text: "root" } },
    { id: "c6", op: "arrow", args: { from: "vertex", to: "root1" } },
    { id: "c7", op: "panTo", args: { target: "graph" } },
    { id: "c8", op: "clear" },
  ];

  it.each(CMDS)("dispatches %o and returns ok", (cmd) => {
    const result = applyCommand(handle, cmd);
    expect(result).toBe("ok");
  });

  it("records exactly one annotation-layer call per non-panTo/clear op", () => {
    for (const cmd of CMDS) {
      applyCommand(handle, cmd);
    }
    const methodsCalled = calls.map((c) => c.method);
    expect(methodsCalled).toEqual([
      "highlight",
      "circle",
      "drawAxis",
      "drawPath", // plotParabola draws a path
      "label",
      "arrow",
      // panTo does not touch `anno` — it only moves the view
      "clear",
    ]);
  });

  it("returns unknown-target:<name> for an unresolvable target and never throws", () => {
    expect(() => applyCommand(handle, { id: "u1", op: "circle", args: { target: "nope" } })).not.toThrow();
    expect(applyCommand(handle, { id: "u1", op: "circle", args: { target: "nope" } })).toBe(
      "unknown-target:nope",
    );
    expect(applyCommand(handle, { id: "u2", op: "highlight", args: { target: "nope" } })).toBe(
      "unknown-target:nope",
    );
    expect(applyCommand(handle, { id: "u3", op: "label", args: { target: "nope", text: "x" } })).toBe(
      "unknown-target:nope",
    );
    expect(applyCommand(handle, { id: "u4", op: "panTo", args: { target: "nope" } })).toBe(
      "unknown-target:nope",
    );
    expect(applyCommand(handle, { id: "u5", op: "arrow", args: { from: "nope", to: "vertex" } })).toBe(
      "unknown-target",
    );
  });

  it("returns no-canvas when the annotation layer isn't mounted, without throwing", () => {
    const noCanvasHandle: CanvasControllerHandle = {
      ...handle,
      anno: () => null,
    };
    expect(() => applyCommand(noCanvasHandle, { id: "n1", op: "clear" })).not.toThrow();
    expect(applyCommand(noCanvasHandle, { id: "n1", op: "clear" })).toBe("no-canvas");
  });
});
