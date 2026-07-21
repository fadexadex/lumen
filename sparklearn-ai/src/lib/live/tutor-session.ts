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
      // NOTE: livekit-client v2.20 passes `participantInfo: { identity: string }` (not a
      // full RemoteParticipant) to the text-stream handler.
      r.registerTextStreamHandler("lk.transcription", async (reader, participantInfo) => {
        const from: TranscriptTurn["from"] =
          participantInfo?.identity === identity ? "you" : "tutor";
        const id = reader.info.id;
        let text = "";
        for await (const chunk of reader) {
          text = chunk;
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

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
