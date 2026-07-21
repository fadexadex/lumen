import { useEffect, useMemo, useRef, useState } from "react";
import { TutorSession, type SessionStatus, type TranscriptTurn } from "./tutor-session";
import { getCanvasController } from "./canvas-agent-bridge";
import { applyCommand, type CanvasCommand } from "./canvas-commands";

export function useLumenSession() {
  const session = useMemo(() => new TutorSession(), []);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [amp, setAmp] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ampRef = useRef(0);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const statusRef = useRef(status);
  statusRef.current = status;
  const errorRef = useRef(error);
  errorRef.current = error;

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
        if (!ctrl) return "no-canvas";
        return applyCommand(ctrl, cmd);
      });

    // Dev-only hooks for automated E2E (browser console / browse scripts).
    if (import.meta.env.DEV) {
      (window as unknown as { __lumenE2E?: unknown }).__lumenE2E = {
        getStatus: () => statusRef.current,
        getTurns: () => turnsRef.current,
        getError: () => errorRef.current,
        start: (moduleId: string, opts?: { mic?: boolean }) => session.start(moduleId, opts),
        stop: () => session.stop(),
        sendText: (t: string) => session.sendText(t),
        sendBoardState: (s: unknown) => session.sendBoardState(s),
        apply: (cmd: CanvasCommand) => {
          const ctrl = getCanvasController();
          if (!ctrl) return "no-canvas";
          return applyCommand(ctrl, cmd);
        },
        hasController: () => !!getCanvasController(),
      };
    }

    return () => {
      void session.stop();
      if (import.meta.env.DEV) {
        delete (window as unknown as { __lumenE2E?: unknown }).__lumenE2E;
      }
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
