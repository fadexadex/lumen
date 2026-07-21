# 06 · Tool Protocol & RPC Command Dispatch

This is the contract between the agent's tool calls (`02`) and the canvas controller (`05`).
It defines: the **Command JSON schema**, the **bridge registry**, and **`applyCommand`** — the
function that resolves semantic targets to world coordinates and calls the controller.

---

## 1. The bridge registry — `lib/live/canvas-agent-bridge.ts`

Mirrors the existing `whiteboard-bridge.ts` pattern (module singleton, no prop-drilling).
`MathCanvas` registers a handle on mount; the session hook reads it when a command arrives.

```ts
import type { LumenCanvasController } from "@/components/math-canvas/annotation-layer";
import type { ResolvedTargets } from "./board-targets";

export type View = { x: number; y: number; scale: number };
export type WPoint = { x: number; y: number };

export interface CanvasControllerHandle {
  anno: () => LumenCanvasController | null;
  targets: ResolvedTargets;
  getView: () => View;
  setView: (v: View) => void;
  viewportEl: () => HTMLElement | null;
  screenToWorld: (sx: number, sy: number) => WPoint;
  worldToScreen: (wx: number, wy: number) => WPoint;
  boardSize: { w: number; h: number };
}

let handle: CanvasControllerHandle | null = null;
export function setCanvasController(h: CanvasControllerHandle | null) {
  handle = h;
}
export function getCanvasController(): CanvasControllerHandle | null {
  return handle;
}
```

## 2. Command schema — `lib/live/canvas-commands.ts`

The wire format (must match `agent/commands.py` exactly). Discriminated union on `op`, with a
narrow set of ops. Every op references targets by **name**; the client resolves geometry.

```ts
import type { CanvasControllerHandle } from "./canvas-agent-bridge";
import { panToRect } from "./pan"; // panToRect/animateView from 05 (put in lib/live/pan.ts)

export type Place = "above" | "below" | "left" | "right";

export type CanvasCommand =
  | { id: string; op: "highlight"; args: { target: string; label?: string; color?: string } }
  | { id: string; op: "circle"; args: { target: string; label?: string } }
  | { id: string; op: "label"; args: { target: string; text: string; place?: Place } }
  | { id: string; op: "arrow"; args: { from: string; to: string; text?: string } }
  | { id: string; op: "drawAxis"; args: { target?: string } }
  | { id: string; op: "plotParabola"; args: { a: number; b: number; c: number } }
  | { id: string; op: "panTo"; args: { target: string } }
  | { id: string; op: "clear"; args?: Record<string, never> };

export function isCanvasCommand(x: unknown): x is CanvasCommand {
  return !!x && typeof x === "object" && typeof (x as any).op === "string";
}
```

## 3. `applyCommand` — resolve targets, call controller

This is the heart of dispatch. It's pure UI-side; the agent never sees a coordinate.

```ts
export function applyCommand(ctrl: CanvasControllerHandle, cmd: CanvasCommand): string {
  const anno = ctrl.anno();
  if (!anno) return "no-canvas";
  const T = ctrl.targets;

  switch (cmd.op) {
    case "highlight": {
      const rect = T.rect(cmd.args.target) ?? rectAround(T.point(cmd.args.target));
      if (!rect) return `unknown-target:${cmd.args.target}`;
      anno.highlight(rect, { color: cmd.args.color, label: cmd.args.label });
      return "ok";
    }
    case "circle": {
      const p = T.point(cmd.args.target);
      if (!p) return `unknown-target:${cmd.args.target}`;
      anno.circle(p, { label: cmd.args.label });
      return "ok";
    }
    case "label": {
      const p = T.point(cmd.args.target);
      if (!p) return `unknown-target:${cmd.args.target}`;
      anno.label(p, cmd.args.text, cmd.args.place ?? "above");
      return "ok";
    }
    case "arrow": {
      const a = T.point(cmd.args.from),
        b = T.point(cmd.args.to);
      if (!a || !b) return "unknown-target";
      anno.arrow(a, b, cmd.args.text);
      return "ok";
    }
    case "drawAxis": {
      const par = T.parabola;
      if (!par || !par.vertex) return "no-parabola";
      // full graph height axis through vertex x
      const g = T.rect("graph")!;
      anno.drawAxis(par.vertex.x, g.y, g.y + g.h, "axis of symmetry");
      return "ok";
    }
    case "plotParabola": {
      const par = T.parabola;
      if (!par) return "no-parabola";
      const d = sampleParabolaPath(par, cmd.args.a, cmd.args.b, cmd.args.c);
      anno.drawPath(d, "teal");
      return "ok";
    }
    case "panTo": {
      const rect = T.rect(cmd.args.target) ?? rectAround(T.point(cmd.args.target));
      if (!rect) return `unknown-target:${cmd.args.target}`;
      panToRect(ctrl, rect);
      return "ok";
    }
    case "clear":
      anno.clear();
      return "ok";
  }
}

function rectAround(p: { x: number; y: number } | null, pad = 60) {
  return p ? { x: p.x - pad, y: p.y - pad, w: pad * 2, h: pad * 2 } : null;
}

/** Build an SVG path in WORLD coords for y=ax²+bx+c using the parabola's graphToWorld. */
function sampleParabolaPath(
  par: NonNullable<ReturnType<() => any>>,
  a: number,
  b: number,
  c: number,
): string {
  const steps = 200;
  const { X_MIN, X_MAX, Y_MIN, Y_MAX, graphToWorld } = par;
  let d = "",
    penUp = true;
  for (let i = 0; i <= steps; i++) {
    const x = X_MIN + ((X_MAX - X_MIN) * i) / steps;
    const y = a * x * x + b * x + c;
    if (y < Y_MIN - 3 || y > Y_MAX + 3) {
      penUp = true;
      continue;
    }
    const w = graphToWorld(x, y);
    d += `${penUp ? "M" : "L"} ${w.x.toFixed(1)} ${w.y.toFixed(1)} `;
    penUp = false;
  }
  return d.trim();
}
```

> `applyCommand`'s return string is surfaced back to the model via the RPC ack (see `04`
> `registerRpcMethod("lumen.canvas")` returns the handler result). So if the model asks to
> `circle("centroid")` and there's no such target, it hears `unknown-target:centroid` and can
> recover verbally ("hmm, let me point at the vertex instead").

## 4. Async-tool timing (why speech isn't blocked)

```
model: draw_axis_of_symmetry()
  agent tool:  await room.perform_rpc(user, "lumen.canvas", {op:"drawAxis"})   # ≤ a few ms
     client handler: applyCommand(...) -> anno.drawAxis(...) -> returns "ok"    # kicks off anim
     (the 520ms draw-on animation runs AFTER the handler returned)
  agent tool returns "ok:applied" to model
model: keeps generating audio the entire time
```

The RPC ack resolves the instant the client _starts_ the animation, not when it finishes. This
is the whole trick to "talks while drawing." If a future op genuinely needs to block (e.g. a
long camera move before continuing), use LiveKit's async-tool status pattern: send an interim
`session.say("let me zoom in")` then perform the move.

## 5. Command ordering & dedupe

- Each command carries an `id` (from `agent/commands.py`). The client keeps a small
  `Set<recentIds>` (last 32) to drop accidental duplicates (RPC retries).
- Commands are applied in arrival order. For multi-step reveals ("draw axis, then circle
  vertex"), the agent simply awaits each `perform_rpc` sequentially, guaranteeing order.

## 6. The full tool ↔ command ↔ controller table

| Agent tool (`02`)       | Command `op`   | Resolver                     | Controller method (`05`) | Visual                      |
| ----------------------- | -------------- | ---------------------------- | ------------------------ | --------------------------- |
| `highlight_region`      | `highlight`    | rect(target)                 | `highlight(rect)`        | tinted rounded box + pop    |
| `circle_point`          | `circle`       | point(target)                | `circle(pt)`             | hand-drawn ellipse, draw-on |
| `add_label`             | `label`        | point(target)                | `label(pt,text)`         | serif text, fade-rise       |
| `draw_arrow`            | `arrow`        | point(from/to)               | `arrow(a,b)`             | arrow w/ marker             |
| `draw_axis_of_symmetry` | `drawAxis`     | parabola.vertex + graph rect | `drawAxis(x,y0,y1)`      | dashed vertical, draw-on    |
| `plot_parabola`         | `plotParabola` | parabola.graphToWorld        | `drawPath(d)`            | overlaid curve, draw-on     |
| `focus_on`              | `panTo`        | rect(target)                 | camera animate           | cinematic pan/zoom          |
| `clear_annotations`     | `clear`        | —                            | `clear()`                | all AI marks removed        |
| `get_board_state`       | (no command)   | —                            | —                        | returns text to model       |

## 7. Keeping TS ↔ Python in sync

`canvas-commands.ts` (TS) and `commands.py` (Python) are the same schema in two languages. Rules:

- Add an op in BOTH files or not at all.
- Args are snake-case-free (use `target`, `label`, `from`, `to`) so no case translation.
- A tiny contract test (in `09`) sends every op once from a script and asserts the client returns
  `ok` — catches drift.

Next: `07` builds the overlay UI (orb + transcript + mic), the animations, and the exact
`LessonRoute` surgery to replace `LiveDrawer`.
