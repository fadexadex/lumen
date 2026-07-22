import { createRoom, fetchToken, makeIdentity, roomName, RoomEvent, Track } from "./livekit-client";
import type { Room, RemoteTrack } from "./livekit-client";
import { createCommandDeduper, isCanvasCommand, type CanvasCommand } from "./canvas-commands";
import { loadTranscriptHistory, saveTranscriptHistory } from "./transcript-history";

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
  /** Apply a canvas command; return ack string for the agent. */
  command: (cmd: CanvasCommand) => string;
  /** Pass `null` to clear a previous toast. */
  error: (message: string | null) => void;
};

function isBenignDisconnectMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("client initiated disconnect") ||
    m.includes("abort connection attempt due to user initiated disconnect") ||
    (m.includes("cancelled") && m.includes("disconnect"))
  );
}

function transcriptionAttrs(reader: { info: { attributes?: Record<string, unknown> } }) {
  return reader.info.attributes ?? {};
}

function transcriptionSegmentId(reader: {
  info: { id: string; attributes?: Record<string, unknown> };
}): string {
  const attrs = transcriptionAttrs(reader);
  const seg = attrs["lk.segment_id"];
  return typeof seg === "string" && seg.length > 0 ? seg : reader.info.id;
}

function transcriptionIsFinal(reader: { info: { attributes?: Record<string, unknown> } }): boolean {
  const v = transcriptionAttrs(reader)["lk.transcription_final"];
  return v === true || v === "true";
}

/** LiveKit yields incremental UTF-8 chunks, not cumulative transcript snapshots. */
function appendTranscriptionChunk(text: string, chunk: string): string {
  return text + chunk;
}

export class TutorSession {
  private room: Room | null = null;
  private turns: TranscriptTurn[] = [];
  private listeners: Partial<Listeners> = {};
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private attachedTrackSid: string | null = null;
  private raf = 0;
  private intentionalStop = false;
  /** Synchronous guard: set before the first await so rapid double-starts can't open two rooms. */
  private starting = false;
  /** Monotonic suffix prevents same-millisecond reconnects from reusing a room. */
  private startAttempt = 0;
  status: SessionStatus = "idle";
  /** Last time we appended tutor transcript — used to keep one reply in one bubble. */
  private lastTutorAt = 0;
  private speakQuietMs = 0;
  private lastAmpTs = 0;
  private activeModuleId: string | null = null;
  /** Latest board snapshot is queued across token fetch / room connection. */
  private pendingBoardState: unknown | null = null;
  private dataChannelReady = false;
  private acceptCommandId = createCommandDeduper(32);

  on<K extends keyof Listeners>(ev: K, fn: Listeners[K]) {
    this.listeners[ev] = fn;
    return this;
  }

  private set(s: SessionStatus) {
    this.status = s;
    this.listeners.status?.(s);
  }
  private emitTurns() {
    if (this.activeModuleId) saveTranscriptHistory(this.activeModuleId, this.turns);
    this.listeners.transcript?.([...this.turns]);
  }
  private emitError(message: string | null) {
    this.listeners.error?.(message);
  }

  async start(moduleId: string, opts?: { mic?: boolean }) {
    // `this.room` isn't set until after the async token fetch below, so guard
    // synchronously too — otherwise two quick starts each open a room and we
    // subscribe to (and play) the agent's audio twice.
    if (this.room || this.starting) return;
    if (this.activeModuleId !== moduleId) {
      this.activeModuleId = moduleId;
      this.turns = loadTranscriptHistory(moduleId);
      this.emitTurns();
    } else if (!this.turns.length) {
      this.turns = loadTranscriptHistory(moduleId);
      this.emitTurns();
    }
    this.starting = true;
    this.intentionalStop = false;
    this.emitError(null);
    this.set("connecting");
    try {
      const identity = makeIdentity();
      const sessionId = `${Date.now().toString(36)}-${++this.startAttempt}`;
      const room = roomName(moduleId, identity, sessionId);
      const { token, url } = await fetchToken(room, identity);
      const r = createRoom();
      this.room = r;

      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) this.attachAgentAudio(track);
      });
      r.on(RoomEvent.Disconnected, () => {
        // Intentional End / page teardown — never toast.
        this.cleanup();
      });
      r.on(RoomEvent.Reconnected, () => {
        this.dataChannelReady = true;
        void this.publishPendingBoardState();
      });

      // Transcriptions arrive as text streams on topic "lk.transcription".
      // Prefer LiveKit segment id so interim streams of the same utterance upsert one line.
      r.registerTextStreamHandler("lk.transcription", async (reader, participantInfo) => {
        const from: TranscriptTurn["from"] =
          participantInfo?.identity === identity ? "you" : "tutor";
        let text = "";
        for await (const chunk of reader) {
          text = appendTranscriptionChunk(text, chunk);
          const id = transcriptionSegmentId(reader);
          this.upsertTurn(id, from, text, transcriptionIsFinal(reader));
        }
        if (text) {
          const id = transcriptionSegmentId(reader);
          // Only finalize when LiveKit marks the segment final — interim streams close too.
          this.upsertTurn(id, from, text, transcriptionIsFinal(reader));
        }
      });

      r.registerRpcMethod("lumen.canvas", async (data) => {
        try {
          const cmd = JSON.parse(data.payload) as unknown;
          if (!isCanvasCommand(cmd)) return "invalid-command";
          if (!this.acceptCommandId(cmd.id)) return "ok:duplicate";
          // Apply immediately; don't flip status to "thinking" (that starved follow-up UX).
          return this.listeners.command?.(cmd) ?? "no-handler";
        } catch (e) {
          return "error:" + (e as Error).message;
        }
      });

      r.registerRpcMethod("lumen.system", async (data) => {
        // Real system notices (quota, fallback) — not disconnect noise.
        this.emitError(data.payload);
        return "ok";
      });

      await r.connect(url, token);
      if (this.intentionalStop) {
        this.cleanup();
        return;
      }
      this.dataChannelReady = true;
      await this.publishPendingBoardState();
      // Headless E2E can skip mic (no getUserMedia) and still exercise connect + text + canvas.
      if (opts?.mic !== false) {
        try {
          await r.localParticipant.setMicrophoneEnabled(true);
        } catch (error) {
          // Keep the lesson and text channel alive. A denied microphone should
          // not tear down the agent after it has already joined and received context.
          this.emitError(
            `${(error as Error).message || "Microphone unavailable"}. You can allow microphone access and reconnect.`,
          );
        }
      }
      this.starting = false;
      if (this.status === "connecting") this.set("listening");
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (this.intentionalStop || isBenignDisconnectMessage(msg)) {
        this.cleanup();
        return;
      }
      this.set("error");
      this.emitError(msg);
      this.cleanup();
    }
  }

  /** Publish a client→agent board-state delta (topic lumen.board). Fire-and-forget. */
  async sendBoardState(state: unknown) {
    this.pendingBoardState = state;
    await this.publishPendingBoardState();
  }

  private async publishPendingBoardState() {
    if (!this.room || !this.dataChannelReady || this.pendingBoardState == null) return;
    const payload = new TextEncoder().encode(JSON.stringify(this.pendingBoardState));
    try {
      await this.room.localParticipant.publishData(payload, {
        topic: "lumen.board",
        reliable: true,
      });
    } catch {
      // Reconnect can briefly close the data channel. Retain the queued state;
      // the next visible-step/status update will publish the same latest snapshot.
      this.dataChannelReady = false;
    }
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
    this.intentionalStop = true;
    this.emitError(null);
    try {
      await this.room?.disconnect();
    } catch {
      /* disconnect while connecting can throw — treated as intentional */
    }
    this.cleanup();
  }

  // ---- audio → amplitude (orb) + stable speaking status ----
  private attachAgentAudio(track: RemoteTrack) {
    // Idempotent: a re-subscribe (auto-reconnect) or a duplicate agent track must
    // never leave two <audio> elements playing at once — that's the "echo twice".
    if (track.sid && this.attachedTrackSid === track.sid) return;
    this.teardownAudio();
    this.attachedTrackSid = track.sid ?? null;

    const el = track.attach() as HTMLAudioElement;
    el.autoplay = true;
    el.style.display = "none";
    document.body.appendChild(el);
    this.audioEl = el;
    this.set("speaking");
    this.speakQuietMs = 0;
    this.lastAmpTs = performance.now();

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    this.audioCtx = ac;
    const src = ac.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
    const analyser = ac.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    // Hysteresis: easy to enter speaking, hard to leave (avoids Listening↔Talking flicker).
    const SPEAK_ON = 0.045;
    const SPEAK_OFF = 0.02;
    const QUIET_HOLD_MS = 520;

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

      const now = performance.now();
      const dt = Math.min(80, Math.max(0, now - this.lastAmpTs));
      this.lastAmpTs = now;

      if (level >= SPEAK_ON) {
        this.speakQuietMs = 0;
        if (this.status !== "speaking") this.set("speaking");
      } else if (level < SPEAK_OFF) {
        this.speakQuietMs += dt;
        if (this.speakQuietMs >= QUIET_HOLD_MS && this.status === "speaking") {
          this.set("listening");
          // End of spoken reply — seal the open tutor bubble.
          const i = this.turns.length - 1;
          if (i >= 0 && this.turns[i]!.from === "tutor" && !this.turns[i]!.final) {
            this.turns[i] = { ...this.turns[i]!, final: true };
            this.emitTurns();
          }
        }
      } else {
        // Mid band — keep current status; slowly decay quiet clock so brief dips don't stick.
        this.speakQuietMs = Math.max(0, this.speakQuietMs - dt * 0.35);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /**
   * Transcript turns are React-keyed by `id`. LiveKit segment ids (SG_…) can
   * recur — a re-emitted segment, or a new bubble that reuses an id we already
   * sealed — which would push two turns sharing a key ("Encountered two children
   * with the same key"). Suffix any id that already belongs to a DIFFERENT turn
   * so keys stay unique. Only collisions are touched, so id-based upserts below
   * (which look up the original segment id) are unaffected.
   */
  private ensureUniqueTurnId(id: string, selfIndex = -1): string {
    return uniqueTurnId(this.turns, id, selfIndex);
  }

  private upsertTurn(id: string, from: TranscriptTurn["from"], text: string, final: boolean) {
    if (!text || isNoiseTranscript(text)) return;

    // Tutor audio often arrives as many LiveKit segments (word / sentence finals), each with
    // a unique id. Keep ONE bubble per spoken reply: merge while still in the same turn
    // (speaking, or only a short gap). Split only after the learner speaks or a long pause.
    if (from === "tutor") {
      const now = performance.now();
      const lastIdx = this.turns.length - 1;
      const last = lastIdx >= 0 ? this.turns[lastIdx] : null;
      if (
        last?.from === "tutor" &&
        !last.final &&
        shouldMergeTutor(last, now - this.lastTutorAt, this.status)
      ) {
        const merged = mergeTutorText(last.text, text);
        this.turns[lastIdx] = {
          id: last.id,
          from,
          text: merged,
          // Stay open until a real turn boundary — sentence finals mid-reply stay partial.
          final: false,
        };
        this.lastTutorAt = now;
        this.trimTurns();
        this.emitTurns();
        return;
      }
      // New tutor bubble — seal the previous tutor line if any.
      if (last?.from === "tutor" && !last.final) {
        this.turns[lastIdx] = { ...last, final: true };
      }
      this.turns.push({ id: this.ensureUniqueTurnId(id), from, text, final: false });
      this.lastTutorAt = now;
      this.trimTurns();
      this.emitTurns();
      return;
    }

    // Learner STT: merge by LiveKit segment id.
    const byId = this.turns.findIndex((t) => t.id === id);
    if (byId >= 0) {
      const prev = this.turns[byId]!.text;
      const next = text.startsWith(prev) ? text : prev.startsWith(text) ? prev : text;
      this.turns[byId] = { id, from, text: next, final };
      this.trimTurns();
      this.emitTurns();
      return;
    }

    // Seal open tutor bubble when the learner starts talking.
    const lastIdx = this.turns.length - 1;
    const last = lastIdx >= 0 ? this.turns[lastIdx] : null;
    if (last?.from === "tutor" && !last.final) {
      this.turns[lastIdx] = { ...last, final: true };
    }

    // Fallback when segment id is missing: keep one open partial per speaker.
    if (!final) {
      const partialIdx = this.turns.findIndex((t) => t.from === from && !t.final);
      if (partialIdx >= 0) {
        const prev = this.turns[partialIdx]!.text;
        const next = text.startsWith(prev) ? text : prev.startsWith(text) ? prev : text;
        const uid = this.ensureUniqueTurnId(id, partialIdx);
        this.turns[partialIdx] = { id: uid, from, text: next, final: false };
        this.trimTurns();
        this.emitTurns();
        return;
      }
    } else {
      const partialIdx = this.turns.findIndex((t) => t.from === from && !t.final);
      if (partialIdx >= 0) {
        const prev = this.turns[partialIdx]!.text;
        const next = text.startsWith(prev) ? text : prev.startsWith(text) ? prev : text;
        const uid = this.ensureUniqueTurnId(id, partialIdx);
        this.turns[partialIdx] = { id: uid, from, text: next, final: true };
        this.trimTurns();
        this.emitTurns();
        return;
      }
    }

    this.turns.push({ id: this.ensureUniqueTurnId(id), from, text, final });
    this.trimTurns();
    this.emitTurns();
  }

  private trimTurns() {
    if (this.turns.length > 12) this.turns = this.turns.slice(-12);
  }

  /** Tear down the current agent audio element + analyser graph (safe to call repeatedly). */
  private teardownAudio() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.audioEl) {
      this.audioEl.remove();
      this.audioEl = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.attachedTrackSid = null;
  }

  private cleanup() {
    this.teardownAudio();
    this.starting = false;
    this.speakQuietMs = 0;
    this.lastAmpTs = 0;
    this.lastTutorAt = 0;
    this.room = null;
    this.dataChannelReady = false;
    this.turns = this.turns.map((turn) => (turn.final ? turn : { ...turn, final: true }));
    this.emitTurns();
    this.set("idle");
  }
}

/** Keep merging tutor chunks into one paragraph unless the reply turn clearly ended. */
const TUTOR_TURN_GAP_MS = 2800;

function shouldMergeTutor(last: TranscriptTurn, gapMs: number, status: SessionStatus): boolean {
  if (last.from !== "tutor") return false;
  // Still audibly speaking — always same reply, even across sentence finals.
  if (status === "speaking") return true;
  // Short pause mid-thought / mid-tool — still same reply.
  if (gapMs < TUTOR_TURN_GAP_MS) return true;
  return false;
}

function isNoiseTranscript(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^<noise>$/i.test(t)) return true;
  if (/^<unk>$/i.test(t)) return true;
  if (/^\[noise\]$/i.test(t)) return true;
  // Lone punctuation / dots Gemini sometimes emits as "transcripts"
  if (/^[.\s…,!?]+$/.test(t)) return true;
  return false;
}

function mergeTutorText(prev: string, next: string): string {
  if (next.startsWith(prev)) return next; // cumulative
  if (prev.startsWith(next)) return prev; // stale shorter partial
  const n = next.trim();
  const p = prev.trim();
  if (!n) return prev;
  // Exact echo / trailing duplicate ("upward." then "upward.")
  if (p === n || p.endsWith(n) || p.endsWith(" " + n)) return prev;

  // Overlap dedupe: "hoping to" + "to learn" → "hoping to learn"
  const overlap = suffixPrefixOverlap(p, n);
  if (overlap >= 2) {
    return p + n.slice(overlap);
  }

  const needsSpace = !/[\s([{/-]$/.test(p) && !/^[\s.,!?;:)'"\]]/.test(n);
  return p + (needsSpace ? " " : "") + n;
}

/** Longest suffix of `prev` that matches a prefix of `next` (case-insensitive). */
function suffixPrefixOverlap(prev: string, next: string): number {
  const max = Math.min(prev.length, next.length, 48);
  const pl = prev.toLowerCase();
  const nl = next.toLowerCase();
  for (let len = max; len >= 2; len--) {
    if (pl.slice(-len) === nl.slice(0, len)) return len;
  }
  return 0;
}

/** @deprecated kept for tests — prefer shouldMergeTutor for live path. */
/**
 * React-key safety for transcript turns: return `id` unchanged unless another
 * turn (not the one at `selfIndex`) already owns it, in which case append a
 * `#n` suffix until unique. Prevents "two children with the same key" when
 * LiveKit re-emits a segment id (SG_…).
 */
function uniqueTurnId(turns: TranscriptTurn[], id: string, selfIndex = -1): string {
  const taken = (candidate: string) => turns.some((t, i) => i !== selfIndex && t.id === candidate);
  if (!taken(id)) return id;
  let n = 2;
  while (taken(`${id}#${n}`)) n += 1;
  return `${id}#${n}`;
}

function isNewTutorUtterance(prev: string, next: string): boolean {
  // Legacy linguistic split — only used in unit tests for documentation of old behavior.
  // Live path uses time/status via shouldMergeTutor instead.
  if (next.startsWith(prev) || prev.startsWith(next)) return false;
  const p = prev.trim();
  const n = next.trim();
  if (!p || !n) return false;
  if (p === n || p.endsWith(n)) return false;
  return false; // default: do not treat as new (stable paragraphs)
}

/** Exported for unit tests — same helpers used by TutorSession.upsertTurn. */
export const __transcriptTest = {
  isNoiseTranscript,
  appendTranscriptionChunk,
  mergeTutorText,
  isNewTutorUtterance,
  shouldMergeTutor,
  suffixPrefixOverlap,
  uniqueTurnId,
  TUTOR_TURN_GAP_MS,
};
