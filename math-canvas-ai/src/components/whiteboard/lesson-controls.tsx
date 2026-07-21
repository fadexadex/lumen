import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";

export function LessonControls({
  playing,
  finished,
  stepIndex,
  totalSteps,
  onPlay,
  onPause,
  onRestart,
  onNext,
}: {
  playing: boolean;
  finished: boolean;
  stepIndex: number;
  totalSteps: number;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onNext: () => void;
}) {
  return (
    <div className="pointer-events-auto fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-neutral-200 bg-white px-3 py-2 shadow-sm">
      <button
        type="button"
        title="Restart"
        onClick={onRestart}
        className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      <button
        type="button"
        title={playing && !finished ? "Pause" : "Play"}
        onClick={playing && !finished ? onPause : onPlay}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-800"
      >
        {playing && !finished ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        title="Next step"
        onClick={onNext}
        className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
      >
        <SkipForward className="h-4 w-4" />
      </button>
      <div className="px-2 text-xs tabular-nums text-neutral-500">
        {Math.min(stepIndex + 1, totalSteps)} / {totalSteps}
      </div>
    </div>
  );
}