import type { Roadmap, RoadmapModule } from "./types";

const quadratic: RoadmapModule[] = [
  { id: "quad-1", title: "What is a quadratic?", blurb: "Meet ax² + bx + c." },
  { id: "quad-2", title: "Reading the graph", blurb: "Parabolas, vertex, roots." },
  { id: "quad-3", title: "Solving by factoring", blurb: "Turn it into (x − p)(x − q)." },
  { id: "quad-4", title: "Completing the square", blurb: "A tidy algebraic trick." },
  { id: "quad-5", title: "The quadratic formula", blurb: "The one that always works." },
  { id: "quad-6", title: "The discriminant", blurb: "How many solutions live inside." },
  { id: "quad-7", title: "Word problems", blurb: "Bringing it into the real world." },
];

const generic = (topic: string): RoadmapModule[] => [
  { id: "gen-1", title: `Getting curious about ${topic}`, blurb: "A gentle start." },
  { id: "gen-2", title: `Core ideas of ${topic}`, blurb: "The must-knows." },
  { id: "gen-3", title: `Worked examples`, blurb: "See it step by step." },
  { id: "gen-4", title: `Try it yourself`, blurb: "Practice with hints." },
  { id: "gen-5", title: `Going deeper`, blurb: "Interesting corners." },
  { id: "gen-6", title: `Real-world uses`, blurb: "Where you'll meet it." },
];

export function buildRoadmap(topic: string, _grade: number): Roadmap {
  const t = topic.toLowerCase();
  if (t.includes("quadratic")) {
    return { topic: "Quadratic Equations", modules: quadratic };
  }
  return { topic: topic || "Your topic", modules: generic(topic || "this topic") };
}
