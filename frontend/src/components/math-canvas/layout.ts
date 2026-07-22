import type { ConceptAnimation, LessonScript, LessonStep } from "@/lib/types";
import { isLegacyDuplicativeVisual } from "@/lib/concept-visual";

export type Beat =
  | { kind: "title"; text: string; x: number; y: number; size: "h1" | "h2"; step: number }
  | { kind: "text"; text: string; x: number; y: number; size: "body"; step: number }
  | { kind: "math"; latex: string; x: number; y: number; step: number }
  | { kind: "options"; options: string[]; answer: string; x: number; y: number; step: number }
  | {
      kind: "visual";
      animation: ConceptAnimation;
      x: number;
      y: number;
      w: number;
      h: number;
      step: number;
    }
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
const H2_LINE_H = 40;
const MATH_H = 58;
const INTRA = 12; // tight: heading → body / body → math
const SECTION = 48; // generous: between lesson sections
const QUIZ_GAP = 56;

/** Approximate CSS word wrapping so absolute-positioned beats never overlap. */
export function wrappedLineCount(text: string, charsPerLine: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const wordLines = Math.max(1, Math.ceil(word.length / charsPerLine));
    if (wordLines > 1) {
      if (used > 0) lines += 1;
      lines += wordLines - 1;
      used = word.length % charsPerLine;
      continue;
    }
    const needed = used === 0 ? word.length : word.length + 1;
    if (used + needed > charsPerLine) {
      lines += 1;
      used = word.length;
    } else {
      used += needed;
    }
  }
  return lines;
}

const h2Height = (title: string) => wrappedLineCount(title, 42) * H2_LINE_H;
const bodyLineCount = (text: string) => wrappedLineCount(text, 62);

function measure(step: LessonStep): number {
  if (step.kind === "explanation") {
    const bodyLines = bodyLineCount(step.body);
    return (
      h2Height(step.title) + INTRA + bodyLines * LINE_H + (step.math ? INTRA + MATH_H : 0) + SECTION
    );
  }
  if (step.kind === "example") {
    const lines = step.lines.reduce(
      (a, l) => a + (l.math ? MATH_H + 8 : LINE_H * bodyLineCount(l.text ?? "")),
      0,
    );
    return h2Height(step.title) + INTRA + lines + SECTION;
  }
  return (
    h2Height(step.title) +
    INTRA +
    LINE_H * bodyLineCount(step.prompt) +
    (step.math ? INTRA + MATH_H : 0) +
    (step.options ? QUIZ_GAP : 0) +
    SECTION
  );
}

export function layoutScript(
  script: LessonScript,
  _visualStepIndex = 0,
): { beats: Beat[]; height: number } {
  const beats: Beat[] = [];
  const stepStarts: number[] = [];
  let y = 104;

  script.steps.forEach((step, i) => {
    // A lesson is one persistent document. Each section gets measured space so
    // completed reasoning remains above the active section without overlapping it.
    const startY = y;
    stepStarts.push(startY);
    beats.push({ kind: "title", text: step.title, x: LEFT_X, y, size: "h2", step: i });
    y += h2Height(step.title) + INTRA;

    if (step.kind === "explanation") {
      beats.push({ kind: "text", text: step.body, x: LEFT_X, y, size: "body", step: i });
      const bodyLines = bodyLineCount(step.body);
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
          y += LINE_H * bodyLineCount(l.text);
        }
      });
    } else {
      beats.push({ kind: "text", text: step.prompt, x: LEFT_X, y, size: "body", step: i });
      y += LINE_H * bodyLineCount(step.prompt);
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

  // The visual is one stable reference surface. Its scene may change, but its
  // position must not jump whenever the learner advances to another section.
  const visualY = 88;

  const hasUsefulVisual =
    script.visual?.kind === "animation" && !isLegacyDuplicativeVisual(script.visual);

  if (hasUsefulVisual && script.visual.kind === "animation") {
    beats.push({
      kind: "visual",
      animation: script.visual,
      x: LEFT_X + COL_W + 72,
      y: visualY,
      w: 620,
      h: 510,
      step: 0,
    });
  } else if (script.diagram?.parabola) {
    const diagramStep = Math.min(2, script.steps.length - 1);
    beats.push({
      kind: "diagram",
      widget: "parabola",
      x: LEFT_X + COL_W + 72,
      y: Math.max(96, (stepStarts[diagramStep] ?? 112) - 8),
      w: 620,
      h: 600,
      step: diagramStep,
      params: script.diagram.parabola,
    });
  }

  const visualBottom = hasUsefulVisual ? visualY + 510 : 0;
  return { beats, height: Math.max(BOARD_H, y + 100, visualBottom + 100) };
}

export function beatCharCount(b: Beat): number {
  if (b.kind === "title" || b.kind === "text") return b.text.length;
  if (b.kind === "math") return b.latex.length;
  return 0;
}
