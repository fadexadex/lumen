import { describe, expect, it } from "vitest";
import { activeConceptScene, sceneIndexForStep } from "@/lib/concept-visual";
import type { ConceptAnimation } from "@/lib/types";

const animation: ConceptAnimation = {
  kind: "animation",
  title: "A visual sequence",
  goal: "Keep visual progress aligned with lesson progress.",
  advance: "step",
  scenes: [
    { primitive: "stepReveal", narration: "First idea appears.", lines: [{ math: "x+1=3" }] },
    { primitive: "stepReveal", narration: "Second idea appears.", lines: [{ math: "x=2" }] },
    { primitive: "fractionBar", narration: "The final comparison appears.", parts: 4, shaded: 2 },
  ],
};

describe("concept visual scene selection", () => {
  it("maps the first and final lesson steps to the first and final scenes", () => {
    expect(sceneIndexForStep(0, 5, 3)).toBe(0);
    expect(sceneIndexForStep(4, 5, 3)).toBe(2);
    expect(activeConceptScene(animation, 2, 5).index).toBe(1);
  });

  it("clamps out-of-range progress", () => {
    expect(sceneIndexForStep(-4, 5, 3)).toBe(0);
    expect(sceneIndexForStep(40, 5, 3)).toBe(2);
  });
});
