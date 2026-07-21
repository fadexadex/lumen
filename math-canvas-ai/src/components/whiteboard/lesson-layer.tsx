import type { LessonStep } from "@/lessons/types";
import { Equation } from "./equation";
import type { PlayerState } from "./use-lesson-player";

const SIZE_CLASS: Record<"h1" | "h2" | "body", string> = {
  h1: "text-6xl",
  h2: "text-4xl",
  body: "text-3xl",
};

export function LessonLayer({
  steps,
  state,
}: {
  steps: LessonStep[];
  state: PlayerState;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ fontFamily: "var(--font-hand)" }}
    >
      {steps.map((step, i) => {
        if (i > state.stepIndex) return null;
        const isActive = i === state.stepIndex && !state.finished;

        if (step.kind === "pause") return null;

        if (step.kind === "diagram") return null;

        const total = step.content.length;
        const shown = isActive ? Math.min(state.charsRevealed, total) : total;
        const text = step.content.slice(0, shown);
        const showCaret = isActive && shown < total;

        if (step.kind === "equation") {
          return (
            <div
              key={i}
              className="absolute text-[2.25rem] leading-none text-neutral-900"
              style={{ left: step.x, top: step.y }}
            >
              <Equation>{text}</Equation>
              {showCaret && <Caret />}
            </div>
          );
        }

        const size = step.size ?? "body";
        return (
          <div
            key={i}
            className={`absolute leading-tight text-neutral-900 ${SIZE_CLASS[size]}`}
            style={{ left: step.x, top: step.y }}
          >
            {text}
            {showCaret && <Caret />}
          </div>
        );
      })}
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[0.15em] animate-pulse bg-neutral-900"
    />
  );
}