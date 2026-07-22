import { layoutScript, type Beat } from "@/components/math-canvas/layout";
import type { LessonScript } from "@/lib/types";
import { activeConceptScene } from "@/lib/concept-visual";
import type { WPoint, WRect } from "@/components/math-canvas/annotation-layer";
import { parabolaViewport } from "@/components/math-canvas/parabola-geometry";

export interface ResolvedTargets {
  names: string[]; // sent to the agent as board context
  descriptions: TargetDescription[];
  point(name: string): WPoint | null;
  rect(name: string): WRect | null;
  parabola: ParabolaGeom | null;
  visual: { primitive: string; narration: string; sceneIndex: number } | null;
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
  stepIndex = 0,
  visualSceneIndex?: number,
): ResolvedTargets {
  const { beats } = layoutScript(script, stepIndex);
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

  const visualBeat = beats.find(
    (beat): beat is Extract<Beat, { kind: "visual" }> => beat.kind === "visual",
  );
  let visual: ResolvedTargets["visual"] = null;
  let visualParabola: {
    beat: Extract<Beat, { kind: "visual" }>;
    a: number;
    b: number;
    c: number;
  } | null = null;
  if (visualBeat) {
    const active = activeConceptScene(
      visualBeat.animation,
      stepIndex,
      script.steps.length,
      visualSceneIndex,
    );
    const scene = active.scene;
    visual = { primitive: scene.primitive, narration: scene.narration, sceneIndex: active.index };
    const frame = { x: visualBeat.x, y: visualBeat.y, w: visualBeat.w, h: visualBeat.h };
    addTarget("visual", "region", `${scene.primitive}: ${scene.narration}`, frame);

    if (scene.primitive === "plotFunction") {
      const plot = { x: frame.x + 38, y: frame.y + 88, w: frame.w - 76, h: frame.h - 178 };
      addTarget("visual.curve", "region", `${scene.fn} function curve`, plot);
      if (scene.fn === "parabola")
        visualParabola = { beat: visualBeat, a: scene.a, b: scene.b, c: scene.c };
    } else if (scene.primitive === "balanceScale") {
      addTarget(
        "visual.left",
        "region",
        `left side: ${scene.left.map((item) => item.label).join(" plus ")}`,
        { x: frame.x + 40, y: frame.y + 145, w: 245, h: 220 },
      );
      addTarget(
        "visual.right",
        "region",
        `right side: ${scene.right.map((item) => item.label).join(" plus ")}`,
        { x: frame.x + 335, y: frame.y + 145, w: 245, h: 220 },
      );
      addTarget("visual.beam", "region", "balance beam", {
        x: frame.x + 90,
        y: frame.y + 175,
        w: 440,
        h: 55,
      });
    } else if (scene.primitive === "numberLineWalk") {
      addTarget(
        "visual.numberLine",
        "region",
        `number line from ${scene.range[0]} to ${scene.range[1]}`,
        { x: frame.x + 55, y: frame.y + 250, w: frame.w - 110, h: 80 },
      );
      [scene.start, ...scene.hops.map((hop) => hop.to)].forEach((value, index) => {
        const ratio = (value - scene.range[0]) / (scene.range[1] - scene.range[0]);
        addTarget(`visual.stop${index + 1}`, "point", `number-line stop at ${value}`, {
          x: frame.x + 55 + ratio * (frame.w - 110) - 20,
          y: frame.y + 270,
          w: 40,
          h: 40,
        });
      });
    } else if (scene.primitive === "stepReveal") {
      const lineH = Math.min(62, 280 / scene.lines.length);
      scene.lines.forEach((line, index) =>
        addTarget(
          `visual.line${index + 1}`,
          "equation",
          line.math ?? line.text ?? `worked line ${index + 1}`,
          { x: frame.x + 55, y: frame.y + 105 + index * lineH, w: frame.w - 110, h: lineH },
        ),
      );
    } else if (scene.primitive === "fractionBar") {
      addTarget("visual.firstFraction", "region", `${scene.shaded} of ${scene.parts} parts`, {
        x: frame.x + 70,
        y: frame.y + 145,
        w: frame.w - 140,
        h: 105,
      });
      if (scene.compareTo)
        addTarget(
          "visual.secondFraction",
          "region",
          `${scene.compareTo.shaded} of ${scene.compareTo.parts} parts`,
          { x: frame.x + 70, y: frame.y + 275, w: frame.w - 140, h: 105 },
        );
    } else if (scene.primitive === "geometryTransform") {
      addTarget("visual.original", "region", `original ${scene.shape}`, {
        x: frame.x + 100,
        y: frame.y + 150,
        w: 190,
        h: 210,
      });
      addTarget("visual.transformed", "region", `${scene.transform}ed ${scene.shape}`, {
        x: frame.x + 320,
        y: frame.y + 150,
        w: 210,
        h: 210,
      });
    } else {
      addTarget("visual.model", "region", `${scene.primitive} model`, {
        x: frame.x + 45,
        y: frame.y + 100,
        w: frame.w - 90,
        h: frame.h - 180,
      });
    }
  }

  // Parabola geometry (if this lesson has a diagram)
  let parabola: ParabolaGeom | null = null;
  const dia = beats.find((b) => b.kind === "diagram") as
    Extract<Beat, { kind: "diagram" }> | undefined;
  if ((dia && dia.params) || visualParabola) {
    const source = dia?.params ?? visualParabola!;
    const { a, b, c } = parabolaOverride ?? source;
    const graphViewport = parabolaViewport(a, b, c);
    const graphXMin = graphViewport.xMin;
    const graphXMax = graphViewport.xMax;
    const graphYMin = graphViewport.yMin;
    const graphYMax = graphViewport.yMax;
    const visualHasTabs = !!visualParabola && visualParabola.beat.animation.scenes.length > 1;
    // Concept card: 18px shell padding, 56px heading, optional 50px tabs,
    // then the shared 560×200 interactive ParabolaWidget plot.
    const plotX = dia ? dia.x : visualParabola!.beat.x + 30;
    const plotY = dia ? dia.y : visualParabola!.beat.y + 18 + 56 + (visualHasTabs ? 50 : 0);
    const plotW = dia ? dia.w : 560;
    const plotH = dia ? dia.h - 130 : 200;
    const graphToWorld = (gx: number, gy: number): WPoint => ({
      x: plotX + ((gx - graphXMin) / (graphXMax - graphXMin)) * plotW,
      y: plotY + (plotH - ((gy - graphYMin) / (graphYMax - graphYMin)) * plotH),
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
    const parabolaBeat =
      dia ??
      ({
        ...visualParabola!.beat,
        kind: "diagram",
        widget: "parabola",
        params: { a, b, c },
      } as Extract<Beat, { kind: "diagram" }>);
    parabola = {
      beat: parabolaBeat,
      a,
      b,
      c,
      X_MIN: graphXMin,
      X_MAX: graphXMax,
      Y_MIN: graphYMin,
      Y_MAX: graphYMax,
      graphToWorld,
      vertex,
      roots,
    };

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
    rects.set("graph", { x: plotX, y: plotY, w: plotW, h: plotH });
    points.set("graph", { x: plotX + plotW / 2, y: plotY + plotH / 2 });
    names.push("graph");
    descriptions.push({ name: "graph", kind: "region", text: "live parabola graph" });
  }

  return {
    names,
    descriptions,
    point: (n) => points.get(n) ?? (rects.get(n) ? centerOf(rects.get(n)!) : null),
    rect: (n) => rects.get(n) ?? null,
    parabola,
    visual,
  };

  function addTarget(name: string, kind: TargetDescription["kind"], text: string, rect: WRect) {
    rects.set(name, rect);
    points.set(name, centerOf(rect));
    names.push(name);
    descriptions.push({ name, kind, text });
  }
}
