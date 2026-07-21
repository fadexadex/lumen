import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type MCTool = "pan" | "pen" | "highlighter" | "eraser" | "text";

type Stroke = { tool: "pen" | "highlighter"; points: { x: number; y: number }[] };

export type InkHandle = { clear: () => void };

export const InkCanvas = forwardRef<InkHandle, { width: number; height: number; tool: MCTool }>(
  function InkCanvas({ width, height, tool }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const strokes = useRef<Stroke[]>([]);
    const active = useRef<Stroke | null>(null);
    const toolRef = useRef<MCTool>(tool);
    toolRef.current = tool;

    const redraw = () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      for (const s of strokes.current) drawStroke(ctx, s);
      if (active.current) drawStroke(ctx, active.current);
    };

    useImperativeHandle(ref, () => ({
      clear: () => {
        strokes.current = [];
        active.current = null;
        redraw();
      },
    }));

    useEffect(() => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = width * dpr;
      c.height = height * dpr;
      const ctx = c.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }, [width, height]);

    const pos = (e: React.PointerEvent) => {
      const c = e.currentTarget as HTMLCanvasElement;
      const r = c.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * c.offsetWidth,
        y: ((e.clientY - r.top) / r.height) * c.offsetHeight,
      };
    };

    const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const t = toolRef.current;
      if (t !== "pen" && t !== "highlighter" && t !== "eraser") return;
      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
      const p = pos(e);
      if (t === "eraser") return erase(p);
      active.current = { tool: t, points: [p] };
      redraw();
    };
    const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const t = toolRef.current;
      if (e.pointerType === "mouse" && !(e.buttons & 1)) return;
      const p = pos(e);
      if (t === "eraser") return erase(p);
      if (!active.current) return;
      active.current.points.push(p);
      redraw();
    };
    const up = () => {
      if (active.current) {
        strokes.current.push(active.current);
        active.current = null;
        redraw();
      }
    };
    const erase = (p: { x: number; y: number }) => {
      const r = 16;
      const before = strokes.current.length;
      strokes.current = strokes.current.filter(
        (s) => !s.points.some((pt) => (pt.x - p.x) ** 2 + (pt.y - p.y) ** 2 <= r * r),
      );
      if (strokes.current.length !== before) redraw();
    };

    const drawing = tool === "pen" || tool === "highlighter" || tool === "eraser";
    const cursor = drawing ? (tool === "eraser" ? "cell" : "crosshair") : "default";

    return (
      <canvas
        ref={canvasRef}
        className="mc-ink"
        style={{ width, height, cursor, pointerEvents: drawing ? "auto" : "none" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
    );
  },
);

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.points.length < 1) return;
  ctx.save();
  if (s.tool === "highlighter") {
    ctx.strokeStyle = "oklch(0.9 0.14 80 / 0.45)";
    ctx.lineWidth = 20;
    ctx.globalCompositeOperation = "multiply";
  } else {
    ctx.strokeStyle = "oklch(0.2 0 0)";
    ctx.lineWidth = 2.6;
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(s.points[0].x, s.points[0].y);
  for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
  ctx.stroke();
  ctx.restore();
}
