import { useEffect, useRef } from "react";
import type { TranscriptTurn } from "@/lib/live/tutor-session";

export function LumenTranscript({
  turns,
  thinking,
}: {
  turns: TranscriptTurn[];
  thinking: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: 1e6, behavior: "smooth" });
  }, [turns, thinking]);
  const recent = turns.slice(-4);
  return (
    <div className="lumen-transcript" ref={ref} role="log" aria-live="polite">
      {recent.map((t) => (
        <div
          key={t.id}
          className={`lumen-line lumen-line--${t.from}`}
          data-partial={!t.final || undefined}
        >
          <span className="lumen-line-role">{t.from === "tutor" ? "Lumen" : "You"}</span>
          <p className="lumen-line-text">{t.text}</p>
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
