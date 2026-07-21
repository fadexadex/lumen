# 01 · Architecture & Data Flow

This file is the map everything else hangs off. It defines the processes, the transport
topology, the **full real-time loop**, and the exact sequence for "AI draws while talking".

---

## 1. Processes & topology

```
                         ┌──────────────────────────────────────┐
                         │  LiveKit Cloud (Build, free)          │
                         │  - WebRTC SFU (media)                 │
                         │  - Data channel / RPC                 │
   Browser (learner)     │  - Room: lumen-<moduleId>-<uid>       │      Agent worker (you run)
 ┌───────────────────┐   │                                      │   ┌──────────────────────────┐
 │ sparklearn-ai app │   │                                      │   │ Python  livekit-agents   │
 │  - MathCanvas     │◀─▶│◀════════ audio (Opus/WebRTC) ═══════▶│◀─▶│  AgentSession            │
 │  - LumenOverlay   │   │                                      │   │   └ RealtimeModel(Gemini) │
 │  - RPC client     │◀─▶│◀──────── data: transcripts ─────────▶│   │   └ function tools        │
 │  - Canvas ctrl    │◀──│◀──────── RPC: canvas commands ───────│───│  perform_rpc(user, ...)  │
 └───────────────────┘   └──────────────────────────────────────┘   └─────────────┬────────────┘
          ▲                                                                          │ WSS
          │ HTTPS GET /token (identity, room)                                        ▼
 ┌────────┴─────────┐                                                    ┌────────────────────────┐
 │ Token server     │  (Node livekit-server-sdk, or TanStack route)      │ Gemini Live API        │
 │  mints JWT       │                                                    │ (Google AI Studio key) │
 └──────────────────┘                                                    └────────────────────────┘
```

Three things you run locally for the demo:

1. **`sparklearn-ai`** (already: `npm run dev`).
2. **Token server** (`node token-server/server.mjs`) — mints LiveKit JWTs. See `03`.
3. **Agent worker** (`uv run agent.py dev`) — joins rooms, runs Gemini. See `02`.

LiveKit Cloud is hosted (free Build project). No SFU to self-host for the demo.

---

## 2. Why LiveKit RPC for canvas commands (not just data messages)

Two agent→client paths exist:

- **Data messages** (`publishData` / `RoomEvent.DataReceived`): fire-and-forget, great for
  high-frequency streams (e.g. live cursor). No return value.
- **RPC** (`performRpc` / `registerRpcMethod`): request/response with an ack + error surface.

We use **RPC** for canvas commands because:

- We get an **ack** ("command applied") so the agent's async tool can resolve cleanly.
- Errors (e.g. "target not found") propagate back to the model → it can self-correct verbally.
- It's 1:1 (agent → the specific learner), which matches our single-user demo.

We use **data messages** only for the _client→agent_ board-state deltas (slider moved, step
changed) where no response is needed. See `08`.

---

## 3. The full real-time loop (steady state)

```
 learner speaks ──▶ mic track ──▶ LiveKit ──▶ agent ──▶ Gemini Live (STT+reason+TTS in one model)
                                                              │
                        ┌─────────────────────────────────────┤
                        │                                     │
          (a) audio out │                        (b) tool call│  e.g. draw_axis_of_symmetry()
                        ▼                                     ▼
   Gemini audio ─▶ agent ─▶ LiveKit ─▶ browser         async tool handler:
     plays in <audio>, orb reacts                        1. build canvas Command JSON
                        │                                2. await room.perform_rpc(user,
          (c) transcript│                                     "lumen.canvas", payload)
                        ▼                                3. return "ok" to model immediately
   text stream ─▶ LumenTranscript (top-right)           (model keeps speaking — async)
                                                              │
                                                              ▼
                                        browser RPC handler "lumen.canvas":
                                          parse Command → LumenCanvasController.apply()
                                          → animate SVG in .mc-annotation-layer (world space)
```

Key property: **(a) audio, (b) tool call, (c) transcript are concurrent.** Because the tool
is `async` and returns before the animation finishes, Gemini's speech ("…notice how the
parabola — _[vertex gets circled]_ — opens upward…") is not blocked by the draw.

---

## 4. Sequence — session start (Day 1 scope)

```
User clicks "Live" in lesson topbar
  └▶ LessonRoute: setLiveOpen(true)
       └▶ useLumenSession().start({ moduleId, stepIndex })
            1. GET token-server /token?room=lumen-<mod>-<uid>&identity=learner-<uid>
            2. room = new Room(); await room.connect(LIVEKIT_URL, jwt)
            3. await room.localParticipant.setMicrophoneEnabled(true)
            4. room.registerRpcMethod("lumen.canvas", onCanvasCommand)   // for Week 1
            5. subscribe: RoomEvent.TrackSubscribed (agent audio) → <audio> + amplitude tap
            6. subscribe: text stream topic "lk.transcription" → transcript store
  Agent worker (already running) receives job for the room:
       └▶ entrypoint(ctx): connect, build AgentSession(Gemini RealtimeModel), session.start()
            └▶ session greets: "Hey, I'm Lumen. What are we looking at?"
  Orb: connecting → listening; transcript shows greeting; board still fully interactive.
```

## 5. Sequence — "draw while talking" (Week 1 scope, the money shot)

```
Learner: "Why does this parabola open upward?"
  mic ─▶ agent ─▶ Gemini
Gemini decides to: (speak) + call tool draw_axis_of_symmetry() + circle_point("vertex")
  Agent tool handler (async):
    cmd1 = {op:"drawAxis", args:{target:"axisOfSymmetry"}}
    cmd2 = {op:"circle",  args:{target:"vertex", label:"vertex"}}
    await ctx.room.local_participant.perform_rpc(
        destination_identity=user_identity, method="lumen.canvas",
        payload=json.dumps(cmd1))
    await ... perform_rpc(... cmd2)
    return "annotations shown"        # model keeps talking
  Browser onCanvasCommand(cmd):
    target = resolveTarget(cmd.args.target)      # board-targets.ts → world coords
    controller.drawAxis(target) / controller.circle(target, {label})
      └▶ append <path>/<ellipse>/<text> to .mc-annotation-layer (world coords)
      └▶ play draw-on animation (stroke-dashoffset), fade-rise label
  Because layer is INSIDE .mc-world, learner can now zoom/pan and marks stay pinned.
```

## 6. State machine — orb / session

```
        start()                connected + mic          agent audio frame
 idle ──────────▶ connecting ───────────────▶ listening ───────────────▶ speaking
   ▲                   │  error                     ▲                         │
   │                   ▼                            └───────── silence ───────┘
   └──── stop() ◀── error(banner)         (thinking = tool call in flight, optional)
```

- `idle` — no session.
- `connecting` — token + room.connect in flight (orb: slow breathing, muted).
- `listening` — connected, mic hot, agent quiet (orb: calm ring pulse).
- `speaking` — agent audio amplitude > threshold (orb: amplitude-driven scale + glow).
- `thinking` — optional: a tool call is running (orb: shimmer). Drives a subtle transcript
  "…" indicator.
- `error` — connection/quota failure (orb dim + retry affordance + fallback hint).

Implementation of the amplitude tap and CSS states is in `07`.

## 7. Threading model / who owns what

| Concern                            | Owner                                | Notes                                          |
| ---------------------------------- | ------------------------------------ | ---------------------------------------------- |
| Mic capture, echo cancel, playback | LiveKit client                       | `setMicrophoneEnabled`, auto-plays agent track |
| STT + reasoning + TTS              | Gemini Live (via agent)              | single speech-to-speech model                  |
| Turn-taking / interruption         | LiveKit Agents + Gemini              | built-in VAD + barge-in                        |
| Deciding WHAT to draw              | Gemini (tool calls)                  | guided by system prompt + board context        |
| Resolving "vertex" → coords        | **Client** (`board-targets.ts`)      | model never sees pixel coords                  |
| Rendering + animating marks        | **Client** (`LumenCanvasController`) | world-space SVG                                |
| Board state summary                | Client builds, agent consumes        | `board-context.ts` ⇄ `board_context.py`        |

Design rule that makes this tractable: **the model speaks in semantic targets** ("vertex",
"axis", "the x² term"), and the **client owns all geometry**. This keeps the model prompt
tiny, keeps annotations correct under zoom, and means we can restyle marks without touching
the agent.

## 8. Failure & degradation paths (designed, not incidental)

1. **Token server down** → `start()` throws → orb `error`, toast "Can't reach Lumen", retry.
2. **Agent not running** → room connects but no agent joins in N s → banner "Lumen is waking
   up…" then error. (Build tier cold starts; see `09`.)
3. **Gemini quota (429/1011)** → agent catches, emits a `lumen.system` RPC → client shows
   "Lumen hit a limit — switching voice" and (if configured) we relaunch the agent with the
   OpenAI adapter. See `09`.
4. **RPC canvas command fails client-side** (unknown target) → handler returns error → model
   hears "couldn't find that" → it can rephrase or ask. Never crashes the board.
5. **User denies mic** → fall back to text input in the overlay (still streams to agent as
   text; agent still speaks + draws).

Next: `02` builds the agent worker that produces these tool calls and audio.
