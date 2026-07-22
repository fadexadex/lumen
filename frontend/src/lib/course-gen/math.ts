import type { LessonScript, LessonDiagram } from "@/lib/types";

/**
 * Recompute roots and vertex from a, b, c. The model may *suggest* a parabola,
 * but arithmetic is never trusted from an LLM — the server owns roots/vertex so
 * the Live tutor circles the correct points (see docs/plan-systems-analysis.html,
 * "Hard rules"). Always run before persisting a generated script.
 */
export function enrichParabola(p: { a: number; b: number; c: number }): {
  a: number;
  b: number;
  c: number;
  roots: number[];
  vertex: [number, number];
} {
  const { a, b, c } = p;
  const vertexX = a === 0 ? 0 : -b / (2 * a);
  const vertexY = a === 0 ? c : c - (b * b) / (4 * a);
  const vertex: [number, number] = [round(vertexX), round(vertexY)];

  const disc = b * b - 4 * a * c;
  let roots: number[];
  if (a === 0 || disc < 0) {
    roots = [];
  } else if (disc === 0) {
    roots = [round(-b / (2 * a))];
  } else {
    const sq = Math.sqrt(disc);
    roots = [round((-b + sq) / (2 * a)), round((-b - sq) / (2 * a))];
  }
  return { a, b, c, roots, vertex };
}

/** Round to 4 decimals to avoid float noise; `+ 0` normalizes -0 → 0. */
function round(n: number): number {
  return Math.round(n * 1e4) / 1e4 + 0;
}

/**
 * Overwrite any model-provided diagram arithmetic with server-computed truth.
 * Returns a new diagram; leaves non-parabola diagram kinds untouched for now.
 */
export function enrichDiagram(diagram: LessonDiagram | undefined): LessonDiagram | undefined {
  if (!diagram?.parabola) return diagram;
  const { a, b, c, roots, vertex } = enrichParabola(diagram.parabola);
  return { ...diagram, parabola: { a, b, c, roots, vertex } };
}

/** Apply diagram enrichment to a whole script before it is marked `ready`. */
export function enrichScript(script: LessonScript): LessonScript {
  if (!script.diagram) return script;
  return { ...script, diagram: enrichDiagram(script.diagram) };
}
