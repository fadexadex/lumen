import type { ConceptScene, LessonScript, LessonDiagram, LessonVisual } from "@/lib/types";

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
  const generatedParabola =
    script.visual?.kind === "animation"
      ? script.visual.scenes.find(
          (scene) => scene.primitive === "plotFunction" && scene.fn === "parabola",
        )
      : undefined;
  const synchronizedDiagram = generatedParabola
    ? {
        ...script.diagram,
        parabola: {
          a: generatedParabola.a,
          b: generatedParabola.b,
          c: generatedParabola.c,
        },
      }
    : script.diagram;

  return {
    ...script,
    title: cleanGeneratedProse(script.title),
    steps: script.steps.map((step) => {
      if (step.kind === "explanation") {
        return {
          ...step,
          title: cleanGeneratedProse(step.title),
          body: cleanGeneratedProse(step.body),
        };
      }
      if (step.kind === "example") {
        return {
          ...step,
          title: cleanGeneratedProse(step.title),
          lines: step.lines.map((line) => ({
            ...line,
            text: line.text ? cleanGeneratedProse(line.text) : line.text,
          })),
        };
      }
      return {
        ...step,
        title: cleanGeneratedProse(step.title),
        prompt: cleanGeneratedProse(step.prompt),
        options: step.options?.map(cleanGeneratedProse),
        answer: cleanGeneratedProse(step.answer),
        hint: step.hint ? cleanGeneratedProse(step.hint) : step.hint,
      };
    }),
    // The first generated parabola is also the live tool's source of truth.
    // This removes a fragile requirement for the model to duplicate coefficients perfectly.
    diagram: enrichDiagram(synchronizedDiagram),
    visual:
      script.visual?.kind === "animation"
        ? {
            ...script.visual,
            title: cleanGeneratedProse(script.visual.title),
            goal: cleanGeneratedProse(script.visual.goal),
            scenes: script.visual.scenes.map(normalizeConceptScene),
          }
        : script.visual,
  };
}

function normalizeConceptScene(scene: ConceptScene): ConceptScene {
  const narration = cleanGeneratedProse(scene.narration);
  if (
    scene.primitive === "plotFunction" &&
    scene.fn === "line" &&
    /number\s*line/i.test(narration) &&
    scene.a !== 0
  ) {
    const target = round(-scene.b / scene.a);
    const min = Math.min(-5, Math.floor(target - 4));
    const max = Math.max(5, Math.ceil(target + 4));
    return {
      primitive: "numberLineWalk",
      narration,
      range: [min, max],
      start: 0,
      hops: [{ to: target, label: `x = ${target}` }],
    };
  }
  return { ...scene, narration };
}

/** Honest recovery used only when rich visual generation fails twice. */
export function createFallbackVisual(script: LessonScript): LessonVisual {
  return {
    kind: "none",
    reason: `A trustworthy interactive visual could not be generated for ${cleanGeneratedProse(script.title)}.`,
  };
}

/** The board is not a Markdown surface; remove common model-authored emphasis markers. */
export function cleanGeneratedProse(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}
