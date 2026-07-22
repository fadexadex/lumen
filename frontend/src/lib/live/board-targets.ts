import { layoutScript, type Beat } from "@/components/math-canvas/layout";
import type { LessonScript } from "@/lib/types";
import type { WPoint, WRect } from "@/components/math-canvas/annotation-layer";

export interface ResolvedTargets {
  names: string[]; // sent to the agent as board context
  point(name: string): WPoint | null;
  rect(name: string): WRect | null;
  parabola: ParabolaGeom | null;
}

/** Mirror parabola-widget.tsx math so graph coords → board(world) coords. */
export interface ParabolaGeom {
  beat: Extract<Beat, { kind: "diagram" }>;
  a: number;
  b: number;
  c: number;
  X_MIN: number;
  X_MAX: number;
  Y_MIN: number;
  Y_MAX: number;
  graphToWorld(gx: number, gy: number): WPoint;
  vertex: WPoint | null;
  roots: WPoint[];
}

const X_MIN = -10,
  X_MAX = 10,
  Y_MIN = -10,
  Y_MAX = 10;

/** Mirrors MathCanvas.estimateBeatBox — keep in sync (see layout.ts). */
export function estimateBeatRect(b: Beat): WRect {
  if (b.kind === "title")
    return { x: b.x, y: b.y, w: b.size === "h1" ? 980 : 720, h: b.size === "h1" ? 90 : 60 };
  if (b.kind === "text")
    return { x: b.x, y: b.y, w: 700, h: 44 * Math.max(1, Math.ceil(b.text.length / 58)) };
  if (b.kind === "math") return { x: b.x, y: b.y, w: 560, h: 96 };
  if (b.kind === "options") return { x: b.x, y: b.y, w: 640, h: 110 };
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

const centerOf = (r: WRect): WPoint => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export function resolveTargets(
  script: LessonScript,
  parabolaOverride?: { a: number; b: number; c: number } | null,
): ResolvedTargets {
  const { beats } = layoutScript(script);
  const names: string[] = [];
  const rects = new Map<string, WRect>();
  const points = new Map<string, WPoint>();

  // Per-step equations/titles → step<N>.equation / step<N>.title
  const stepMath: Record<number, Beat> = {};
  beats.forEach((b) => {
    if (b.kind === "math" && stepMath[b.step] == null) stepMath[b.step] = b;
    if (b.kind === "title" && b.size === "h2") {
      const key = `step${b.step}.title`;
      rects.set(key, estimateBeatRect(b));
      names.push(key);
    }
  });
  Object.entries(stepMath).forEach(([step, b]) => {
    const key = `step${step}.equation`;
    const r = estimateBeatRect(b);
    rects.set(key, r);
    points.set(key, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
    names.push(key);
  });

  // Parabola geometry (if this lesson has a diagram)
  let parabola: ParabolaGeom | null = null;
  const dia = beats.find((b) => b.kind === "diagram") as
    Extract<Beat, { kind: "diagram" }> | undefined;
  if (dia && dia.params) {
    const { a, b, c } = parabolaOverride ?? dia.params;
    const plotW = dia.w;
    const plotH = dia.h - 130; // matches ParabolaWidget
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
        ? [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)].map((r) =>
            graphToWorld(r, 0),
          )
        : [];
    parabola = { beat: dia, a, b, c, X_MIN, X_MAX, Y_MIN, Y_MAX, graphToWorld, vertex, roots };

    if (vertex) {
      points.set("vertex", vertex);
      names.push("vertex");
    }
    roots.forEach((p, i) => {
      points.set(`root${i + 1}`, p);
      names.push(`root${i + 1}`);
    });
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
