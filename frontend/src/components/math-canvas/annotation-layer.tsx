import { forwardRef, useImperativeHandle, useRef, useState, useCallback, useEffect } from "react";
import { MathText } from "@/lib/math-text";
import { estimateWriteSize, writeBlockRect } from "@/lib/live/place-write";

/** World-space rectangle/point. */
export type WRect = { x: number; y: number; w: number; h: number };
export type WPoint = { x: number; y: number };

export type Place = "above" | "below" | "left" | "right";

export interface CanvasTargetDescription {
  name: string;
  kind: "writing";
  text: string;
}

type Anno =
  | { id: string; kind: "highlight"; rect: WRect; color: string; label?: string }
  | { id: string; kind: "circle"; at: WPoint; r: number; label?: string }
  | { id: string; kind: "label"; at: WPoint; text: string; place: Place }
  | { id: string; kind: "arrow"; from: WPoint; to: WPoint; text?: string }
  | { id: string; kind: "axis"; x: number; y0: number; y1: number; label?: string }
  | { id: string; kind: "path"; d: string; color: string }
  | {
      id: string;
      kind: "writeBlock";
      at: WPoint;
      lines: string[];
      revealed: number;
      writing: boolean;
    };

export interface LumenCanvasController {
  highlight(rect: WRect, opts?: { color?: string; label?: string }): string;
  circle(at: WPoint, opts?: { r?: number; label?: string }): string;
  label(at: WPoint, text: string, place?: Place): string;
  arrow(from: WPoint, to: WPoint, text?: string): string;
  drawAxis(x: number, y0: number, y1: number, label?: string): string;
  drawPath(d: string, color?: string): string;
  /** Multi-line board writing with typewriter. Same jobId replaces in place (resume-safe). */
  writeBlock(at: WPoint, lines: string[], opts?: { jobId?: string }): string;
  /** Stable anchor for an existing write job, used when a calculation continues. */
  writeBlockPosition(jobId: string): WPoint | null;
  cancelWriting(jobId?: string): void;
  remove(id: string): void;
  clear(): void;
  /** World-space boxes already claimed by AI marks (for free-space placement). */
  occupiedRects(excludeId?: string): WRect[];
  /** Resolve precise semantic targets inside Lumen's own previous writing. */
  targetRect(name: string): WRect | null;
  targetPoint(name: string): WPoint | null;
  targetDescriptions(): CanvasTargetDescription[];
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
  /** Current parent world zoom, used to keep marker thickness hand-highlighter sized. */
  viewScale?: number;
}

export function continuedRevealCount(
  previous: { lines: string[]; revealed: number } | null,
  nextLines: string[],
): number {
  if (!previous) return 0;
  const previousText = previous.lines.join("\n");
  const keepsEveryPreviousLine = previous.lines.every((line, index) => nextLines[index] === line);
  return keepsEveryPreviousLine ? Math.min(previous.revealed, previousText.length) : 0;
}

export const AnnotationLayer = forwardRef<LumenCanvasController, AnnotationLayerProps>(
  function AnnotationLayer({ width, height, viewScale = 1 }, ref) {
    const [annos, setAnnos] = useState<Anno[]>([]);
    const annosRef = useRef(annos);
    annosRef.current = annos;
    const seq = useRef(0);
    const newId = () => `ai-${++seq.current}`;

    const add = useCallback((a: Anno) => {
      const next = [...annosRef.current, a];
      annosRef.current = next;
      setAnnos(next);
      return a.id;
    }, []);

    // Typewriter: ~1 char / 36ms — slower, more “handwritten” cadence.
    const writingActive = annos.some((a) => a.kind === "writeBlock" && a.writing);
    useEffect(() => {
      if (!writingActive) return;
      const t = window.setInterval(() => {
        setAnnos((xs) => {
          let changed = false;
          const next = xs.map((a) => {
            if (a.kind !== "writeBlock" || !a.writing) return a;
            const total = a.lines.join("\n").length;
            const revealed = Math.min(total, a.revealed + 1);
            if (revealed === a.revealed && revealed >= total) {
              if (a.writing) {
                changed = true;
                return { ...a, writing: false };
              }
              return a;
            }
            if (revealed === a.revealed) return a;
            changed = true;
            return { ...a, revealed, writing: revealed < total };
          });
          return changed ? next : xs;
        });
      }, 36);
      return () => clearInterval(t);
    }, [writingActive]);

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
        writeBlock: (at, lines, o) => {
          const id = o?.jobId ?? newId();
          const clean = lines
            .map((l) => l.trimEnd())
            .filter((l, i, arr) => l.length || i < arr.length - 1);
          const previous = annosRef.current.find(
            (a): a is Extract<Anno, { kind: "writeBlock" }> =>
              a.id === id && a.kind === "writeBlock",
          );
          const revealed = continuedRevealCount(previous ?? null, clean);
          const total = clean.join("\n").length;
          const without = annosRef.current.filter((a) => a.id !== id);
          const next: Anno[] = [
            ...without,
            {
              id,
              kind: "writeBlock",
              at,
              lines: clean.length ? clean : [""],
              revealed,
              writing: revealed < total,
            },
          ];
          annosRef.current = next;
          setAnnos(next);
          return id;
        },
        writeBlockPosition: (jobId) => {
          const block = annosRef.current.find((a) => a.id === jobId && a.kind === "writeBlock");
          return block?.kind === "writeBlock" ? { ...block.at } : null;
        },
        cancelWriting: (jobId) => {
          const next = annosRef.current.map((a) => {
            if (a.kind !== "writeBlock" || !a.writing) return a;
            if (jobId && a.id !== jobId) return a;
            return { ...a, writing: false };
          });
          annosRef.current = next;
          setAnnos(next);
        },
        remove: (id) => {
          const next = annosRef.current.filter((a) => a.id !== id);
          annosRef.current = next;
          setAnnos(next);
        },
        clear: () => {
          annosRef.current = [];
          setAnnos([]);
        },
        occupiedRects: (excludeId) => occupiedFromAnnos(annosRef.current, excludeId),
        targetRect: (name) => annotationTargetRect(annosRef.current, name),
        targetPoint: (name) => {
          const rect = annotationTargetRect(annosRef.current, name);
          return rect ? { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 } : null;
        },
        targetDescriptions: () => annotationTargetDescriptions(annosRef.current),
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
          <AnnoView key={a.id} a={a} viewScale={viewScale} />
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

function annotationTargetRect(annos: Anno[], name: string): WRect | null {
  const lineMatch = /^work\.(.+)\.line(\d+)$/.exec(name);
  if (lineMatch) {
    const block = annos.find(
      (a): a is Extract<Anno, { kind: "writeBlock" }> =>
        a.kind === "writeBlock" && a.id === lineMatch[1],
    );
    const lineIndex = Number(lineMatch[2]) - 1;
    const line = block?.lines[lineIndex];
    if (!block || line == null) return null;
    const visualLength = line.replace(/\\[a-zA-Z]+/g, "").replace(/[{}$]/g, "").length;
    const lineWidth = Math.min(520, Math.max(64, 20 + visualLength * 9));
    return {
      x: block.at.x - 6,
      y: block.at.y + lineIndex * 40,
      w: lineWidth,
      h: 32,
    };
  }

  const blockMatch = /^work\.(.+)$/.exec(name);
  if (!blockMatch) return null;
  const block = annos.find(
    (a): a is Extract<Anno, { kind: "writeBlock" }> =>
      a.kind === "writeBlock" && a.id === blockMatch[1],
  );
  return block ? writeBlockRect(block.at, block.lines) : null;
}

function annotationTargetDescriptions(annos: Anno[]): CanvasTargetDescription[] {
  const out: CanvasTargetDescription[] = [];
  for (const a of annos) {
    if (a.kind !== "writeBlock") continue;
    out.push({ name: `work.${a.id}`, kind: "writing", text: "Lumen's complete writing block" });
    a.lines.forEach((line, index) => {
      out.push({ name: `work.${a.id}.line${index + 1}`, kind: "writing", text: line });
    });
  }
  return out;
}

function AnnoView({ a, viewScale }: { a: Anno; viewScale: number }) {
  const drawOn = useDrawOn();
  switch (a.kind) {
    case "highlight": {
      const y = a.rect.y + a.rect.h * 0.42;
      const x0 = a.rect.x + 3;
      const x1 = a.rect.x + Math.max(6, a.rect.w - 3);
      const bend = Math.min(6, a.rect.h * 0.08);
      const screenStrokeWidth = Math.min(24, Math.max(18, a.rect.h * 0.48));
      const strokeWidth = screenStrokeWidth / Math.max(0.25, viewScale);
      return (
        <g className="mc-anno mc-anno--highlight">
          <path
            ref={drawOn}
            d={`M ${x0} ${y + bend} C ${x0 + a.rect.w * 0.3} ${y - bend}, ${x0 + a.rect.w * 0.68} ${y + bend * 0.4}, ${x1} ${y - bend * 0.35}`}
            fill="none"
            stroke={a.color}
            strokeOpacity={0.42}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ mixBlendMode: "multiply" }}
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
    }
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
    case "writeBlock":
      return <WriteBlockView a={a} />;
    default:
      return null;
  }
}

function occupiedFromAnnos(annos: Anno[], excludeId?: string): WRect[] {
  const out: WRect[] = [];
  for (const a of annos) {
    if (excludeId && a.id === excludeId) continue;
    if (a.kind === "writeBlock") {
      out.push(writeBlockRect(a.at, a.lines));
    } else if (a.kind === "highlight") {
      out.push(a.rect);
    } else if (a.kind === "circle") {
      out.push({ x: a.at.x - a.r, y: a.at.y - a.r, w: a.r * 2, h: a.r * 2 });
    } else if (a.kind === "label") {
      const w = Math.min(280, 24 + a.text.length * 10);
      out.push({ x: a.at.x - w / 2, y: a.at.y - 22, w, h: 28 });
    }
  }
  return out;
}

function WriteBlockView({ a }: { a: Extract<Anno, { kind: "writeBlock" }> }) {
  const full = a.lines.join("\n");
  const shown = full.slice(0, a.revealed);
  const shownLines = shown.split("\n");
  const { w: boxW } = estimateWriteSize(a.lines);
  const { h: boxH } = estimateWriteSize(shownLines);
  return (
    <g className={`mc-anno mc-anno--write${a.writing ? " is-writing" : ""}`}>
      {/* Soft wash — ink on board, not a floating card */}
      <rect
        className="mc-write-wash"
        x={a.at.x - 10}
        y={a.at.y - 6}
        width={boxW}
        height={boxH}
        rx={6}
        fill="oklch(0.985 0.008 95)"
        fillOpacity={0.55}
        stroke="none"
      />
      {shownLines.map((line, i) => (
        <foreignObject
          key={i}
          x={a.at.x}
          y={a.at.y - 7 + i * 40}
          width={Math.max(40, boxW - 16)}
          height={44}
          className="mc-write-foreign"
        >
          <div className="mc-write-line">
            <MathText text={line} />
            {a.writing && i === shownLines.length - 1 ? (
              <span className="mc-write-caret">|</span>
            ) : null}
          </div>
        </foreignObject>
      ))}
    </g>
  );
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
