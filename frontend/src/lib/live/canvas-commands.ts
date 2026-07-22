import type { CanvasControllerHandle } from "./canvas-agent-bridge";
import type { ParabolaGeom } from "./board-targets";
import { keepRectInView, panToRect } from "./pan";
import {
  findFreeWriteSpot,
  measureLessonOccupied,
  writeBlockRect,
  type Place,
} from "./place-write";

export type { Place };

export type CanvasCommand =
  | { id: string; op: "highlight"; args: { target: string; label?: string; color?: string } }
  | { id: string; op: "circle"; args: { target: string; label?: string } }
  | { id: string; op: "label"; args: { target: string; text: string; place?: Place } }
  | { id: string; op: "arrow"; args: { from: string; to: string; text?: string } }
  | { id: string; op: "drawAxis"; args: { target?: string } }
  | { id: string; op: "plotParabola"; args: { a: number; b: number; c: number } }
  | { id: string; op: "setParabola"; args: { a: number; b: number; c: number } }
  | { id: string; op: "setVisualScene"; args: { index: number } }
  | { id: string; op: "goToStep"; args: { index: number } }
  | {
      id: string;
      op: "writeBlock";
      args: { lines: string[]; target?: string; place?: Place; jobId?: string };
    }
  | { id: string; op: "cancelWriting"; args?: { jobId?: string } }
  | { id: string; op: "panTo"; args: { target: string } }
  | { id: string; op: "clear"; args?: Record<string, never> };

export function isCanvasCommand(x: unknown): x is CanvasCommand {
  if (!isRecord(x) || typeof x.id !== "string" || typeof x.op !== "string") return false;
  const args = x.args;
  const optionalString = (value: unknown) => value == null || typeof value === "string";
  const finiteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
  const validPlace = (value: unknown) =>
    value == null ||
    value === "above" ||
    value === "below" ||
    value === "left" ||
    value === "right";

  switch (x.op) {
    case "highlight":
      return (
        isRecord(args) &&
        typeof args.target === "string" &&
        optionalString(args.label) &&
        optionalString(args.color)
      );
    case "circle":
      return isRecord(args) && typeof args.target === "string" && optionalString(args.label);
    case "label":
      return (
        isRecord(args) &&
        typeof args.target === "string" &&
        typeof args.text === "string" &&
        validPlace(args.place)
      );
    case "arrow":
      return (
        isRecord(args) &&
        typeof args.from === "string" &&
        typeof args.to === "string" &&
        optionalString(args.text)
      );
    case "drawAxis":
      return args == null || (isRecord(args) && optionalString(args.target));
    case "plotParabola":
    case "setParabola":
      return isRecord(args) && finiteNumber(args.a) && finiteNumber(args.b) && finiteNumber(args.c);
    case "setVisualScene":
      return isRecord(args) && Number.isInteger(args.index) && Number(args.index) >= 0;
    case "goToStep":
      return isRecord(args) && Number.isInteger(args.index) && Number(args.index) >= 0;
    case "writeBlock":
      return (
        isRecord(args) &&
        Array.isArray(args.lines) &&
        args.lines.length > 0 &&
        args.lines.every((line) => typeof line === "string") &&
        optionalString(args.target) &&
        optionalString(args.jobId) &&
        validPlace(args.place)
      );
    case "cancelWriting":
      return args == null || (isRecord(args) && optionalString(args.jobId));
    case "panTo":
      return isRecord(args) && typeof args.target === "string";
    case "clear":
      return args == null || isRecord(args);
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function createCommandDeduper(limit = 32): (id: string) => boolean {
  const recent = new Set<string>();
  return (id: string) => {
    if (recent.has(id)) return false;
    recent.add(id);
    while (recent.size > limit) {
      const oldest = recent.values().next().value;
      if (typeof oldest !== "string") break;
      recent.delete(oldest);
    }
    return true;
  };
}

export function applyCommand(ctrl: CanvasControllerHandle, cmd: CanvasCommand): string {
  const anno = ctrl.anno();
  const noAnnoOps = new Set(["setParabola", "setVisualScene", "goToStep"]);
  if (!anno && !noAnnoOps.has(cmd.op)) return "no-canvas";
  const T = ctrl.targets;

  switch (cmd.op) {
    case "highlight": {
      if (!anno) return "no-canvas";
      const rect =
        anno.targetRect(cmd.args.target) ??
        T.rect(cmd.args.target) ??
        rectAround(anno.targetPoint(cmd.args.target) ?? T.point(cmd.args.target));
      if (!rect) return `unknown-target:${cmd.args.target}`;
      anno.highlight(rect, { color: cmd.args.color, label: cmd.args.label });
      return "ok";
    }
    case "circle": {
      if (!anno) return "no-canvas";
      const p = anno.targetPoint(cmd.args.target) ?? T.point(cmd.args.target);
      if (!p) return `unknown-target:${cmd.args.target}`;
      anno.circle(p, { label: cmd.args.label });
      return "ok";
    }
    case "label": {
      if (!anno) return "no-canvas";
      const p = anno.targetPoint(cmd.args.target) ?? T.point(cmd.args.target);
      if (!p) return `unknown-target:${cmd.args.target}`;
      anno.label(p, cmd.args.text, cmd.args.place ?? "above");
      return "ok";
    }
    case "arrow": {
      if (!anno) return "no-canvas";
      const a = anno.targetPoint(cmd.args.from) ?? T.point(cmd.args.from);
      const b = anno.targetPoint(cmd.args.to) ?? T.point(cmd.args.to);
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
    case "setVisualScene": {
      if (!ctrl.setVisualScene) return "no-visual-scene-control";
      ctrl.setVisualScene(cmd.args.index);
      return "ok";
    }
    case "goToStep": {
      if (!ctrl.setStep) return "no-step-control";
      const last = ctrl.stepCount ? ctrl.stepCount - 1 : cmd.args.index;
      ctrl.setStep(Math.max(0, Math.min(last, cmd.args.index)));
      return "ok";
    }
    case "writeBlock": {
      if (!anno) return "no-canvas";
      const lines = cmd.args.lines.filter((l) => typeof l === "string");
      if (!lines.length) return "empty-write";
      const jobId = cmd.args.jobId ?? cmd.id;
      const existingAt = anno.writeBlockPosition(jobId);
      const place = cmd.args.place ?? "below";
      // Confine writing to the CURRENT page so the learner sees it. Without an
      // explicit on-page target, anchor near what the learner is CURRENTLY
      // looking at (upper-left of the visible viewport) — not the page corner —
      // so a write lands close to their focus and they barely have to move. Fall
      // back to the page's top-left only when the viewport can't be measured.
      const region = ctrl.pageBounds?.() ?? {
        x: 0,
        y: 0,
        w: ctrl.boardSize.w,
        h: ctrl.boardSize.h,
      };
      const vpEl = ctrl.viewportEl();
      const focusAnchor =
        vpEl && vpEl.clientWidth > 0
          ? ctrl.screenToWorld(vpEl.clientWidth * 0.16, vpEl.clientHeight * 0.26)
          : { x: region.x + region.w * 0.08, y: region.y + region.h * 0.14 };
      const anchor =
        (cmd.args.target
          ? (T.point(cmd.args.target) ?? centerOf(T.rect(cmd.args.target)))
          : null) ?? focusAnchor;

      const occupied = [
        ...(ctrl.lessonRects ?? []),
        ...measureLessonOccupied(ctrl.boardEl?.() ?? null, ctrl.viewportEl(), ctrl.screenToWorld),
        ...anno.occupiedRects(jobId),
      ];

      const at =
        existingAt ??
        findFreeWriteSpot({
          anchor,
          place,
          lines,
          region,
          occupied,
        });
      anno.writeBlock(at, lines, { jobId });
      const writeDurationMs = lines.join("\n").length * 36;
      ctrl.suspendLessonFollow?.(Math.min(15_000, Math.max(5_000, writeDurationMs + 2_500)));
      const blockRect = writeBlockRect(at, lines);
      if (existingAt) keepRectInView(ctrl, blockRect);
      else panToRect(ctrl, blockRect, 140);
      return `ok:${jobId}`;
    }
    case "cancelWriting": {
      if (!anno) return "no-canvas";
      anno.cancelWriting(cmd.args?.jobId);
      return "ok";
    }
    case "panTo": {
      if (!anno) return "no-canvas";
      const rect =
        anno.targetRect(cmd.args.target) ??
        T.rect(cmd.args.target) ??
        rectAround(anno.targetPoint(cmd.args.target) ?? T.point(cmd.args.target));
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
