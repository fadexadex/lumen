import { layoutScript, type Beat } from "@/components/math-canvas/layout";
import type { LessonScript } from "@/lib/types";
import type { WPoint, WRect } from "@/components/math-canvas/annotation-layer";

export interface ResolvedTargets {
  names: string[]; // sent to the agent as board context
  descriptions: TargetDescription[];
  point(name: string): WPoint | null;
  rect(name: string): WRect | null;
  parabola: ParabolaGeom | null;
}

export interface TargetDescription {
  name: string;
  kind: "title" | "equation" | "point" | "region";
  text: string;
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
  if (b.kind === "math") {
    // Match the rendered single-line equation rather than reserving a card-sized box.
    // A broad 560x96 estimate caused one highlight to cover adjacent equations.
    const visualLength = b.latex.replace(/\\[a-zA-Z]+/g, "").replace(/[{}$]/g, "").length;
    const w = Math.min(520, Math.max(80, 24 + visualLength * 10));
    return { x: b.x, y: b.y, w, h: 56 };
  }
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
  const descriptions: TargetDescription[] = [];
  const rects = new Map<string, WRect>();
  const points = new Map<string, WPoint>();

  // Per-step equations/titles → step<N>.equation / step<N>.title
  const mathByStep = new Map<
    number,
    Array<{ beat: Extract<Beat, { kind: "math" }>; index: number }>
  >();
  beats.forEach((b) => {
    if (b.kind === "math") {
      const equations = mathByStep.get(b.step) ?? [];
      equations.push({ beat: b, index: equations.length + 1 });
      mathByStep.set(b.step, equations);
    }
    if (b.kind === "title" && b.size === "h2") {
      const key = `step${b.step}.title`;
      rects.set(key, estimateBeatRect(b));
      names.push(key);
      descriptions.push({ name: key, kind: "title", text: b.text });
    }
  });
  mathByStep.forEach((equations, step) => {
    equations.forEach(({ beat, index }) => {
      const key = equations.length === 1 ? `step${step}.equation` : `step${step}.equation${index}`;
      const r = estimateBeatRect(beat);
      rects.set(key, r);
      points.set(key, centerOf(r));
      names.push(key);
      descriptions.push({ name: key, kind: "equation", text: beat.latex });

      // Preserve the original unnumbered command target as a resolver-only alias.
      if (index === 1 && equations.length > 1) {
        const alias = `step${step}.equation`;
        rects.set(alias, r);
        points.set(alias, centerOf(r));
      }
    });
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
      descriptions.push({ name: "vertex", kind: "point", text: "vertex of the live parabola" });
    }
    roots.forEach((p, i) => {
      points.set(`root${i + 1}`, p);
      names.push(`root${i + 1}`);
      descriptions.push({
        name: `root${i + 1}`,
        kind: "point",
        text: `x-intercept ${i + 1} of the live parabola`,
      });
    });
    // axis of symmetry handled specially in the controller (needs full height)
    if (a !== 0) {
      names.push("axisOfSymmetry");
      descriptions.push({
        name: "axisOfSymmetry",
        kind: "region",
        text: "vertical axis through the parabola vertex",
      });
    }
    // the graph area itself
    rects.set("graph", { x: dia.x, y: dia.y, w: dia.w, h: plotH });
    points.set("graph", { x: dia.x + dia.w / 2, y: dia.y + plotH / 2 });
    names.push("graph");
    descriptions.push({ name: "graph", kind: "region", text: "live parabola graph" });
  }

  return {
    names,
    descriptions,
    point: (n) => points.get(n) ?? (rects.get(n) ? centerOf(rects.get(n)!) : null),
    rect: (n) => rects.get(n) ?? null,
    parabola,
  };
}
