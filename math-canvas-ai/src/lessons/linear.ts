import type { Lesson } from "./types";

export const linear: Lesson = {
  slug: "linear",
  title: "Linear Equations",
  blurb: "Slope-intercept form and solving for x.",
  steps: [
    { kind: "text", content: "Linear Equations", x: 80, y: 90, size: "h1" },
    {
      kind: "text",
      content: "A linear equation has the form:",
      x: 80,
      y: 180,
      size: "body",
    },
    { kind: "equation", content: "y = mx + b", x: 120, y: 240 },
    {
      kind: "text",
      content: "m is the slope, b is the y-intercept.",
      x: 120,
      y: 310,
      size: "body",
    },
    { kind: "pause", ms: 300 },
    {
      kind: "text",
      content: "Example:   solve   2x + 6 = 0",
      x: 80,
      y: 400,
      size: "h2",
    },
    { kind: "equation", content: "2x = −6", x: 120, y: 460 },
    { kind: "equation", content: "x = −3", x: 120, y: 520 },
  ],
};