import { useEffect, useRef } from "react";
import type { TranscriptTurn } from "@/lib/live/tutor-session";
import { MathText } from "@/lib/math-text";

export function LumenTranscript({
  turns,
  thinking,
  onClose,
}: {
  turns: TranscriptTurn[];
  thinking: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: 1e6, behavior: "smooth" });
  }, [turns, thinking]);
  const recent = turns.slice(-12);
  return (
    <div className="lumen-transcript" ref={ref} role="log" aria-live="polite">
      <button
        type="button"
        className="lumen-transcript-close"
        onClick={onClose}
        aria-label="Close transcript"
      >
        ✕
      </button>
      {recent.map((t) => (
        <div
          key={t.id}
          className={`lumen-line lumen-line--${t.from}`}
          data-partial={!t.final || undefined}
        >
          <span className="lumen-line-role">{t.from === "tutor" ? "Lumen" : "You"}</span>
          <p className="lumen-line-text">
            <MathText text={t.text} />
          </p>
        </div>
      ))}
      {thinking && (
        <div className="lumen-line lumen-line--tutor">
          <span className="lumen-typing">
            <span />
            <span />
            <span />
          </span>
        </div>
      )}
    </div>
  );
}
