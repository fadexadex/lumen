import type { Lesson } from "./types";

export const pythagoras: Lesson = {
  slug: "pythagoras",
  title: "Pythagoras' Theorem",
  blurb: "Sides of a right triangle.",
  steps: [
    { kind: "text", content: "Pythagoras' Theorem", x: 80, y: 90, size: "h1" },
    {
      kind: "text",
      content: "In any right triangle with legs a, b and hypotenuse c:",
      x: 80,
      y: 180,
      size: "body",
    },
    { kind: "equation", content: "a^2 + b^2 = c^2", x: 120, y: 250 },
    { kind: "pause", ms: 300 },
    {
      kind: "text",
      content: "Example:   a = 3,  b = 4",
      x: 80,
      y: 340,
      size: "h2",
    },
    { kind: "equation", content: "c^2 = 9 + 16 = 25", x: 120, y: 400 },
    { kind: "equation", content: "c = 5", x: 120, y: 460 },
  ],
};