import type { ConceptAnimation, ConceptScene, LessonScript } from "@/lib/types";

/**
 * Older generated courses used a prose-copying step reveal as their fallback
 * "visual". It adds no mathematical representation and merely duplicates the
 * lesson in a second card, so keep it out of both the canvas and agent context.
 */
export function isLegacyDuplicativeVisual(animation: ConceptAnimation): boolean {
  if (animation.scenes.length !== 1 || animation.scenes[0]?.primitive !== "stepReveal") {
    return false;
  }
  const narration = animation.scenes[0].narration.trim().toLowerCase();
  const goal = animation.goal.trim().toLowerCase();
  return (
    narration === "follow how each line builds on the idea before it." &&
    goal === "reveal the lesson's mathematical reasoning one clear step at a time."
  );
}

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
  if (!script.visual || script.visual.kind === "none" || isLegacyDuplicativeVisual(script.visual))
    return "";
  const { scene, index } = activeConceptScene(
    script.visual,
    stepIndex,
    script.steps.length,
    preferredIndex,
  );
  return `${script.visual.title}; scene ${index + 1} of ${script.visual.scenes.length}; ${scene.primitive}: ${scene.narration}`;
}
