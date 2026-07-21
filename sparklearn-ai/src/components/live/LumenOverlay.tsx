import { useState } from "react";
import { LumenOrb } from "./LumenOrb";
import { LumenTranscript } from "./LumenTranscript";
import { LumenControls } from "./LumenControls";
import type { useLumenSession } from "@/lib/live/use-lumen-session";
import "@/lib/live/live.css";

export function LumenOverlay({ session }: { session: ReturnType<typeof useLumenSession> }) {
  const { status, turns, amplitude, error, stop, setMuted } = session;
  const [muted, setMutedState] = useState(false);
  if (status === "idle") return null;
  return (
    <div className="lumen-overlay">
      <LumenTranscript turns={turns} thinking={status === "thinking"} />
      <div className="lumen-dock" data-no-pan>
        <LumenOrb amplitude={amplitude} status={status} />
        <LumenControls
          status={status}
          muted={muted}
          onToggleMute={() => {
            const m = !muted;
            setMutedState(m);
            setMuted(m);
          }}
          onEnd={stop}
        />
      </div>
      {error && (
        <div className="lumen-toast" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
