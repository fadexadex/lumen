import type { LessonScript, LessonStep } from "@/lib/types";

export type Beat =
  | { kind: "title"; text: string; x: number; y: number; size: "h1" | "h2"; step: number }
  | { kind: "text"; text: string; x: number; y: number; size: "body"; step: number }
  | { kind: "math"; latex: string; x: number; y: number; step: number }
  | { kind: "options"; options: string[]; answer: string; x: number; y: number; step: number }
  | { kind: "diagram"; widget: "parabola"; x: number; y: number; w: number; h: number; step: number; params?: { a: number; b: number; c: number } };

export const BOARD_W = 1600;
export const BOARD_H = 1000;

const LEFT_X = 80;
const COL_W = 720;
const LINE_H = 44;
const H1_H = 90;
const H2_H = 60;
const MATH_H = 78;
const GAP = 24;

function measure(step: LessonStep): number {
  const titleH = H2_H;
  if (step.kind === "explanation") {
    const bodyLines = Math.max(1, Math.ceil(step.body.length / 58));
    return titleH + bodyLines * LINE_H + (step.math ? MATH_H : 0) + GAP;
  }
  if (step.kind === "example") {
    return titleH + step.lines.reduce((a, l) => a + (l.math ? MATH_H : LINE_H * Math.max(1, Math.ceil((l.text ?? "").length / 58))), 0) + GAP;
  }
  return titleH + LINE_H * Math.max(1, Math.ceil(step.prompt.length / 58)) + (step.math ? MATH_H : 0) + (step.options ? 80 : 0) + GAP;
}

export function layoutScript(script: LessonScript): { beats: Beat[]; height: number } {
  const beats: Beat[] = [];
  let y = 90;

  // Big lesson title
  beats.push({ kind: "title", text: script.title, x: LEFT_X, y: y, size: "h1", step: 0 });
  y += H1_H + GAP;

  script.steps.forEach((step, i) => {
    const startY = y;
    // step title
    beats.push({ kind: "title", text: step.title, x: LEFT_X, y, size: "h2", step: i });
    y += H2_H;

    if (step.kind === "explanation") {
      beats.push({ kind: "text", text: step.body, x: LEFT_X + 20, y, size: "body", step: i });
      const bodyLines = Math.max(1, Math.ceil(step.body.length / 58));
      y += bodyLines * LINE_H;
      if (step.math) {
        beats.push({ kind: "math", latex: step.math, x: LEFT_X + 40, y, step: i });
        y += MATH_H;
      }
    } else if (step.kind === "example") {
      step.lines.forEach((l) => {
        if (l.math) {
          beats.push({ kind: "math", latex: l.math, x: LEFT_X + 40, y, step: i });
          y += MATH_H;
        } else if (l.text) {
          beats.push({ kind: "text", text: l.text, x: LEFT_X + 20, y, size: "body", step: i });
          y += LINE_H * Math.max(1, Math.ceil(l.text.length / 58));
        }
      });
    } else {
      beats.push({ kind: "text", text: step.prompt, x: LEFT_X + 20, y, size: "body", step: i });
      y += LINE_H * Math.max(1, Math.ceil(step.prompt.length / 58));
      if (step.math) {
        beats.push({ kind: "math", latex: step.math, x: LEFT_X + 40, y, step: i });
        y += MATH_H;
      }
      if (step.options) {
        beats.push({ kind: "options", options: step.options, answer: step.answer, x: LEFT_X + 20, y, step: i });
        y += 90;
      }
    }
    y = startY + measure(step);
  });

  // Right-column diagram (parabola) if available
  if (script.diagram?.parabola) {
    beats.push({
      kind: "diagram",
      widget: "parabola",
      x: LEFT_X + COL_W + 80,
      y: 180,
      w: 640,
      h: 640,
      step: Math.min(2, script.steps.length - 1),
      params: script.diagram.parabola,
    });
  }

  return { beats, height: Math.max(BOARD_H, y + 120) };
}

export function beatCharCount(b: Beat): number {
  if (b.kind === "title" || b.kind === "text") return b.text.length;
  if (b.kind === "math") return b.latex.length;
  return 0;
}