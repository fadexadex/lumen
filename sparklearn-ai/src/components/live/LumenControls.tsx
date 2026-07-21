export function LumenControls({
  status,
  muted,
  onToggleMute,
  onEnd,
}: {
  status: string;
  muted: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
}) {
  const label =
    status === "connecting"
      ? "Connecting…"
      : status === "speaking"
        ? "Lumen is talking"
        : status === "thinking"
          ? "Lumen is drawing…"
          : status === "listening"
            ? "Listening"
            : "";
  return (
    <div className="lumen-controls" data-no-pan>
      <button
        type="button"
        className="lumen-btn"
        data-active={!muted}
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🎙️"}
      </button>
      <span className="lumen-status">{label}</span>
      <button
        type="button"
        className="lumen-btn lumen-btn--end"
        onClick={onEnd}
        aria-label="End session"
      >
        ✕
      </button>
    </div>
  );
}
