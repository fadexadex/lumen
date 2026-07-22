export function LumenControls({
  status,
  muted,
  onOpenTranscript,
  onEnd,
}: {
  status: string;
  muted: boolean;
  onToggleMute?: () => void;
  onOpenTranscript?: () => void;
  onEnd: () => void;
}) {
  // A status line that reads as an invitation, not a machine state. When the
  // learner can speak, say so plainly — that is the whole "how do I interact"
  // answer, right next to the orb they tap.
  const label = muted
    ? "Muted — tap the orb to talk"
    : status === "connecting"
      ? "Connecting…"
      : status === "speaking"
        ? "Lumen is explaining"
        : status === "thinking"
          ? "Lumen is drawing…"
          : status === "listening"
            ? "Listening — just speak"
            : "Live";
  return (
    <div className="lumen-controls" data-no-pan>
      <span className="lumen-identity">
        <strong>Lumen</strong>
        <span className="lumen-status" data-muted={muted || undefined}>
          {label}
        </span>
      </span>
      {onOpenTranscript && (
        <button
          type="button"
          className="lumen-btn"
          onClick={onOpenTranscript}
          aria-label="Open transcript"
          title="Show transcript"
        >
          💬
        </button>
      )}
      <button
        type="button"
        className="lumen-btn lumen-btn--end"
        onClick={onEnd}
        aria-label="End session"
        title="End session"
      >
        ✕
      </button>
    </div>
  );
}
