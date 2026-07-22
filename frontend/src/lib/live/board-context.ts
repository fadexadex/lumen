import type { LessonScript } from "@/lib/types";
import { resolveTargets } from "./board-targets";
import type { TargetDescription } from "./board-targets";
import type { CanvasTargetDescription } from "@/components/math-canvas/annotation-layer";
import { prettifyLatex } from "@/lib/whiteboard-bridge";
import { getCanvasController } from "./canvas-agent-bridge";
import { lessonVisualSummary } from "@/lib/concept-visual";

export interface BoardState {
  moduleId: string;
  stepIndex: number;
  stepTotal: number;
  stepTitle: string;
  equation: string; // human-readable
  parabola: { a: number; b: number; c: number } | null;
  visual: string;
  targets: string[]; // names the model may reference
  targetDetails: Array<TargetDescription | CanvasTargetDescription>;
}

export function buildBoardState(
  script: LessonScript,
  stepIndex: number,
  moduleId: string,
  parabolaOverride?: { a: number; b: number; c: number } | null,
): BoardState {
  // Prefer explicit override, then live canvas controller params, then script defaults.
  const controller = getCanvasController();
  const live = controller?.targets.parabola;
  const writingTargets = controller?.anno()?.targetDescriptions() ?? [];
  const override = parabolaOverride ?? (live ? { a: live.a, b: live.b, c: live.c } : null);

  const T = resolveTargets(script, override, stepIndex);
  const step = script.steps[stepIndex];

  const stepMath =
    step && "math" in step && step.math
      ? step.math
      : T.parabola
        ? paramsToEq({ a: T.parabola.a, b: T.parabola.b, c: T.parabola.c })
        : "";

  return {
    moduleId,
    stepIndex,
    stepTotal: script.steps.length,
    stepTitle: step?.title ?? script.title,
    equation: stepMath ? prettifyLatex(stepMath) : "",
    parabola: T.parabola ? { a: T.parabola.a, b: T.parabola.b, c: T.parabola.c } : null,
    visual: lessonVisualSummary(script, stepIndex),
    targets: [...T.names, ...writingTargets.map((target) => target.name)],
    targetDetails: [...T.descriptions, ...writingTargets],
  };
}

function paramsToEq(p: { a: number; b: number; c: number }): string {
  const s = (n: number) => (n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`);
  return `y = ${p.a}x^2 ${s(p.b)}x ${s(p.c)}`;
}
