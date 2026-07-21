import type { LessonScript, LessonStep } from "@/lib/types";

export type Beat =
  | { kind: "title"; text: string; x: number; y: number; size: "h1" | "h2"; step: number }
  | { kind: "text"; text: string; x: number; y: number; size: "body"; step: number }
  | { kind: "math"; latex: string; x: number; y: number; step: number }
  | { kind: "options"; options: string[]; answer: string; x: number; y: number; step: number }
  | {
      kind: "diagram";
      widget: "parabola";
      x: number;
      y: number;
      w: number;
      h: number;
      step: number;
      params?: { a: number; b: number; c: number };
    };

export const BOARD_W = 1600;
export const BOARD_H = 1000;

/* 4pt-ish rhythm tuned for Inter prose + serif math (not Caveat costume) */
export const LEFT_X = 88;
export const COL_W = 680;
const LINE_H = 34;
const H1_H = 68;
const H2_H = 40;
const MATH_H = 58;
const INTRA = 12; // tight: heading → body / body → math
const SECTION = 48; // generous: between lesson sections
const QUIZ_GAP = 56;

function measure(step: LessonStep): number {
  if (step.kind === "explanation") {
    const bodyLines = Math.max(1, Math.ceil(step.body.length / 62));
    return H2_H + INTRA + bodyLines * LINE_H + (step.math ? INTRA + MATH_H : 0) + SECTION;
  }
  if (step.kind === "example") {
    const lines = step.lines.reduce(
      (a, l) =>
        a + (l.math ? MATH_H + 8 : LINE_H * Math.max(1, Math.ceil((l.text ?? "").length / 62))),
      0,
    );
    return H2_H + INTRA + lines + SECTION;
  }
  return (
    H2_H +
    INTRA +
    LINE_H * Math.max(1, Math.ceil(step.prompt.length / 62)) +
    (step.math ? INTRA + MATH_H : 0) +
    (step.options ? QUIZ_GAP : 0) +
    SECTION
  );
}

export function layoutScript(script: LessonScript): { beats: Beat[]; height: number } {
  const beats: Beat[] = [];
  let y = 72;

  beats.push({ kind: "title", text: script.title, x: LEFT_X, y, size: "h1", step: 0 });
  y += H1_H + SECTION;

  script.steps.forEach((step, i) => {
    const startY = y;
    beats.push({ kind: "title", text: step.title, x: LEFT_X, y, size: "h2", step: i });
    y += H2_H + INTRA;

    if (step.kind === "explanation") {
      beats.push({ kind: "text", text: step.body, x: LEFT_X, y, size: "body", step: i });
      const bodyLines = Math.max(1, Math.ceil(step.body.length / 62));
      y += bodyLines * LINE_H;
      if (step.math) {
        y += INTRA;
        beats.push({ kind: "math", latex: step.math, x: LEFT_X, y, step: i });
        y += MATH_H;
      }
    } else if (step.kind === "example") {
      step.lines.forEach((l, li) => {
        if (li > 0) y += 14;
        if (l.math) {
          beats.push({ kind: "math", latex: l.math, x: LEFT_X, y, step: i });
          y += MATH_H;
        } else if (l.text) {
          beats.push({ kind: "text", text: l.text, x: LEFT_X, y, size: "body", step: i });
          y += LINE_H * Math.max(1, Math.ceil(l.text.length / 62));
        }
      });
    } else {
      beats.push({ kind: "text", text: step.prompt, x: LEFT_X, y, size: "body", step: i });
      y += LINE_H * Math.max(1, Math.ceil(step.prompt.length / 62));
      if (step.math) {
        y += INTRA;
        beats.push({ kind: "math", latex: step.math, x: LEFT_X, y, step: i });
        y += MATH_H;
      }
      if (step.options) {
        y += 20;
        beats.push({
          kind: "options",
          options: step.options,
          answer: step.answer,
          x: LEFT_X,
          y,
          step: i,
        });
        y += 88;
      }
    }
    y = Math.max(y + SECTION * 0.25, startY + measure(step));
  });

  if (script.diagram?.parabola) {
    beats.push({
      kind: "diagram",
      widget: "parabola",
      x: LEFT_X + COL_W + 72,
      y: 160,
      w: 620,
      h: 600,
      step: Math.min(2, script.steps.length - 1),
      params: script.diagram.parabola,
    });
  }

  return { beats, height: Math.max(BOARD_H, y + 100) };
}

export function beatCharCount(b: Beat): number {
  if (b.kind === "title" || b.kind === "text") return b.text.length;
  if (b.kind === "math") return b.latex.length;
  return 0;
}
