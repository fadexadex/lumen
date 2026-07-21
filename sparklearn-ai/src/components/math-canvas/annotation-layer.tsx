import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from "react";

/** World-space rectangle/point. */
export type WRect = { x: number; y: number; w: number; h: number };
export type WPoint = { x: number; y: number };

export type Place = "above" | "below" | "left" | "right";

type Anno =
  | { id: string; kind: "highlight"; rect: WRect; color: string; label?: string }
  | { id: string; kind: "circle"; at: WPoint; r: number; label?: string }
  | { id: string; kind: "label"; at: WPoint; text: string; place: Place }
  | { id: string; kind: "arrow"; from: WPoint; to: WPoint; text?: string }
  | { id: string; kind: "axis"; x: number; y0: number; y1: number; label?: string }
  | { id: string; kind: "path"; d: string; color: string }; // e.g. overlaid parabola

export interface LumenCanvasController {
  highlight(rect: WRect, opts?: { color?: string; label?: string }): string;
  circle(at: WPoint, opts?: { r?: number; label?: string }): string;
  label(at: WPoint, text: string, place?: Place): string;
  arrow(from: WPoint, to: WPoint, text?: string): string;
  drawAxis(x: number, y0: number, y1: number, label?: string): string;
  drawPath(d: string, color?: string): string;
  remove(id: string): void;
  clear(): void;
}

const COLORS: Record<string, string> = {
  amber: "oklch(0.83 0.16 80)",
  ink: "oklch(0.2 0 0)",
  rose: "oklch(0.62 0.19 20)",
  teal: "oklch(0.7 0.12 190)",
};

export interface AnnotationLayerProps {
  /** Board pixel width/height — must match the live board size so world coords map 1:1. */
  width: number;
  height: number;
}

export const AnnotationLayer = forwardRef<LumenCanvasController, AnnotationLayerProps>(
  function AnnotationLayer({ width, height }, ref) {
    const [annos, setAnnos] = useState<Anno[]>([]);
    const seq = useRef(0);
    const newId = () => `ai-${++seq.current}`;

    const add = useCallback((a: Anno) => {
      setAnnos((xs) => [...xs, a]);
      return a.id;
    }, []);

    useImperativeHandle(
      ref,
      (): LumenCanvasController => ({
        highlight: (rect, o) =>
          add({
            id: newId(),
            kind: "highlight",
            rect,
            color: COLORS[o?.color ?? "amber"] ?? COLORS.amber,
            label: o?.label,
          }),
        circle: (at, o) => add({ id: newId(), kind: "circle", at, r: o?.r ?? 46, label: o?.label }),
        label: (at, text, place = "above") => add({ id: newId(), kind: "label", at, text, place }),
        arrow: (from, to, text) => add({ id: newId(), kind: "arrow", from, to, text }),
        drawAxis: (x, y0, y1, label) => add({ id: newId(), kind: "axis", x, y0, y1, label }),
        drawPath: (d, color = "teal") =>
          add({ id: newId(), kind: "path", d, color: COLORS[color] ?? color }),
        remove: (id) => setAnnos((xs) => xs.filter((a) => a.id !== id)),
        clear: () => setAnnos([]),
      }),
      [add],
    );

    return (
      <svg
        className="mc-annotation-layer"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
      >
        <defs>
          <marker
            id="lumen-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill={COLORS.ink} />
          </marker>
        </defs>
        {annos.map((a) => (
          <AnnoView key={a.id} a={a} />
        ))}
      </svg>
    );
  },
);

function useDrawOn() {
  return useCallback((node: SVGPathElement | SVGEllipseElement | null) => {
    if (!node) return;
    const len = (node as unknown as SVGGeometryElement).getTotalLength?.() ?? 200;
    node.style.strokeDasharray = String(len);
    node.style.strokeDashoffset = String(len);
    node.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
      duration: 520,
      easing: "cubic-bezier(0.22,1,0.36,1)",
      fill: "forwards",
    });
  }, []);
}

function AnnoView({ a }: { a: Anno }) {
  const drawOn = useDrawOn();
  switch (a.kind) {
    case "highlight":
      return (
        <g className="mc-anno mc-anno--highlight">
          <rect
            x={a.rect.x}
            y={a.rect.y}
            width={a.rect.w}
            height={a.rect.h}
            rx={10}
            fill={a.color}
            fillOpacity={0.18}
            stroke={a.color}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
          {a.label && (
            <AnnoLabel
              at={{ x: a.rect.x + a.rect.w / 2, y: a.rect.y }}
              text={a.label}
              place="above"
            />
          )}
        </g>
      );
    case "circle":
      return (
        <g className="mc-anno mc-anno--circle">
          {/* hand-drawn: slightly rotated ellipse, drawn on */}
          <ellipse
            ref={drawOn}
            cx={a.at.x}
            cy={a.at.y}
            rx={a.r}
            ry={a.r * 0.82}
            fill="none"
            stroke={COLORS.rose}
            strokeWidth={3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            transform={`rotate(-8 ${a.at.x} ${a.at.y})`}
          />
          {a.label && (
            <AnnoLabel at={{ x: a.at.x, y: a.at.y - a.r }} text={a.label} place="above" />
          )}
        </g>
      );
    case "axis":
      return (
        <g className="mc-anno mc-anno--axis">
          <path
            ref={drawOn}
            d={`M ${a.x} ${a.y0} L ${a.x} ${a.y1}`}
            stroke={COLORS.ink}
            strokeWidth={2}
            strokeDasharray="2 8"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {a.label && <AnnoLabel at={{ x: a.x, y: a.y0 }} text={a.label} place="above" />}
        </g>
      );
    case "arrow":
      return (
        <g className="mc-anno mc-anno--arrow">
          <path
            ref={drawOn}
            d={`M ${a.from.x} ${a.from.y} L ${a.to.x} ${a.to.y}`}
            stroke={COLORS.ink}
            strokeWidth={2.4}
            fill="none"
            markerEnd="url(#lumen-arrow)"
            vectorEffect="non-scaling-stroke"
          />
          {a.text && (
            <AnnoLabel
              at={{ x: (a.from.x + a.to.x) / 2, y: (a.from.y + a.to.y) / 2 }}
              text={a.text}
              place="above"
            />
          )}
        </g>
      );
    case "path":
      return (
        <path
          ref={drawOn}
          className="mc-anno mc-anno--path"
          d={a.d}
          fill="none"
          stroke={a.color}
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      );
    case "label":
      return <AnnoLabel at={a.at} text={a.text} place={a.place} />;
    default:
      return null;
  }
}

function AnnoLabel({ at, text, place }: { at: WPoint; text: string; place: Place }) {
  const dx = place === "left" ? -12 : place === "right" ? 12 : 0;
  const dy = place === "above" ? -14 : place === "below" ? 22 : 4;
  const anchor = place === "left" ? "end" : place === "right" ? "start" : "middle";
  return (
    <g className="mc-anno mc-anno--label">
      <text
        x={at.x + dx}
        y={at.y + dy}
        textAnchor={anchor}
        fontSize={20}
        fontFamily="var(--font-serif)"
        fill={COLORS.ink}
        style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 4 }}
      >
        {text}
      </text>
    </g>
  );
}
