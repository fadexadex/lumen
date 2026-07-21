import { useEffect, useRef } from "react";
import type { SessionStatus } from "@/lib/live/tutor-session";

export function LumenOrb({ amplitude, status }: { amplitude: number; status: SessionStatus }) {
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

  return (
    <div
      ref={ref}
      className={`lumen-orb lumen-orb--${status}`}
      data-speaking={status === "speaking" || undefined}
      aria-hidden
    >
      <span className="lumen-orb-glow" />
      <span className="lumen-orb-ring" />
      <span className="lumen-orb-ring lumen-orb-ring--slow" />
      <span className="lumen-orb-core" />
    </div>
  );
}
