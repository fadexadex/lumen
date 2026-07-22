import katex from "katex";
import type { LessonScript } from "@/lib/types";

/** Reject malformed generated math before it can reach MathCanvas or Live context. */
export function assertLessonMath(script: LessonScript): void {
  for (const math of lessonMathFields(script)) {
    try {
      katex.renderToString(math, { throwOnError: true, strict: "error" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid KaTeX ${JSON.stringify(math)}: ${detail}`);
    }
  }
}

export function lessonMathFields(script: LessonScript): string[] {
  const fields: string[] = [];
  for (const step of script.steps) {
    if (step.kind === "explanation" && step.math) fields.push(step.math);
    if (step.kind === "example") {
      for (const line of step.lines) if (line.math) fields.push(line.math);
    }
    if (step.kind === "practice" && step.math) fields.push(step.math);
  }
  return fields;
}
