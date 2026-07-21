import { useState } from "react";
import { LumenOrb } from "./LumenOrb";
import { LumenTranscript } from "./LumenTranscript";
import { LumenControls } from "./LumenControls";
import type { useLumenSession } from "@/lib/live/use-lumen-session";
import "@/lib/live/live.css";

function isToastWorthy(error: string): boolean {
  const m = error.toLowerCase();
  if (m.includes("client initiated disconnect")) return false;
  if (m.includes("user initiated disconnect")) return false;
  if (m.includes("cancelled") && m.includes("disconnect")) return false;
  return true;
}

export function LumenOverlay({ session }: { session: ReturnType<typeof useLumenSession> }) {
  const { status, turns, amplitude, error, stop, setMuted } = session;
  const [muted, setMutedState] = useState(false);
  if (status === "idle") return null;
  const toast = error && isToastWorthy(error) ? error : null;
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
      {toast && (
        <div className="lumen-toast" role="alert">
          {toast}
        </div>
      )}
    </div>
  );
}
