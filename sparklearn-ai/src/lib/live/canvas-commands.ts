import type { CanvasControllerHandle } from "./canvas-agent-bridge";
import type { ParabolaGeom } from "./board-targets";
import { panToRect } from "./pan";
import { findFreeWriteSpot, measureLessonOccupied, type Place } from "./place-write";

export type { Place };

export type CanvasCommand =
  | { id: string; op: "highlight"; args: { target: string; label?: string; color?: string } }
  | { id: string; op: "circle"; args: { target: string; label?: string } }
  | { id: string; op: "label"; args: { target: string; text: string; place?: Place } }
  | { id: string; op: "arrow"; args: { from: string; to: string; text?: string } }
  | { id: string; op: "drawAxis"; args: { target?: string } }
  | { id: string; op: "plotParabola"; args: { a: number; b: number; c: number } }
  | { id: string; op: "setParabola"; args: { a: number; b: number; c: number } }
  | {
      id: string;
      op: "writeBlock";
      args: { lines: string[]; target?: string; place?: Place; jobId?: string };
    }
  | { id: string; op: "cancelWriting"; args?: { jobId?: string } }
  | { id: string; op: "panTo"; args: { target: string } }
  | { id: string; op: "clear"; args?: Record<string, never> };

export function isCanvasCommand(x: unknown): x is CanvasCommand {
  return !!x && typeof x === "object" && typeof (x as { op?: unknown }).op === "string";
}

export function applyCommand(ctrl: CanvasControllerHandle, cmd: CanvasCommand): string {
  const anno = ctrl.anno();
  if (!anno && cmd.op !== "setParabola") return "no-canvas";
  const T = ctrl.targets;

  switch (cmd.op) {
    case "highlight": {
      if (!anno) return "no-canvas";
      const rect = T.rect(cmd.args.target) ?? rectAround(T.point(cmd.args.target));
      if (!rect) return `unknown-target:${cmd.args.target}`;
      anno.highlight(rect, { color: cmd.args.color, label: cmd.args.label });
      return "ok";
    }
    case "circle": {
      if (!anno) return "no-canvas";
      const p = T.point(cmd.args.target);
      if (!p) return `unknown-target:${cmd.args.target}`;
      anno.circle(p, { label: cmd.args.label });
      return "ok";
    }
    case "label": {
      if (!anno) return "no-canvas";
      const p = T.point(cmd.args.target);
      if (!p) return `unknown-target:${cmd.args.target}`;
      anno.label(p, cmd.args.text, cmd.args.place ?? "above");
      return "ok";
    }
    case "arrow": {
      if (!anno) return "no-canvas";
      const a = T.point(cmd.args.from);
      const b = T.point(cmd.args.to);
      if (!a || !b) return "unknown-target";
      anno.arrow(a, b, cmd.args.text);
      return "ok";
    }
    case "drawAxis": {
      if (!anno) return "no-canvas";
      const par = T.parabola;
      if (!par || !par.vertex) return "no-parabola";
      const g = T.rect("graph");
      if (!g) return "no-parabola";
      anno.drawAxis(par.vertex.x, g.y, g.y + g.h, "axis of symmetry");
      return "ok";
    }
    case "plotParabola": {
      if (!anno) return "no-canvas";
      const par = T.parabola;
      if (!par) return "no-parabola";
      const d = sampleParabolaPath(par, cmd.args.a, cmd.args.b, cmd.args.c);
      anno.drawPath(d, "teal");
      return "ok";
    }
    case "setParabola": {
      if (!ctrl.setParabola) return "no-parabola-control";
      ctrl.setParabola(cmd.args.a, cmd.args.b, cmd.args.c);
      return "ok";
    }
    case "writeBlock": {
      if (!anno) return "no-canvas";
      const lines = cmd.args.lines.filter((l) => typeof l === "string");
      if (!lines.length) return "empty-write";
      const jobId = cmd.args.jobId ?? cmd.id;
      const place = cmd.args.place ?? "below";
      const anchor =
        (cmd.args.target ? T.point(cmd.args.target) ?? centerOf(T.rect(cmd.args.target)) : null) ??
        ({ x: ctrl.boardSize.w * 0.08, y: ctrl.boardSize.h * 0.12 } as const);

      const occupied = [
        ...measureLessonOccupied(ctrl.boardEl?.() ?? null, ctrl.viewportEl(), ctrl.screenToWorld),
        ...anno.occupiedRects(jobId),
      ];

      const at = findFreeWriteSpot({
        anchor,
        place,
        lines,
        board: ctrl.boardSize,
        occupied,
      });
      anno.writeBlock(at, lines, { jobId });
      return `ok:${jobId}`;
    }
    case "cancelWriting": {
      if (!anno) return "no-canvas";
      anno.cancelWriting(cmd.args?.jobId);
      return "ok";
    }
    case "panTo": {
      const rect = T.rect(cmd.args.target) ?? rectAround(T.point(cmd.args.target));
      if (!rect) return `unknown-target:${cmd.args.target}`;
      panToRect(ctrl, rect);
      return "ok";
    }
    case "clear":
      if (!anno) return "no-canvas";
      anno.clear();
      return "ok";
    default:
      return "unknown-op";
  }
}

function rectAround(p: { x: number; y: number } | null, pad = 60) {
  return p ? { x: p.x - pad, y: p.y - pad, w: pad * 2, h: pad * 2 } : null;
}

function centerOf(r: { x: number; y: number; w: number; h: number } | null) {
  return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
}

/** Build an SVG path in WORLD coords for y=ax²+bx+c using the parabola's graphToWorld. */
function sampleParabolaPath(par: ParabolaGeom, a: number, b: number, c: number): string {
  const steps = 200;
  const { X_MIN, X_MAX, Y_MIN, Y_MAX, graphToWorld } = par;
  let d = "";
  let penUp = true;
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
