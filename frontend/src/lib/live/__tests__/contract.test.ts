import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import {
  applyCommand,
  createCommandDeduper,
  isCanvasCommand,
  type CanvasCommand,
} from "@/lib/live/canvas-commands";
import { resolveTargets } from "@/lib/live/board-targets";
import type { CanvasControllerHandle } from "@/lib/live/canvas-agent-bridge";
import type { LumenCanvasController } from "@/components/math-canvas/annotation-layer";
import { lessonScripts } from "@/lib/lesson-scripts";
import { rectsOverlap, writeBlockRect } from "@/lib/live/place-write";
import { roomName } from "@/lib/live/livekit-client";
import { AnnotationLayer, continuedRevealCount } from "@/components/math-canvas/annotation-layer";

describe("LiveKit session room naming", () => {
  it("uses a fresh room instance when the same learner reconnects", () => {
    const first = roomName("quad-1", "learner-a", "session-1");
    const second = roomName("quad-1", "learner-a", "session-2");

    expect(first).not.toBe(second);
    expect(first).toBe("lumen-quad-1-learner-a-session-1");
  });
});

describe("continued AI board writing", () => {
  it("keeps revealed text when a cumulative solution update adds more steps", () => {
    expect(
      continuedRevealCount({ lines: ["Step 1", "Find the roots"], revealed: 16 }, [
        "Step 1",
        "Find the roots",
        "Step 2",
        "Test intervals",
      ]),
    ).toBe(16);
  });

  it("does not resurrect cleared writing when a new block arrives immediately", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const ref = createRef<LumenCanvasController>();
    act(() => root.render(createElement(AnnotationLayer, { ref, width: 1600, height: 1000 })));

    act(() => {
      ref.current!.writeBlock({ x: 100, y: 100 }, ["old"], { jobId: "old-work" });
      ref.current!.clear();
      ref.current!.writeBlock({ x: 300, y: 300 }, ["new"], { jobId: "new-work" });
    });

    expect(ref.current!.targetRect("work.old-work")).toBeNull();
    expect(ref.current!.targetRect("work.new-work")).not.toBeNull();
    ref.current!.writeBlock({ x: 300, y: 360 }, ["Vertex formula", "$x = \\frac{-b}{2a}$"], {
      jobId: "formula-work",
    });
    expect(ref.current!.targetRect("work.formula-work.line2")!.w).toBeLessThan(180);
    act(() => root.unmount());
  });

  it("starts over only when the existing lines are actually replaced", () => {
    expect(
      continuedRevealCount({ lines: ["Old calculation"], revealed: 12 }, ["Corrected calculation"]),
    ).toBe(0);
  });

  it("starts over when an earlier line is extended instead of appended", () => {
    expect(
      continuedRevealCount({ lines: ["Find the root"], revealed: 13 }, ["Find the roots"]),
    ).toBe(0);
  });
});

/**
 * Recording mock of LumenCanvasController — avoids jsdom SVG gaps (getTotalLength/animate)
 * while still exercising the real dispatch + target-resolution seam in canvas-commands.ts.
 */
function makeMockAnno() {
  const calls: { method: string; args: unknown[] }[] = [];
  const writePositions = new Map<string, { x: number; y: number }>();
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
    writeBlock: (...args) => {
      calls.push({ method: "writeBlock", args });
      const [at, , options] = args as [
        { x: number; y: number },
        string[],
        { jobId?: string } | undefined,
      ];
      if (options?.jobId) writePositions.set(options.jobId, at);
      return `mock-${++seq}`;
    },
    writeBlockPosition: (jobId) => writePositions.get(jobId) ?? null,
    cancelWriting: (...args) => {
      calls.push({ method: "cancelWriting", args });
    },
    remove: (...args) => {
      calls.push({ method: "remove", args });
    },
    clear: (...args) => {
      calls.push({ method: "clear", args });
    },
    occupiedRects: () => [],
    targetRect: (name) => {
      const match = /^work\.([^.]*)\.line(\d+)$/.exec(name);
      if (!match) return null;
      const at = writePositions.get(match[1]!);
      if (!at) return null;
      return { x: at.x, y: at.y + (Number(match[2]) - 1) * 40, w: 180, h: 34 };
    },
    targetPoint: () => null,
    targetDescriptions: () => [],
  };
  return { anno, calls };
}

function makeHandle(): {
  handle: CanvasControllerHandle;
  calls: { method: string; args: unknown[] }[];
} {
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
    setParabola: () => {
      calls.push({ method: "setParabola", args: [] });
    },
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

  afterEach(() => vi.unstubAllGlobals());

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
    { id: "c8", op: "setParabola", args: { a: 1, b: -5, c: 6 } },
    {
      id: "c9",
      op: "writeBlock",
      args: { lines: ["Factor:", "x^2 - 5x + 6 = (x-2)(x-3)"], target: "graph", place: "left" },
    },
    { id: "c10", op: "clear" },
    { id: "c11", op: "cancelWriting", args: {} },
  ];

  it.each(CMDS)("dispatches %o and returns ok", (cmd) => {
    const result = applyCommand(handle, cmd);
    expect(result === "ok" || result.startsWith("ok:")).toBe(true);
  });

  it("records annotation-layer calls for draw ops", () => {
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
      // panTo does not touch `anno`
      "setParabola",
      "writeBlock",
      "clear",
      "cancelWriting",
    ]);
  });

  it("can precisely highlight a line that Lumen previously wrote", () => {
    applyCommand(handle, {
      id: "write-targetable",
      op: "writeBlock",
      args: {
        jobId: "vertex-work",
        lines: ["Vertex x-coordinate", "$x = \\frac{-b}{2a}$", "$x = 2.5$"],
      },
    });

    expect(
      applyCommand(handle, {
        id: "highlight-written-line",
        op: "highlight",
        args: { target: "work.vertex-work.line2" },
      }),
    ).toBe("ok");
    const highlight = calls.findLast((call) => call.method === "highlight");
    expect(highlight?.args[0]).toEqual(expect.objectContaining({ h: 34 }));
  });

  it("returns unknown-target:<name> for an unresolvable target and never throws", () => {
    expect(() =>
      applyCommand(handle, { id: "u1", op: "circle", args: { target: "nope" } }),
    ).not.toThrow();
    expect(applyCommand(handle, { id: "u1", op: "circle", args: { target: "nope" } })).toBe(
      "unknown-target:nope",
    );
    expect(applyCommand(handle, { id: "u2", op: "highlight", args: { target: "nope" } })).toBe(
      "unknown-target:nope",
    );
    expect(
      applyCommand(handle, { id: "u3", op: "label", args: { target: "nope", text: "x" } }),
    ).toBe("unknown-target:nope");
    expect(applyCommand(handle, { id: "u4", op: "panTo", args: { target: "nope" } })).toBe(
      "unknown-target:nope",
    );
    expect(
      applyCommand(handle, { id: "u5", op: "arrow", args: { from: "nope", to: "vertex" } }),
    ).toBe("unknown-target");
  });

  it("returns no-canvas when the annotation layer isn't mounted, without throwing", () => {
    const noCanvasHandle: CanvasControllerHandle = {
      ...handle,
      anno: () => null,
    };
    expect(() => applyCommand(noCanvasHandle, { id: "n1", op: "clear" })).not.toThrow();
    expect(applyCommand(noCanvasHandle, { id: "n1", op: "clear" })).toBe("no-canvas");
  });

  it("rejects malformed tool payloads before dispatch", () => {
    expect(isCanvasCommand({ id: "bad", op: "highlight", args: {} })).toBe(false);
    expect(
      isCanvasCommand({ id: "bad", op: "plotParabola", args: { a: 1, b: "five", c: 6 } }),
    ).toBe(false);
    expect(isCanvasCommand({ id: "bad", op: "invented", args: {} })).toBe(false);
  });

  it("deduplicates retried command ids with a bounded window", () => {
    const accept = createCommandDeduper(2);
    expect(accept("one")).toBe(true);
    expect(accept("one")).toBe(false);
    expect(accept("two")).toBe(true);
    expect(accept("three")).toBe(true);
    expect(accept("one")).toBe(true);
  });

  it("places AI writing clear of the complete lesson, including beats outside the current view", () => {
    const reservedLesson = { x: 40, y: 40, w: 700, h: 260 };
    handle.lessonRects = [reservedLesson];

    applyCommand(handle, {
      id: "write-clear",
      op: "writeBlock",
      args: { lines: ["vertex x = -b / 2a", "x = 2"], place: "below" },
    });

    const write = calls.find((call) => call.method === "writeBlock");
    const at = write?.args[0] as { x: number; y: number };
    expect(rectsOverlap(writeBlockRect(at, ["vertex x = -b / 2a", "x = 2"]), reservedLesson)).toBe(
      false,
    );
  });

  it("automatically focuses the camera on a new AI write block", () => {
    const views: Array<{ x: number; y: number; scale: number }> = [];
    let followSuspendedFor = 0;
    handle.viewportEl = () => ({ clientWidth: 1000, clientHeight: 700 }) as HTMLElement;
    handle.setView = (view) => views.push(view);
    handle.suspendLessonFollow = (ms) => {
      followSuspendedFor = ms;
    };
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(performance.now() + 1000);
      return 1;
    });

    applyCommand(handle, {
      id: "write-focus",
      op: "writeBlock",
      args: { lines: ["y = x² + 4x", "vertex x = -b / 2a"], place: "below" },
    });

    expect(views.length).toBeGreaterThan(0);
    expect(views.at(-1)!.scale).toBeGreaterThan(1);
    expect(followSuspendedFor).toBeGreaterThanOrEqual(5000);
  });

  it("keeps a continued calculation at the same board position and camera scale", () => {
    const views: Array<{ x: number; y: number; scale: number }> = [];
    let currentView = { x: 0, y: 0, scale: 1 };
    handle.boardSize = { w: 900, h: 360 };
    handle.viewportEl = () => ({ clientWidth: 900, clientHeight: 600 }) as HTMLElement;
    handle.getView = () => currentView;
    handle.setView = (view) => {
      currentView = view;
      views.push(view);
    };
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(performance.now() + 1000);
      return 1;
    });

    applyCommand(handle, {
      id: "first-command",
      op: "writeBlock",
      args: { jobId: "quadratic-work", lines: ["$x^2 + 4x = 0$"] },
    });
    const firstAt = calls.filter((call) => call.method === "writeBlock").at(-1)!.args[0];
    const focusedScale = currentView.scale;

    applyCommand(handle, {
      id: "continued-command",
      op: "writeBlock",
      args: {
        jobId: "quadratic-work",
        lines: Array.from({ length: 10 }, (_, i) => `$x_${i} = ${i}$`),
      },
    });
    const secondAt = calls.filter((call) => call.method === "writeBlock").at(-1)!.args[0];

    expect(secondAt).toEqual(firstAt);
    expect(currentView.scale).toBe(focusedScale);
    expect(views.length).toBeGreaterThan(0);
  });
});
