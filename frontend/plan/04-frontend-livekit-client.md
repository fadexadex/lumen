# 04 · Frontend — LiveKit Client, TutorSession & Transcripts

This wires the browser into the room: connect, publish mic, subscribe to agent audio, stream
transcripts, and register the RPC method that receives canvas commands. We wrap it all in a
small **`TutorSession`** so React only ever touches a clean interface.

> Design choice: we deliberately do NOT use `<LiveKitRoom>`/prebuilt chat from
> `@livekit/components-react` as the app shell — they fight our "no takeover, stay on the
> board" rule. We use `livekit-client` directly for the room and only borrow small hooks/utils.

---

## 1. Install

```bash
cd frontend
npm i livekit-client @livekit/components-react
```

`@livekit/components-react` is optional (used only for the `useTracks`/visualizer if wanted);
`livekit-client` is required.

## 2. `lib/live/livekit-client.ts` — connection primitives

```ts
import { Room, RoomEvent, Track, type RemoteTrack, type Remoteparticipant } from "livekit-client";

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;
const TOKEN_URL = import.meta.env.VITE_LUMEN_TOKEN_URL as string;

export function makeIdentity(): string {
  const KEY = "lumen.identity";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = "learner-" + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(KEY, id);
  }
  return id;
}
export const roomName = (moduleId: string, identity: string) => `lumen-${moduleId}-${identity}`;

export async function fetchToken(
  room: string,
  identity: string,
): Promise<{ token: string; url: string }> {
  const u = `${TOKEN_URL}?room=${encodeURIComponent(room)}&identity=${encodeURIComponent(identity)}`;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = await res.json();
  return { token: data.token, url: data.url ?? LIVEKIT_URL };
}

export function createRoom(): Room {
  return new Room({
    adaptiveStream: true,
    dynacast: true,
    // We only need audio; keep it light.
  });
}

export { RoomEvent, Track };
export type { Room, RemoteTrack, RemoteParticipant };
```

## 3. `lib/live/tutor-session.ts` — the abstraction

A framework-agnostic controller with an event emitter. React subscribes via a hook (§5).
This is where model-agnosticism lives: nothing here knows about Gemini vs OpenAI.

```ts
import { createRoom, fetchToken, makeIdentity, roomName, RoomEvent, Track } from "./livekit-client";
import type { Room, RemoteTrack } from "./livekit-client";
import type { CanvasCommand } from "./canvas-commands";

export type SessionStatus = "idle" | "connecting" | "listening" | "speaking" | "thinking" | "error";

export interface TranscriptTurn {
  id: string;
  from: "tutor" | "you";
  text: string;
  final: boolean;
}

type Listeners = {
  status: (s: SessionStatus) => void;
  transcript: (turns: TranscriptTurn[]) => void;
  amplitude: (level: number) => void; // 0..1, drives the orb
  command: (cmd: CanvasCommand) => void; // canvas commands (handled by canvas bridge)
  error: (message: string) => void;
};

export class TutorSession {
  private room: Room | null = null;
  private turns: TranscriptTurn[] = [];
  private listeners: Partial<Listeners> = {};
  private audioEl: HTMLAudioElement | null = null;
  private raf = 0;
  status: SessionStatus = "idle";

  on<K extends keyof Listeners>(ev: K, fn: Listeners[K]) {
    this.listeners[ev] = fn;
    return this;
  }

  private set(s: SessionStatus) {
    this.status = s;
    this.listeners.status?.(s);
  }
  private emitTurns() {
    this.listeners.transcript?.([...this.turns]);
  }

  async start(moduleId: string) {
    if (this.room) return;
    this.set("connecting");
    try {
      const identity = makeIdentity();
      const room = roomName(moduleId, identity);
      const { token, url } = await fetchToken(room, identity);
      const r = createRoom();
      this.room = r;

      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) this.attachAgentAudio(track);
      });
      r.on(RoomEvent.Disconnected, () => this.cleanup());
      r.on(RoomEvent.ConnectionStateChanged, () => {
        /* optional UI */
      });

      // Transcriptions arrive as text streams on topic "lk.transcription".
      r.registerTextStreamHandler("lk.transcription", async (reader, participant) => {
        const from: TranscriptTurn["from"] = participant?.identity === identity ? "you" : "tutor";
        const id = reader.info.id;
        let text = "";
        for await (const chunk of reader) {
          text += chunk;
          this.upsertTurn(id, from, text, false);
        }
        this.upsertTurn(id, from, text, true);
      });

      // Canvas commands from the agent (Week 1). Registered even on Day 1 (no-op if unused).
      r.registerRpcMethod("lumen.canvas", async (data) => {
        try {
          const cmd = JSON.parse(data.payload) as CanvasCommand;
          this.set("thinking");
          this.listeners.command?.(cmd); // handed to canvas bridge (06/05)
          // return fast — client animates independently
          queueMicrotask(() => this.set("speaking"));
          return "applied";
        } catch (e) {
          return "error:" + (e as Error).message;
        }
      });

      // System messages (quota, fallback) from the agent.
      r.registerRpcMethod("lumen.system", async (data) => {
        this.listeners.error?.(data.payload);
        return "ok";
      });

      await r.connect(url, token);
      await r.localParticipant.setMicrophoneEnabled(true);
      this.set("listening");
    } catch (e) {
      this.set("error");
      this.listeners.error?.((e as Error).message);
      this.cleanup();
    }
  }

  /** Publish a client→agent board-state delta (topic lumen.board). Fire-and-forget. */
  async sendBoardState(state: unknown) {
    if (!this.room) return;
    const payload = new TextEncoder().encode(JSON.stringify(state));
    await this.room.localParticipant.publishData(payload, { topic: "lumen.board", reliable: true });
  }

  /** Optional text input path when mic is denied. */
  async sendText(text: string) {
    if (!this.room) return;
    await this.room.localParticipant.sendText(text, { topic: "lk.chat" });
  }

  setMuted(muted: boolean) {
    this.room?.localParticipant.setMicrophoneEnabled(!muted);
  }

  async stop() {
    await this.room?.disconnect();
    this.cleanup();
  }

  // ---- audio → amplitude (orb) ----
  private attachAgentAudio(track: RemoteTrack) {
    const el = track.attach() as HTMLAudioElement;
    el.autoplay = true;
    el.style.display = "none";
    document.body.appendChild(el);
    this.audioEl = el;
    this.set("speaking");

    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ac = new AC();
    const src = ac.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
    const analyser = ac.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length); // 0..~0.5
      const level = Math.min(1, rms * 3.2); // normalize for the orb
      this.listeners.amplitude?.(level);
      if (level < 0.03 && this.status === "speaking") this.set("listening");
      else if (level >= 0.03 && this.status !== "speaking") this.set("speaking");
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private upsertTurn(id: string, from: TranscriptTurn["from"], text: string, final: boolean) {
    const i = this.turns.findIndex((t) => t.id === id);
    if (i >= 0) this.turns[i] = { id, from, text, final };
    else this.turns.push({ id, from, text, final });
    // keep last 12 for the minimal transcript
    if (this.turns.length > 12) this.turns = this.turns.slice(-12);
    this.emitTurns();
  }

  private cleanup() {
    cancelAnimationFrame(this.raf);
    if (this.audioEl) {
      this.audioEl.remove();
      this.audioEl = null;
    }
    this.room = null;
    this.turns = [];
    this.emitTurns();
    this.set("idle");
  }
}
```

> API version note: method names (`registerTextStreamHandler`, `registerRpcMethod`,
> `publishData({topic})`, `sendText`) match `livekit-client` v2.x. If your installed version
> differs, check `node_modules/livekit-client/dist` — the shapes are stable in 2.x but the
> transcription topic string (`lk.transcription`) is the one to confirm first.

## 4. `lib/live/use-lumen-session.ts` — React hook

Single hook the UI consumes. Owns one `TutorSession` for the component's lifetime and re-renders
on its events. It also plugs canvas commands into the canvas bridge (see `05`/`06`).

```ts
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
        if (ctrl) applyCommand(ctrl, cmd); // 06 defines applyCommand
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
```

## 5. Where the session lives (LessonRoute)

The session is created at **route level** and persists across lesson steps (do NOT tear it
down when `stepIndex` changes). See `07` for the exact `LessonRoute` edit; conceptually:

```tsx
const lumen = useLumenSession();
// topbar "Live" button → lumen.start(moduleId)  (was setLiveOpen(true) + <LiveDrawer/>)
// render <LumenOverlay session={lumen} /> as a fixed overlay sibling of the board
// on step / slider change → lumen.sendBoardState(buildBoardState(...))   (08)
```

## 6. Day-1 acceptance (frontend)

- [ ] Click Live → status goes `connecting` → `listening`; mic permission prompt appears.
- [ ] Agent greeting plays; `amplitude` moves; status flips `speaking`/`listening`.
- [ ] Transcript turns stream into the store (log them first if overlay isn't built yet).
- [ ] Board remains fully pannable/zoomable/inkable during the whole session.
- [ ] `stop()` cleans up (audio element removed, status `idle`).

Next: `05` builds the canvas controller + world-space annotation layer that the `command`
events will drive.
