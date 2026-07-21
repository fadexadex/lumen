import type { Lesson } from "./types";

export const trigonometry: Lesson = {
  slug: "trigonometry",
  title: "Basic Trigonometry",
  blurb: "Sine, cosine, tangent in a right triangle.",
  steps: [
    { kind: "text", content: "Basic Trigonometry", x: 80, y: 90, size: "h1" },
    {
      kind: "text",
      content: "For a right triangle with angle θ:",
      x: 80,
      y: 180,
      size: "body",
    },
    { kind: "equation", content: "sin θ = opposite / hypotenuse", x: 120, y: 250 },
    { kind: "equation", content: "cos θ = adjacent / hypotenuse", x: 120, y: 310 },
    { kind: "equation", content: "tan θ = opposite / adjacent", x: 120, y: 370 },
    { kind: "pause", ms: 300 },
    {
      kind: "text",
      content: "Mnemonic:   SOH  ·  CAH  ·  TOA",
      x: 80,
      y: 470,
      size: "h2",
    },
  ],
};