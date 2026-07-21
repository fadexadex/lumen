import { useEffect, useMemo, useRef, useState } from "react";
import { TutorSession, type SessionStatus, type TranscriptTurn } from "./tutor-session";
import { getCanvasController } from "./canvas-agent-bridge";
import { applyCommand } from "./canvas-commands";

export function useLumenSession() {
  const session = useMemo(() => new TutorSession(), []);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [amp, setAmp] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ampRef = useRef(0);

  useEffect(() => {
    session
      .on("status", setStatus)
      .on("transcript", setTurns)
      .on("amplitude", (l) => {
        ampRef.current = l;
        setAmp(l);
      })
      .on("error", setError)
      .on("command", (cmd) => {
        const ctrl = getCanvasController();
        if (ctrl) applyCommand(ctrl, cmd);
      });
    return () => {
      session.stop();
    };
  }, [session]);

  return {
    status,
    turns,
    amplitude: amp,
    error,
    start: (moduleId: string) => session.start(moduleId),
    stop: () => session.stop(),
    setMuted: (m: boolean) => session.setMuted(m),
    sendText: (t: string) => session.sendText(t),
    sendBoardState: (s: unknown) => session.sendBoardState(s),
  };
}
