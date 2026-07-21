# 05 · Canvas Controller & World-Space Annotations (THE core)

This is the differentiator and the hardest part. LiveKit/Gemini give us "AI talks." This file
is what makes "AI **draws on the board while talking, and the marks stay pinned when the learner
zooms**." It's 100% our code.

Three sub-systems:
1. **World-space annotation layer** — an SVG inside `.mc-world` so marks transform with content.
2. **`LumenCanvasController`** — imperative API (`circle`, `highlight`, `label`, `drawAxis`,
   `plotParabola`, `panTo`, `clear`) with animations.
3. **Target resolver** (`board-targets.ts`) — turns semantic names ("vertex", "root1",
   "step2.equation") into world coordinates using the existing layout + parabola math.

---

## 1. Why world-space, and where exactly

Today in `MathCanvas.tsx`:

```
.mc-viewport                      (screen space, owns pointer/pan/zoom)
  .mc-world  transform: translate(view.x,view.y) scale(view.scale)   ← world transform
    .mc-board  width=BOARD_W height=BOARD_H
      .mc-lesson-layer            (beats, absolutely positioned in world coords)
  .mc-ink-layer                   (SCREEN space — full viewport canvas)   ← do NOT use for AI
  .mc-notes-layer                 (SCREEN space)
```

The ink/notes layers sit *outside* `.mc-world`, sized to the raw viewport. If AI drew there,
its marks would **detach on pan/zoom** — fatal for "circle the vertex then zoom in."

**Fix:** add ONE child inside `.mc-board`:

```
.mc-board
  .mc-lesson-layer      (existing)
  .mc-annotation-layer  (NEW — <svg viewBox="0 0 BOARD_W BOARD_H">, pointer-events:none)
```

Because it's inside `.mc-world`, it inherits the exact same `translate+scale`. An ellipse at
world `(x,y)` is *always* over the same board content, at any zoom. Zero per-frame reprojection
needed. Line thickness scales too — we counter that with `vector-effect="non-scaling-stroke"`
where we want crisp strokes regardless of zoom.

**User ink stays screen-space** (unchanged). We only add a world-space layer for AI. Don't mix.

---

## 2. `components/math-canvas/annotation-layer.tsx`

A single SVG that renders a list of annotation objects and exposes an imperative controller via
`ref`. Animations use CSS classes + the Web Animations API for draw-on.

```tsx
import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from "react";
import { BOARD_W, BOARD_H } from "./layout";

/** World-space rectangle/point. */
export type WRect = { x: number; y: number; w: number; h: number };
export type WPoint = { x: number; y: number };

type Anno =
  | { id: string; kind: "highlight"; rect: WRect; color: string; label?: string }
  | { id: string; kind: "circle"; at: WPoint; r: number; label?: string }
  | { id: string; kind: "label"; at: WPoint; text: string; place: Place }
  | { id: string; kind: "arrow"; from: WPoint; to: WPoint; text?: string }
  | { id: string; kind: "axis"; x: number; y0: number; y1: number; label?: string }
  | { id: string; kind: "path"; d: string; color: string };   // e.g. overlaid parabola

export type Place = "above" | "below" | "left" | "right";

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
  ink:   "oklch(0.2 0 0)",
  rose:  "oklch(0.62 0.19 20)",
  teal:  "oklch(0.7 0.12 190)",
};

export const AnnotationLayer = forwardRef<LumenCanvasController>(function AnnotationLayer(_props, ref) {
  const [annos, setAnnos] = useState<Anno[]>([]);
  const seq = useRef(0);
  const newId = () => `ai-${++seq.current}`;

  const add = useCallback((a: Anno) => { setAnnos((xs) => [...xs, a]); return a.id; }, []);

  useImperativeHandle(ref, (): LumenCanvasController => ({
    highlight: (rect, o) => add({ id: newId(), kind: "highlight", rect, color: COLORS[o?.color ?? "amber"], label: o?.label }),
    circle:    (at, o)   => add({ id: newId(), kind: "circle", at, r: o?.r ?? 46, label: o?.label }),
    label:     (at, text, place = "above") => add({ id: newId(), kind: "label", at, text, place }),
    arrow:     (from, to, text) => add({ id: newId(), kind: "arrow", from, to, text }),
    drawAxis:  (x, y0, y1, label) => add({ id: newId(), kind: "axis", x, y0, y1, label }),
    drawPath:  (d, color = "teal") => add({ id: newId(), kind: "path", d, color: COLORS[color] ?? color }),
    remove:    (id) => setAnnos((xs) => xs.filter((a) => a.id !== id)),
    clear:     () => setAnnos([]),
  }), [add]);

  return (
    <svg
      className="mc-annotation-layer"
      width={BOARD_W}
      height={BOARD_H}
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
    >
      <defs>
        <marker id="lumen-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={COLORS.ink} />
        </marker>
      </defs>
      {annos.map((a) => <AnnoView key={a.id} a={a} />)}
    </svg>
  );
});
```

### 2a. The renderers + draw-on animation

Each annotation renders as SVG and animates *on* using `stroke-dasharray/dashoffset`
(hand-drawn draw-in) or fade-rise (labels). We use a callback ref to run the Web Animations API
once the node mounts.

```tsx
function useDrawOn() {
  return useCallback((node: SVGPathElement | SVGEllipseElement | null) => {
    if (!node) return;
    const len = (node as SVGGeometryElement).getTotalLength?.() ?? 200;
    node.style.strokeDasharray = String(len);
    node.style.strokeDashoffset = String(len);
    node.animate(
      [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration: 520, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" },
    );
  }, []);
}

function AnnoView({ a }: { a: Anno }) {
  const drawOn = useDrawOn();
  switch (a.kind) {
    case "highlight":
      return (
        <g className="mc-anno mc-anno--highlight">
          <rect
            x={a.rect.x} y={a.rect.y} width={a.rect.w} height={a.rect.h} rx={10}
            fill={a.color} fillOpacity={0.18} stroke={a.color} strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
          {a.label && <AnnoLabel at={{ x: a.rect.x + a.rect.w / 2, y: a.rect.y }} text={a.label} place="above" />}
        </g>
      );
    case "circle":
      return (
        <g className="mc-anno mc-anno--circle">
          {/* hand-drawn: slightly rotated ellipse, drawn on */}
          <ellipse
            ref={drawOn}
            cx={a.at.x} cy={a.at.y} rx={a.r} ry={a.r * 0.82}
            fill="none" stroke={COLORS.rose} strokeWidth={3} strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            transform={`rotate(-8 ${a.at.x} ${a.at.y})`}
          />
          {a.label && <AnnoLabel at={{ x: a.at.x, y: a.at.y - a.r }} text={a.label} place="above" />}
        </g>
      );
    case "axis":
      return (
        <g className="mc-anno mc-anno--axis">
          <path
            ref={drawOn}
            d={`M ${a.x} ${a.y0} L ${a.x} ${a.y1}`}
            stroke={COLORS.ink} strokeWidth={2} strokeDasharray="2 8" strokeLinecap="round"
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
            stroke={COLORS.ink} strokeWidth={2.4} fill="none" markerEnd="url(#lumen-arrow)"
            vectorEffect="non-scaling-stroke"
          />
          {a.text && <AnnoLabel at={{ x: (a.from.x + a.to.x) / 2, y: (a.from.y + a.to.y) / 2 }} text={a.text} place="above" />}
        </g>
      );
    case "path":
      return (
        <path
          ref={drawOn} className="mc-anno mc-anno--path"
          d={a.d} fill="none" stroke={a.color} strokeWidth={3} strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      );
    case "label":
      return <AnnoLabel at={a.at} text={a.text} place={a.place} />;
  }
}

function AnnoLabel({ at, text, place }: { at: WPoint; text: string; place: Place }) {
  const dx = place === "left" ? -12 : place === "right" ? 12 : 0;
  const dy = place === "above" ? -14 : place === "below" ? 22 : 4;
  const anchor = place === "left" ? "end" : place === "right" ? "start" : "middle";
  return (
    <g className="mc-anno mc-anno--label" style={{ /* fade-rise via CSS class below */ }}>
      <text
        x={at.x + dx} y={at.y + dy} textAnchor={anchor as any}
        fontSize={20} fontFamily="var(--font-serif)" fill={COLORS.ink}
        style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 4 }}
      >
        {text}
      </text>
    </g>
  );
}
```

### 2b. Annotation CSS (add to `math-canvas.css`)

```css
.mc-annotation-layer { z-index: 5; }             /* above lesson layer, below chrome */
.mc-anno--highlight rect { animation: anno-pop 360ms var(--ease-tutor) both; }
.mc-anno--label     { animation: anno-rise 340ms var(--ease-tutor) both; }
@keyframes anno-pop  { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
@keyframes anno-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
/* subtle breathing so a highlight keeps drawing the eye while Lumen talks */
.mc-anno--highlight rect { will-change: transform; }
```

---

## 3. Target resolver — `lib/live/board-targets.ts`

The model says `"vertex"`; the client turns that into a world point. We compute targets from
the same data the board renders: `layoutScript(script)` beats + the parabola params. This keeps
the model prompt free of pixels and keeps marks correct.

```ts
import { layoutScript, BOARD_W, BOARD_H, type Beat } from "@/components/math-canvas/layout";
import type { LessonScript } from "@/lib/types";
import type { WPoint, WRect } from "@/components/math-canvas/annotation-layer";

export interface ResolvedTargets {
  names: string[];                      // sent to the agent as board context
  point(name: string): WPoint | null;
  rect(name: string): WRect | null;
  parabola: ParabolaGeom | null;
}

/** Mirror parabola-widget.tsx math so graph coords → board(world) coords. */
interface ParabolaGeom {
  beat: Extract<Beat, { kind: "diagram" }>;
  a: number; b: number; c: number;
  X_MIN: number; X_MAX: number; Y_MIN: number; Y_MAX: number;
  graphToWorld(gx: number, gy: number): WPoint;
  vertex: WPoint | null;
  roots: WPoint[];
}

const X_MIN = -10, X_MAX = 10, Y_MIN = -10, Y_MAX = 10;

function estimateBeatRect(b: Beat): WRect {
  // Same estimates as MathCanvas.estimateBeatBox (keep in sync).
  if (b.kind === "title") return { x: b.x, y: b.y, w: b.size === "h1" ? 980 : 720, h: b.size === "h1" ? 90 : 60 };
  if (b.kind === "text")  return { x: b.x, y: b.y, w: 700, h: 44 * Math.max(1, Math.ceil(b.text.length / 58)) };
  if (b.kind === "math")  return { x: b.x, y: b.y, w: 560, h: 96 };
  if (b.kind === "options") return { x: b.x, y: b.y, w: 640, h: 110 };
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

export function resolveTargets(script: LessonScript): ResolvedTargets {
  const { beats } = layoutScript(script);
  const names: string[] = [];
  const rects = new Map<string, WRect>();
  const points = new Map<string, WPoint>();

  // Per-step equations/titles → step<N>.equation / step<N>.title
  let stepMath: Record<number, Beat> = {};
  beats.forEach((b) => {
    if (b.kind === "math" && stepMath[b.step] == null) stepMath[b.step] = b;
    if (b.kind === "title" && b.size === "h2") {
      const key = `step${b.step}.title`;
      rects.set(key, estimateBeatRect(b)); names.push(key);
    }
  });
  Object.entries(stepMath).forEach(([step, b]) => {
    const key = `step${step}.equation`;
    const r = estimateBeatRect(b);
    rects.set(key, r); points.set(key, { x: r.x + r.w / 2, y: r.y + r.h / 2 }); names.push(key);
  });

  // Parabola geometry (if this lesson has a diagram)
  let parabola: ParabolaGeom | null = null;
  const dia = beats.find((b) => b.kind === "diagram") as Extract<Beat, { kind: "diagram" }> | undefined;
  if (dia && dia.params) {
    const { a, b, c } = dia.params;
    const plotW = dia.w;
    const plotH = dia.h - 130;               // matches ParabolaWidget
    const graphToWorld = (gx: number, gy: number): WPoint => ({
      x: dia.x + ((gx - X_MIN) / (X_MAX - X_MIN)) * plotW,
      y: dia.y + (plotH - ((gy - Y_MIN) / (Y_MAX - Y_MIN)) * plotH),
    });
    const vx = a !== 0 ? -b / (2 * a) : 0;
    const vy = c - (b * b) / (4 * a);
    const vertex = a !== 0 ? graphToWorld(vx, vy) : null;
    const disc = b * b - 4 * a * c;
    const roots =
      disc >= 0 && a !== 0
        ? [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)].map((r) => graphToWorld(r, 0))
        : [];
    parabola = { beat: dia, a, b, c, X_MIN, X_MAX, Y_MIN, Y_MAX, graphToWorld, vertex, roots };

    if (vertex) { points.set("vertex", vertex); names.push("vertex"); }
    roots.forEach((p, i) => { points.set(`root${i + 1}`, p); names.push(`root${i + 1}`); });
    // axis of symmetry handled specially in the controller (needs full height)
    if (a !== 0) names.push("axisOfSymmetry");
    // the graph area itself
    rects.set("graph", { x: dia.x, y: dia.y, w: dia.w, h: plotH });
    points.set("graph", { x: dia.x + dia.w / 2, y: dia.y + plotH / 2 });
    names.push("graph");
  }

  return {
    names,
    point: (n) => points.get(n) ?? (rects.get(n) ? centerOf(rects.get(n)!) : null),
    rect: (n) => rects.get(n) ?? null,
    parabola,
  };
}

const centerOf = (r: WRect): WPoint => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
```

> Keep `estimateBeatRect` in sync with `MathCanvas.estimateBeatBox`. Consider exporting the
> real function from `MathCanvas`/`layout` later to remove the duplication (noted in `10`).

---

## 4. Wiring into `MathCanvas.tsx`

Three small edits. (Full diff-style guidance in `10`.)

**(a) Mount the annotation layer inside `.mc-board`:**
```tsx
// after <div className="mc-lesson-layer">…</div>, still inside .mc-board:
<AnnotationLayer ref={annoRef} />
```

**(b) Register the controller + coordinate helpers on mount** (mirrors `whiteboard-bridge`):
```tsx
import { setCanvasController } from "@/lib/live/canvas-agent-bridge";
import { AnnotationLayer, type LumenCanvasController } from "./annotation-layer";
import { resolveTargets } from "@/lib/live/board-targets";

const annoRef = useRef<LumenCanvasController | null>(null);

useEffect(() => {
  const targets = resolveTargets(script);
  setCanvasController({
    anno: () => annoRef.current,
    targets,
    // expose the live view + pan API so panTo works (see below)
    getView: () => viewRef.current,
    setView,
    viewportEl: () => viewportRef.current,
    screenToWorld: (sx, sy) => {
      const v = viewRef.current;
      return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
    },
    worldToScreen: (wx, wy) => {
      const v = viewRef.current;
      return { x: wx * v.scale + v.x, y: wy * v.scale + v.y };
    },
    boardSize: { w: BOARD_W, h: BOARD_H },
  });
  return () => setCanvasController(null);
}, [script]);
```

**(c) Nothing else changes** — pan/zoom/ink keep working; the layer just rides along inside
`.mc-world`.

---

## 5. `panTo` / `focus_on` — animate the view to a target

`panTo` re-centers a world rect in the viewport by animating `view`. Reuse the same
zoom-around-point math already in `MathCanvas` (`cx - (cx - v.x) * k`).

```ts
// inside canvas-agent-bridge.ts (or a helper the controller calls)
export function panToRect(ctrl: CanvasControllerHandle, rect: WRect, pad = 120) {
  const el = ctrl.viewportEl(); if (!el) return;
  const availW = el.clientWidth - pad * 2;
  const availH = el.clientHeight - pad * 2;
  const targetScale = Math.max(0.4, Math.min(1.6, Math.min(availW / rect.w, availH / rect.h)));
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const nx = el.clientWidth / 2 - cx * targetScale;
  const ny = el.clientHeight / 2 - cy * targetScale;
  animateView(ctrl, { x: nx, y: ny, scale: targetScale }, 620);
}

function animateView(ctrl: CanvasControllerHandle, to: View, ms: number) {
  const from = ctrl.getView();
  const t0 = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);      // easeOutCubic
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    const k = ease(t);
    ctrl.setView({
      x: from.x + (to.x - from.x) * k,
      y: from.y + (to.y - from.y) * k,
      scale: from.scale + (to.scale - from.scale) * k,
    });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
```

Because annotations are inside `.mc-world`, they animate right along with this pan — the "camera
move to the vertex" feels cinematic and the circle stays exactly on the vertex.

---

## 6. Demo-critical correctness tests

- [ ] `circle("vertex")` lands the ellipse exactly on the parabola vertex at 100% zoom.
- [ ] Zoom to 200% and pan — the circle stays glued to the vertex (proves world-space).
- [ ] `drawAxis` spans the graph height and passes through the vertex x.
- [ ] `plotParabola(0.3,0,-2)` overlays a wider parabola using `graphToWorld` sampling
      (controller builds the `d` path by sampling x∈[X_MIN,X_MAX], same as the widget).
- [ ] `panTo("vertex")` smoothly centers and the mark tracks the camera.
- [ ] `clear()` removes all AI marks; user ink untouched.

Next: `06` defines the exact JSON command protocol + `applyCommand` that maps agent tool calls
to these controller methods (including resolving `"vertex"` → `WPoint`).
