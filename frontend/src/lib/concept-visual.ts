import type { ConceptAnimation, ConceptScene, LessonScript } from "@/lib/types";

/** Map lesson progress to one deterministic scene; no second timer can drift from narration. */
export function sceneIndexForStep(
  stepIndex: number,
  stepTotal: number,
  sceneTotal: number,
): number {
  if (sceneTotal <= 1 || stepTotal <= 1) return 0;
  const progress = Math.max(0, Math.min(1, stepIndex / (stepTotal - 1)));
  return Math.min(sceneTotal - 1, Math.round(progress * (sceneTotal - 1)));
}

export function activeConceptScene(
  animation: ConceptAnimation,
  stepIndex: number,
  stepTotal: number,
  preferredIndex?: number,
): { scene: ConceptScene; index: number } {
  const automatic = sceneIndexForStep(stepIndex, stepTotal, animation.scenes.length);
  const index = Math.max(0, Math.min(animation.scenes.length - 1, preferredIndex ?? automatic));
  return { scene: animation.scenes[index], index };
}

export function lessonVisualSummary(
  script: LessonScript,
  stepIndex: number,
  preferredIndex?: number,
): string {
  if (!script.visual || script.visual.kind === "none") return "";
  const { scene, index } = activeConceptScene(
    script.visual,
    stepIndex,
    script.steps.length,
    preferredIndex,
  );
  return `${script.visual.title}; scene ${index + 1} of ${script.visual.scenes.length}; ${scene.primitive}: ${scene.narration}`;
}
