import { useEffect, useRef, useState } from "react";
import { getHints } from "@/lib/mock-live-hints";

export function LiveDrawer({
  moduleId,
  open,
  onClose,
}: {
  moduleId: string;
  open: boolean;
  onClose: () => void;
}) {
  const hints = getHints(moduleId);
  const [shown, setShown] = useState(1);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setShown(1);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, moduleId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [shown, typing]);

  const advance = () => {
    if (shown >= hints.length) return;
    setTyping(true);
    setTimeout(() => {
      setShown((n) => n + 1);
      setTyping(false);
    }, 900);
  };

  const send = () => {
    if (!draft.trim()) return;
    setDraft("");
    advance();
  };

  if (!open) return null;

  const currentTurn = hints[Math.min(shown - 1, hints.length - 1)];
  const tutorSpeaking = currentTurn?.from === "tutor" || typing;

  return (
    <div className="live-scene tutor-fade-in" role="dialog" aria-modal="true">
      <button className="live-close" onClick={onClose} aria-label="Close live tutor">
        ✕
      </button>

      <div className="live-stage">
        <div className={`live-orb ${tutorSpeaking ? "is-speaking" : ""}`}>
          <span className="live-orb-ring" />
          <span className="live-orb-ring live-orb-ring--slow" />
          <span className="live-orb-core" />
        </div>
        <p className="live-caption tutor-serif">
          {tutorSpeaking ? "Lumen is with you" : "Your turn"}
        </p>
      </div>

      <div className="live-transcript" ref={scrollRef}>
        {hints.slice(0, shown).map((h, i) => (
          <div
            key={i}
            className={`live-turn live-turn--${h.from} tutor-fade-in`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="live-turn-role">{h.from === "tutor" ? "Lumen" : "You"}</span>
            <p className="live-turn-text">{h.text}</p>
          </div>
        ))}
        {typing && (
          <div className="live-turn live-turn--tutor">
            <span className="live-turn-role">Lumen</span>
            <p className="live-turn-text live-typing">
              <span /> <span /> <span />
            </p>
          </div>
        )}
      </div>

      <div className="live-composer">
        <input
          className="live-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Say something, or press the button for a nudge…"
        />
        <button
          onClick={draft.trim() ? send : advance}
          disabled={!draft.trim() && shown >= hints.length}
          className="live-send"
          aria-label="Send"
        >
          →
        </button>
      </div>
    </div>
  );
}
