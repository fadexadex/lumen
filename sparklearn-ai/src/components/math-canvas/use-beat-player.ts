import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Beat } from "./layout";
import { toHandMath } from "./equation";

/** Match math-canvas-ai typing cadence. */
const CHAR_MS = 22;
const BEAT_GAP_MS = 200;
const STEP_ADVANCE_MS = 650;
const DIAGRAM_MS = 400;

function beatText(beat: Beat): string {
  if (beat.kind === "title" || beat.kind === "text") return beat.text;
  if (beat.kind === "math") return toHandMath(beat.latex);
  return "";
}

function isTypeable(beat: Beat): boolean {
  return beat.kind === "title" || beat.kind === "text" || beat.kind === "math";
}

export type BeatPlayerState = {
  /** Index into the flat `beats` array currently being typed (or -1 if idle). */
  activeBeatIndex: number;
  charsRevealed: number;
  playing: boolean;
  /** All typeable beats for the current module step have finished. */
  stepDone: boolean;
  /** Entire lesson (all module steps) has finished typing. */
  finished: boolean;
};

function initialState(typeable: { b: Beat; i: number }[]): BeatPlayerState {
  return {
    activeBeatIndex: typeable[0]?.i ?? -1,
    charsRevealed: 0,
    playing: true,
    stepDone: typeable.length === 0,
    finished: false,
  };
}

/**
 * Timer-based typewriter for Math Canvas beats — same model as
 * math-canvas-ai's `useLessonPlayer`: +1 char every CHAR_MS, then a short
 * gap, then the next beat. Pause freezes the timer; Next finishes the
 * current beat (or advances the module step once the step is done).
 */
export function useBeatPlayer({
  beats,
  stepIndex,
  totalSteps,
  lessonKey,
  onAdvanceStep,
}: {
  beats: Beat[];
  stepIndex: number;
  totalSteps: number;
  /** Changes when the lesson/module changes — forces a clean playhead reset. */
  lessonKey: string;
  onAdvanceStep: () => void;
}) {
  const typeable = useMemo(
    () => beats.map((b, i) => ({ b, i })).filter(({ b }) => b.step === stepIndex && isTypeable(b)),
    [beats, stepIndex],
  );

  const [state, setState] = useState<BeatPlayerState>(() => initialState(typeable));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceRef = useRef(onAdvanceStep);
  advanceRef.current = onAdvanceStep;
  const syncedStep = useRef(stepIndex);
  const syncedLesson = useRef(lessonKey);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // Hard reset when the lesson/module identity changes (even if step stays 0)
  useEffect(() => {
    if (syncedLesson.current === lessonKey) return;
    syncedLesson.current = lessonKey;
    syncedStep.current = stepIndex;
    clear();
    setState(initialState(typeable));
  }, [lessonKey, stepIndex, typeable]);

  useEffect(() => {
    // Module step changed — reset playhead before typing
    if (syncedStep.current !== stepIndex) {
      syncedStep.current = stepIndex;
      clear();
      setState(initialState(typeable));
      return;
    }

    if (state.finished) return;

    // Step complete: finish the lesson or auto-advance to the next step.
    // Runs even if the user paused — › skip sets stepDone then relies on this.
    if (state.stepDone) {
      if (stepIndex >= totalSteps - 1) {
        setState((s) => ({ ...s, finished: true, playing: false }));
        return;
      }
      if (!state.playing) return;
      timer.current = setTimeout(() => {
        advanceRef.current();
      }, STEP_ADVANCE_MS);
      return clear;
    }

    if (!state.playing) return;

    // No typeable content — short pause then mark done (diagrams/options only)
    if (typeable.length === 0) {
      timer.current = setTimeout(() => {
        setState((s) => ({ ...s, stepDone: true }));
      }, DIAGRAM_MS);
      return clear;
    }

    const cursor = typeable.findIndex(({ i }) => i === state.activeBeatIndex);
    const current = typeable[cursor];
    if (!current) {
      setState((s) => ({ ...s, stepDone: true }));
      return;
    }

    const total = beatText(current.b).length;
    if (state.charsRevealed < total) {
      timer.current = setTimeout(() => {
        setState((s) => ({ ...s, charsRevealed: s.charsRevealed + 1 }));
      }, CHAR_MS);
    } else {
      const nextBeat = typeable[cursor + 1];
      timer.current = setTimeout(() => {
        if (nextBeat) {
          setState((s) => ({
            ...s,
            activeBeatIndex: nextBeat.i,
            charsRevealed: 0,
          }));
        } else {
          setState((s) => ({ ...s, stepDone: true }));
        }
      }, BEAT_GAP_MS);
    }

    return clear;
  }, [state, typeable, stepIndex, totalSteps]);

  const pause = useCallback(() => {
    clear();
    setState((s) => ({ ...s, playing: false }));
  }, []);

  /** Start or resume typing. If the lesson was complete, replay the current step. */
  const play = useCallback(() => {
    clear();
    setState((s) => {
      if (s.finished) {
        return { ...initialState(typeable), playing: true };
      }
      return { ...s, playing: true, finished: false };
    });
  }, [typeable]);

  const restart = useCallback(() => {
    clear();
    syncedStep.current = stepIndex;
    setState(initialState(typeable));
  }, [typeable, stepIndex]);

  /**
   * Next beat / step only — never jumps modules.
   * (Module advance is a separate control after `finished`.)
   */
  const next = useCallback(() => {
    clear();
    setState((s) => {
      if (s.finished) return s;
      if (s.stepDone) {
        if (stepIndex < totalSteps - 1) {
          // Defer — never call parent setState inside this updater
          setTimeout(() => advanceRef.current(), 0);
          return { ...s, playing: true };
        }
        return { ...s, finished: true, playing: false };
      }
      const current = beats[s.activeBeatIndex];
      if (!current) return { ...s, stepDone: true, playing: true };
      const total = beatText(current).length;
      if (s.charsRevealed < total) {
        return { ...s, charsRevealed: total, playing: true };
      }
      return { ...s, stepDone: true, charsRevealed: total, playing: true };
    });
  }, [beats, stepIndex, totalSteps]);

  /** How many chars of beat `i` should be shown. */
  const charsFor = useCallback(
    (beatIndex: number): number => {
      const beat = beats[beatIndex];
      if (!beat) return 0;
      if (beat.step < stepIndex) return Infinity;
      if (beat.step > stepIndex) return 0;
      if (!isTypeable(beat)) return state.stepDone || state.finished ? Infinity : 0;

      const cursor = typeable.findIndex(({ i }) => i === state.activeBeatIndex);
      const self = typeable.findIndex(({ i }) => i === beatIndex);
      if (self < 0) return 0;
      if (state.finished || state.stepDone || self < cursor) return Infinity;
      if (self > cursor) return 0;
      return state.charsRevealed;
    },
    [beats, stepIndex, state, typeable],
  );

  return {
    state,
    play,
    pause,
    restart,
    next,
    charsFor,
    beatText,
  };
}
