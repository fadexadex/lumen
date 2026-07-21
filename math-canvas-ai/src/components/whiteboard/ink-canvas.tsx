import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Tool } from "./types";

type Stroke = {
  tool: "pen" | "highlighter";
  points: { x: number; y: number }[];
};

export type InkCanvasHandle = {
  clear: () => void;
};

export const InkCanvas = forwardRef<
  InkCanvasHandle,
  { width: number; height: number; tool: Tool }
>(function InkCanvas({ width, height, tool }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeRef = useRef<Stroke | null>(null);
  const toolRef = useRef<Tool>(tool);
  toolRef.current = tool;

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokesRef.current) drawStroke(ctx, s);
    if (activeRef.current) drawStroke(ctx, activeRef.current);
  };

  useImperativeHandle(ref, () => ({
    clear: () => {
      strokesRef.current = [];
      activeRef.current = null;
      redraw();
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }, [width, height]);

  const pointerPos = (e: React.PointerEvent) => {
    const c = e.currentTarget as HTMLCanvasElement;
    const rect = c.getBoundingClientRect();
    const sx = c.offsetWidth / rect.width;
    const sy = c.offsetHeight / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = toolRef.current;
    if (t !== "pen" && t !== "highlighter" && t !== "eraser") return;
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const p = pointerPos(e);
    if (t === "eraser") {
      eraseAt(p);
      return;
    }
    activeRef.current = { tool: t, points: [p] };
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = toolRef.current;
    if (e.pointerType === "mouse" && !(e.buttons & 1)) return;
    const p = pointerPos(e);
    if (t === "eraser") {
      eraseAt(p);
      return;
    }
    if (!activeRef.current) return;
    activeRef.current.points.push(p);
    redraw();
  };

  const onPointerUp = () => {
    if (activeRef.current) {
      strokesRef.current.push(activeRef.current);
      activeRef.current = null;
      redraw();
    }
  };

  const eraseAt = (p: { x: number; y: number }) => {
    const radius = 14;
    const before = strokesRef.current.length;
    strokesRef.current = strokesRef.current.filter(
      (s) =>
        !s.points.some(
          (pt) => (pt.x - p.x) ** 2 + (pt.y - p.y) ** 2 <= radius * radius,
        ),
    );
    if (strokesRef.current.length !== before) redraw();
  };

  const cursor =
    tool === "pen" || tool === "highlighter"
      ? "crosshair"
      : tool === "eraser"
        ? "cell"
        : tool === "text"
          ? "text"
          : "default";

  const active = tool === "pen" || tool === "highlighter" || tool === "eraser";

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{
        width,
        height,
        touchAction: "none",
        cursor,
        pointerEvents: active ? "auto" : "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
});

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.points.length < 1) return;
  ctx.save();
  if (s.tool === "highlighter") {
    ctx.strokeStyle = "rgba(253, 224, 71, 0.45)";
    ctx.lineWidth = 18;
    ctx.globalCompositeOperation = "multiply";
  } else {
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(s.points[0].x, s.points[0].y);
  for (let i = 1; i < s.points.length; i++) {
    ctx.lineTo(s.points[i].x, s.points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}