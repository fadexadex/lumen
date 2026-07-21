import type { LessonScript } from "@/lib/types";
import { resolveTargets } from "./board-targets";
import { prettifyLatex } from "@/lib/whiteboard-bridge";

export interface BoardState {
  moduleId: string;
  stepIndex: number;
  stepTotal: number;
  stepTitle: string;
  equation: string; // human-readable
  parabola: { a: number; b: number; c: number } | null;
  targets: string[]; // names the model may reference
}

export function buildBoardState(
  script: LessonScript,
  stepIndex: number,
  moduleId: string,
): BoardState {
  const step = script.steps[stepIndex];
  const T = resolveTargets(script);

  // Prefer the step's own math; fall back to the diagram equation.
  const stepMath =
    step && "math" in step && step.math
      ? step.math
      : script.diagram?.parabola
        ? paramsToEq(script.diagram.parabola)
        : "";

  return {
    moduleId,
    stepIndex,
    stepTotal: script.steps.length,
    stepTitle: step?.title ?? script.title,
    equation: stepMath ? prettifyLatex(stepMath) : "",
    parabola: T.parabola ? { a: T.parabola.a, b: T.parabola.b, c: T.parabola.c } : null,
    targets: T.names,
  };
}

function paramsToEq(p: { a: number; b: number; c: number }): string {
  const s = (n: number) => (n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`);
  return `y = ${p.a}x^2 ${s(p.b)}x ${s(p.c)}`;
}
