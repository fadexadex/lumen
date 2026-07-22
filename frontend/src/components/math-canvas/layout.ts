import type { ConceptAnimation, LessonScript } from "@/lib/types";
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

/*
  Horizontal "story deck" layout.

  A lesson is no longer one tall scroll. Each step is a full page laid side by
  side along X: prose on the left, the visual model pinned to its right. The
  visual travels with the active step, so advancing is a clean horizontal glide
  and the graph is ALWAYS in the same on-screen spot at the same zoom — the
  learner never has to zoom out to keep the model in view. The AI navigates the
  same pages by index (see the `goToStep` canvas command).
*/
export const PAGE_STRIDE = 1600; // horizontal distance between consecutive step pages
export const BOARD_H = 820;
export const BOARD_W = PAGE_STRIDE; // legacy alias — one page wide

/* 4pt-ish rhythm tuned for Inter prose + serif math (not Caveat costume) */
export const LEFT_X = 88;
export const COL_W = 680;

/* Where the visual model sits within a page (right of the prose column). */
export const VISUAL_X = LEFT_X + COL_W + 72;
export const VISUAL_W = 620;
export const VISUAL_H = 512;
const VISUAL_Y = 96;
/* Vertical origin of each page's prose column. */
const PAGE_TOP = 132;
const LINE_H = 34;
const H2_LINE_H = 40;
const MATH_H = 58;
const INTRA = 12; // tight: heading → body / body → math

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

export function layoutScript(
  script: LessonScript,
  visualStepIndex = 0,
): { beats: Beat[]; height: number; width: number } {
  const beats: Beat[] = [];
  let contentBottom = 0;

  script.steps.forEach((step, i) => {
    // Each step is its own page. Prose flows top-down WITHIN the page; pages sit
    // side by side along X so navigation is horizontal, never a long scroll.
    const originX = i * PAGE_STRIDE + LEFT_X;
    let y = PAGE_TOP;
    beats.push({ kind: "title", text: step.title, x: originX, y, size: "h2", step: i });
    y += h2Height(step.title) + INTRA;

    if (step.kind === "explanation") {
      beats.push({ kind: "text", text: step.body, x: originX, y, size: "body", step: i });
      const bodyLines = bodyLineCount(step.body);
      y += bodyLines * LINE_H;
      if (step.math) {
        y += INTRA;
        beats.push({ kind: "math", latex: step.math, x: originX, y, step: i });
        y += MATH_H;
      }
    } else if (step.kind === "example") {
      step.lines.forEach((l, li) => {
        if (li > 0) y += 14;
        if (l.math) {
          beats.push({ kind: "math", latex: l.math, x: originX, y, step: i });
          y += MATH_H;
        } else if (l.text) {
          beats.push({ kind: "text", text: l.text, x: originX, y, size: "body", step: i });
          y += LINE_H * bodyLineCount(l.text);
        }
      });
    } else {
      beats.push({ kind: "text", text: step.prompt, x: originX, y, size: "body", step: i });
      y += LINE_H * bodyLineCount(step.prompt);
      if (step.math) {
        y += INTRA;
        beats.push({ kind: "math", latex: step.math, x: originX, y, step: i });
        y += MATH_H;
      }
      if (step.options) {
        y += 20;
        beats.push({
          kind: "options",
          options: step.options,
          answer: step.answer,
          x: originX,
          y,
          step: i,
        });
        y += 88;
      }
    }
    contentBottom = Math.max(contentBottom, y);
  });

  // The visual model travels with the active step: it lives on the current
  // page, so the learner (and the AI) always see it beside the prose being
  // discussed — no drift, no zoom hunting.
  const totalSteps = Math.max(1, script.steps.length);
  const activeStep = Math.min(Math.max(0, visualStepIndex), totalSteps - 1);
  const visualX = activeStep * PAGE_STRIDE + VISUAL_X;

  const animatedVisual =
    script.visual?.kind === "animation" && !isLegacyDuplicativeVisual(script.visual)
      ? script.visual
      : null;

  if (animatedVisual) {
    beats.push({
      kind: "visual",
      animation: animatedVisual,
      x: visualX,
      y: VISUAL_Y,
      w: VISUAL_W,
      h: VISUAL_H,
      step: activeStep,
    });
  } else if (script.diagram?.parabola) {
    beats.push({
      kind: "diagram",
      widget: "parabola",
      x: visualX,
      y: VISUAL_Y,
      w: VISUAL_W,
      h: 600,
      step: activeStep,
      params: script.diagram.parabola,
    });
  }

  const width = totalSteps * PAGE_STRIDE;
  const height = Math.max(BOARD_H, contentBottom + 100, VISUAL_Y + 600 + 60);
  return { beats, height, width };
}

export function beatCharCount(b: Beat): number {
  if (b.kind === "title" || b.kind === "text") return b.text.length;
  if (b.kind === "math") return b.latex.length;
  return 0;
}
