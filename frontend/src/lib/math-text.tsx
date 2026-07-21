import { Fragment } from "react";
import { Equation } from "@/components/math-canvas/equation";
import { renderKatexToString } from "@/lib/katex";

export type MathTextSegment = { kind: "text" | "math"; value: string };

const EXPLICIT_MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
const MATH_WORDS = new Set(["sin", "cos", "tan", "log", "ln", "lim", "max", "min"]);
const SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};
const SUBSCRIPTS: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
};

export function normalizeMathNotation(input: string): string {
  return input
    .replace(
      /[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g,
      (digits) => `^{${[...digits].map((digit) => SUPERSCRIPTS[digit]).join("")}}`,
    )
    .replace(
      /[₀₁₂₃₄₅₆₇₈₉]+/g,
      (digits) => `_{${[...digits].map((digit) => SUBSCRIPTS[digit]).join("")}}`,
    )
    .replace(/−/g, "-")
    .replace(/×/g, "\\times")
    .replace(/÷/g, "\\div")
    .replace(/√\s*\(([^()]*)\)/g, "\\sqrt{$1}");
}

function looksLikeStandaloneMath(input: string): boolean {
  const value = input.trim();
  if (!value || !/[=+\-*/^_<>≤≥±⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]|\\(?:frac|sqrt|sum|int)/.test(value)) {
    return false;
  }
  const words = value.match(/[A-Za-z]{3,}/g) ?? [];
  return words.every((word) => MATH_WORDS.has(word.toLowerCase()));
}

/** Split tutor output into prose and math, supporting $, $$, \(...\), and \[...\]. */
export function splitMathText(input: string): MathTextSegment[] {
  const segments: MathTextSegment[] = [];
  let cursor = 0;
  let foundExplicitMath = false;
  EXPLICIT_MATH.lastIndex = 0;
  for (const match of input.matchAll(EXPLICIT_MATH)) {
    foundExplicitMath = true;
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ kind: "text", value: input.slice(cursor, index) });
    segments.push({ kind: "math", value: match[1] ?? match[2] ?? match[3] ?? match[4] ?? "" });
    cursor = index + match[0].length;
  }
  if (!foundExplicitMath) {
    return [{ kind: looksLikeStandaloneMath(input) ? "math" : "text", value: input }];
  }
  if (cursor < input.length) segments.push({ kind: "text", value: input.slice(cursor) });
  return segments;
}

export function MathText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {splitMathText(text).map((segment, index) => (
        // Streaming/typewriter text can temporarily contain incomplete LaTeX. Include
        // the value in the key so a completed expression replaces its temporary fallback.
        <Fragment key={`${index}-${segment.kind}-${segment.value}`}>
          {segment.kind === "math" ? (
            <StreamingMath value={segment.value} />
          ) : (
            <Equation>{segment.value}</Equation>
          )}
        </Fragment>
      ))}
    </span>
  );
}

function StreamingMath({ value }: { value: string }) {
  try {
    const html = renderKatexToString(normalizeMathNotation(value));
    return <span className="math-inline" dangerouslySetInnerHTML={{ __html: html }} />;
  } catch (error) {
    return (
      <span
        className="math-render-fallback"
        data-math-error={error instanceof Error ? error.message : "Invalid math"}
      >
        <Equation>{value}</Equation>
      </span>
    );
  }
}
