import { useEffect, useRef, type CSSProperties } from "react";
import type { SessionStatus } from "@/lib/live/tutor-session";

export function LumenOrb({
  amplitude,
  status,
  muted,
  onToggle,
}: {
  amplitude: number;
  status: SessionStatus;
  muted?: boolean;
  onToggle?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // smooth the level a touch so the orb doesn't jitter
    const target = amplitude;
    let raf = 0;
    let cur = parseFloat(el.style.getPropertyValue("--amp") || "0");
    const tick = () => {
      cur += (target - cur) * 0.25;
      el.style.setProperty("--amp", cur.toFixed(3));
      if (Math.abs(target - cur) > 0.005) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [amplitude]);

  const interactive = !!onToggle;
  return (
    <button
      type="button"
      ref={ref as unknown as React.RefObject<HTMLButtonElement>}
      className={`lumen-orb lumen-orb--${status}`}
      data-speaking={status === "speaking" || undefined}
      data-muted={muted || undefined}
      data-interactive={interactive || undefined}
      onClick={onToggle}
      disabled={!interactive}
      aria-label={
        muted ? "Microphone off — tap to talk to Lumen" : `Lumen is ${status} — tap to mute`
      }
      title={muted ? "Tap to talk" : "Tap to mute"}
    >
      <span className="lumen-orb-glow" />
      <span className="lumen-orb-bars" aria-hidden>
        {Array.from({ length: 18 }, (_, index) => (
          <span
            key={index}
            className="lumen-orb-bar"
            style={
              {
                "--i": index,
                "--bias": (0.35 + ((index * 7) % 10) / 15).toFixed(2),
              } as CSSProperties
            }
          />
        ))}
      </span>
      <span className="lumen-orb-core" />
      {muted && (
        <span className="lumen-orb-muted" aria-hidden>
          🔇
        </span>
      )}
    </button>
  );
}
