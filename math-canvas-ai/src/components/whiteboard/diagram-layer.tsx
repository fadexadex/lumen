import type { LessonStep } from "@/lessons/types";
import { ParabolaWidget } from "./parabola-widget";
import type { PlayerState } from "./use-lesson-player";

export function DiagramLayer({
  steps,
  state,
  interactive,
}: {
  steps: LessonStep[];
  state: PlayerState;
  interactive: boolean;
}) {
  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: "none" }}
    >
      {steps.map((step, i) => {
        if (step.kind !== "diagram") return null;
        if (i > state.stepIndex) return null;
        const isActive = i === state.stepIndex && !state.finished;
        if (isActive) return null;
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: step.x,
              top: step.y,
              width: step.w,
              height: step.h,
              pointerEvents: interactive ? "auto" : "none",
            }}
          >
            <ParabolaWidget width={step.w} height={step.h} />
          </div>
        );
      })}
    </div>
  );
}