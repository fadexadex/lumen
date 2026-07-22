import type { LessonScript } from "./types";
import { useTutorStore } from "./tutor-store";

export const lessonScripts: Record<string, LessonScript> = {
  "quad-1": {
    moduleId: "quad-1",
    title: "What is a quadratic?",
    diagram: {
      parabola: { a: 1, b: -5, c: 6, roots: [2, 3], vertex: [2.5, -0.25] },
      captions: [
        "Every quadratic is a curve — a parabola.",
        "The a, b, c control how wide, tall and shifted it is.",
        "Here's y = x² − 5x + 6 · it crosses zero at x=2 and x=3.",
        "Spot the x² — that's the tell.",
      ],
    },
    steps: [
      {
        kind: "explanation",
        title: "A quadratic is a curve in disguise",
        body: "A quadratic equation is any equation you can write like this — an x², maybe an x, and a plain number.",
        math: "ax^2 + bx + c = 0",
      },
      {
        kind: "explanation",
        title: "The pieces",
        body: "a, b, and c are just numbers. The important part is the x²  — that's what makes it a quadratic and gives it its curved shape.",
      },
      {
        kind: "example",
        title: "Some real quadratics",
        lines: [
          { math: "x^2 - 5x + 6 = 0" },
          { math: "2x^2 + 3x - 2 = 0" },
          { math: "x^2 = 9" },
          { text: "That last one is a quadratic too — b is just 0." },
        ],
      },
      {
        kind: "practice",
        title: "Your turn",
        prompt: "Which of these is a quadratic?",
        options: ["3x + 2 = 0", "x^2 + x = 5"],
        answer: "x^2 + x = 5",
        hint: "Look for the x² — that's the giveaway.",
      },
    ],
  },
  "quad-3": {
    moduleId: "quad-3",
    title: "Solving by factoring",
    diagram: {
      parabola: { a: 1, b: -5, c: 6, roots: [2, 3], vertex: [2.5, -0.25] },
      tiles: { xSquared: 1, x: -5, unit: 6, factored: ["x − 2", "x − 3"] },
      numberLine: {
        points: [
          { x: 2, label: "x=2" },
          { x: 3, label: "x=3" },
        ],
        range: [-1, 5],
      },
      captions: [
        "Product of two things = 0 · one of them must be zero.",
        "Find two numbers that multiply to c and add to b.",
        "So x = 2 or x = 3 — where the curve touches zero.",
      ],
    },
    steps: [
      {
        kind: "explanation",
        title: "The idea",
        body: "If two things multiply to zero, at least one of them must be zero. Factoring turns a quadratic into two brackets multiplied together, and then we chase down each bracket.",
        math: "(x - p)(x - q) = 0 \\;\\Rightarrow\\; x = p \\text{ or } x = q",
      },
      {
        kind: "example",
        title: "Let's factor one",
        lines: [
          { math: "x^2 - 5x + 6 = 0" },
          { text: "We need two numbers that multiply to 6 and add to −5." },
          { text: "−2 and −3 work: (−2)(−3) = 6 and (−2)+(−3) = −5." },
          { math: "(x - 2)(x - 3) = 0" },
          { math: "x = 2 \\quad \\text{or} \\quad x = 3" },
        ],
      },
      {
        kind: "practice",
        title: "Try one",
        prompt: "Solve by factoring:",
        math: "x^2 - 7x + 12 = 0",
        answer: "x = 3 or x = 4",
        hint: "What two numbers multiply to 12 and add to −7?",
      },
    ],
  },
  "quad-5": {
    moduleId: "quad-5",
    title: "The quadratic formula",
    diagram: {
      parabola: { a: 2, b: 3, c: -2, roots: [0.5, -2], vertex: [-0.75, -3.125] },
      numberLine: {
        points: [
          { x: -2, label: "x=−2" },
          { x: 0.5, label: "x=½" },
        ],
        range: [-4, 2],
      },
      captions: [
        "The formula never fails, even when factoring stalls.",
        "Plug a, b, c in carefully — mind the signs.",
        "The ± gives you both roots at once.",
      ],
    },
    steps: [
      {
        kind: "explanation",
        title: "The one that always works",
        body: "When factoring gets tricky, the quadratic formula never fails. Given ax² + bx + c = 0:",
        math: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
      },
      {
        kind: "example",
        title: "Watch it in action",
        lines: [
          { math: "2x^2 + 3x - 2 = 0" },
          { text: "So a = 2, b = 3, c = −2." },
          { math: "x = \\frac{-3 \\pm \\sqrt{9 + 16}}{4} = \\frac{-3 \\pm 5}{4}" },
          { math: "x = \\tfrac{1}{2} \\quad \\text{or} \\quad x = -2" },
        ],
      },
      {
        kind: "practice",
        title: "Try it",
        prompt: "Use the formula:",
        math: "x^2 + 4x + 1 = 0",
        answer: "x = -2 + sqrt(3) or x = -2 - sqrt(3)",
        hint: "Plug a=1, b=4, c=1 in carefully.",
      },
    ],
  },
};

export function getLessonScript(moduleId: string, title: string): LessonScript {
  // Store-first: a generated, ready module wins over the legacy hand-authored
  // scripts, which now serve only as a fallback for un-generated modules.
  const generated = useTutorStore.getState().course?.modules.find((m) => m.id === moduleId)?.script;
  if (generated) return generated;

  return (
    lessonScripts[moduleId] ?? {
      moduleId,
      title,
      steps: [
        {
          kind: "explanation",
          title,
          body: "This lesson is coming soon. In the meantime, try the whiteboard tools — sketch, write, and play with the fx math keyboard.",
        },
      ],
    }
  );
}
