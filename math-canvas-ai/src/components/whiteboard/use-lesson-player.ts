import { useCallback, useEffect, useRef, useState } from "react";
import type { LessonStep } from "@/lessons/types";

const CHAR_MS = 22;
const STEP_GAP_MS = 200;

function stepChars(step: LessonStep): number {
  if (step.kind === "text" || step.kind === "equation") return step.content.length;
  return 0;
}

function stepDurationMs(step: LessonStep): number {
  if (step.kind === "pause") return step.ms;
  if (step.kind === "diagram") return 400;
  return stepChars(step) * CHAR_MS + STEP_GAP_MS;
}

export type PlayerState = {
  stepIndex: number;
  charsRevealed: number;
  playing: boolean;
  finished: boolean;
};

export function useLessonPlayer(steps: LessonStep[]) {
  const [state, setState] = useState<PlayerState>({
    stepIndex: 0,
    charsRevealed: 0,
    playing: true,
    finished: false,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    if (!state.playing || state.finished) return;
    const step = steps[state.stepIndex];
    if (!step) {
      setState((s) => ({ ...s, finished: true, playing: false }));
      return;
    }

    if (step.kind === "text" || step.kind === "equation") {
      const total = step.content.length;
      if (state.charsRevealed < total) {
        timer.current = setTimeout(() => {
          setState((s) => ({ ...s, charsRevealed: s.charsRevealed + 1 }));
        }, CHAR_MS);
      } else {
        timer.current = setTimeout(() => {
          setState((s) => ({
            ...s,
            stepIndex: s.stepIndex + 1,
            charsRevealed: 0,
          }));
        }, STEP_GAP_MS);
      }
    } else {
      timer.current = setTimeout(() => {
        setState((s) => ({
          ...s,
          stepIndex: s.stepIndex + 1,
          charsRevealed: 0,
        }));
      }, stepDurationMs(step));
    }

    return clear;
  }, [state, steps]);

  const play = useCallback(
    () => setState((s) => ({ ...s, playing: true, finished: false })),
    [],
  );
  const pause = useCallback(() => setState((s) => ({ ...s, playing: false })), []);
  const restart = useCallback(() => {
    clear();
    setState({ stepIndex: 0, charsRevealed: 0, playing: true, finished: false });
  }, []);
  const next = useCallback(() => {
    clear();
    setState((s) => {
      const step = steps[s.stepIndex];
      if (!step) return s;
      const total =
        step.kind === "text" || step.kind === "equation" ? step.content.length : 0;
      if (total > 0 && s.charsRevealed < total) {
        return { ...s, charsRevealed: total };
      }
      return { ...s, stepIndex: s.stepIndex + 1, charsRevealed: 0 };
    });
  }, [steps]);

  return { state, play, pause, restart, next };
}