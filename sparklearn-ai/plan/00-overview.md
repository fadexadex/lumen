# Lumen Live — End-to-End Implementation Plan (00 · Overview)

> Goal: A real-time **voice** AI tutor ("Lumen") that talks with the learner while they
> stay on the math whiteboard, and that can **draw, label, highlight, and animate on the
> canvas while it is speaking**. Stack: **Gemini Live API** (native audio) transported by
> **LiveKit Agents**. Free-tier / demo-first.

> Sibling plan: **`../plan-generative-courses/`** — AI-generated roadmaps, lesson scripts,
> background module streaming, and Vercel AI SDK generative UI. Live tutor consumes those
> `LessonScript`s; see `plan-generative-courses/07-integration-with-live-tutor.md`.

This `plan/` folder is ordered. Read in sequence:

| File                                      | What it covers                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `00-overview.md`                          | Vision, decisions, glossary, file map (this file)                          |
| `01-architecture-and-data-flow.md`        | System diagram, the full voice loop, sequence diagrams                     |
| `02-backend-livekit-gemini-agent.md`      | Python agent worker, Gemini Live plugin, function tools                    |
| `03-token-server-and-env.md`              | Token endpoint, env vars, secrets, running everything                      |
| `04-frontend-livekit-client.md`           | React room connection, `TutorSession` abstraction, transcripts             |
| `05-canvas-controller-and-annotations.md` | **The hard part** — world-space annotation layer + `LumenCanvasController` |
| `06-tool-protocol-and-rpc.md`             | Tool schema, JSON command protocol, agent→client RPC dispatch              |
| `07-ui-overlay-and-animations.md`         | `LumenOverlay`, orb states, transcript, animations, removing `LiveDrawer`  |
| `08-board-context-and-grounding.md`       | Feeding live board state to the model so it knows what it's looking at     |
| `09-phased-rollout-and-testing.md`        | Day 1 / Week 1 / Later, demo scripts, quota + fallback strategy            |
| `10-file-manifest-and-checklists.md`      | Exact new/edited files + acceptance criteria                               |
| `11-live-context-budget.md`               | Staying under 65k TPM: Mistral compresses context for Gemini Live          |

---

## 1. What we're building (in one breath)

The learner clicks **Live**. Instead of a fullscreen chat takeover (today's `LiveDrawer`),
a small **orb** appears in a corner and Lumen greets them by voice. The learner keeps
panning/zooming/inking the `MathCanvas` the entire time. When the learner asks _"why does
this open upward?"_, Lumen **talks** and — mid-sentence — **circles the vertex, draws the
axis of symmetry, and drops a label**, all pinned to the board so they stay put when the
learner zooms. A minimal transcript sits top-right.

## 2. Non-negotiable product constraints

1. **Stay on the graph.** The AI is an _overlay_. It NEVER takes pointer capture. The learner's
   pan/zoom/ink always wins.
2. **Draw while talking.** Canvas tools are _async / fire-and-forget_. The model keeps
   speaking while the animation plays. A tool that blocks the speech turn is a bug.
3. **Annotations are world-space.** AI marks live _inside_ `.mc-world` so they pan/zoom with
   the content. (Today's ink layer is screen-space — we do NOT reuse it for AI marks.)
4. **Free-demo-first.** Gemini Live free tier + LiveKit Cloud Build (free). One env flag
   swaps to OpenAI Realtime if Gemini quota walls a live pitch.
5. **Beautiful.** Orb reacts to real audio amplitude; every annotation animates on
   (draw-on strokes, fade-rise labels, breathing highlights). Detailed in `07`.

## 3. Stack decision (locked)

| Concern            | Choice                                                              | Why                                                                         |
| ------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Realtime transport | **LiveKit Cloud (Build, free)**                                     | WebRTC, echo-cancel, transcripts, RPC data channel, free 1,000 agent-min/mo |
| Agent runtime      | **`livekit-agents` (Python)**                                       | First-class Gemini Live plugin, async tools, RPC to client                  |
| Model              | **Gemini 2.5 Flash native-audio Live** via `livekit-plugins-google` | Speech-to-speech, free tier via AI Studio, tool calling                     |
| Fallback model     | **OpenAI Realtime** (`livekit-plugins-openai`)                      | One env flag; quota insurance                                               |
| Frontend SDK       | **`@livekit/components-react` + `livekit-client`**                  | Room, audio, transcription, RPC hooks                                       |
| AI presence        | **Existing `.live-orb`**, amplitude-driven                          | No paid avatar for demo                                                     |
| Canvas control     | **New world-space SVG layer + `LumenCanvasController`**             | The differentiator; 100% our code                                           |

Rationale and the alternatives we rejected (OpenAI-direct, Pipecat, Vapi/Retell) are in the
research canvas: `canvases/lumen-live-ai-stack-research.canvas.tsx`.

## 4. The three layers (mental model)

```
┌─ lesson-shell (fixed, fullscreen) ───────────────────────────────┐
│  LAYER 2 · BOARD   .mc-viewport > .mc-world(translate,scale)      │ owns ALL pointer input
│                      > .mc-board                                   │
│                        > .mc-lesson-layer   (existing beats)      │
│                        > .mc-annotation-layer  ← NEW, world-space  │ AI marks, pointer-events:none
│                                                                   │
│  LAYER 1 · PRESENCE  <LumenOverlay/>  (position:fixed)            │ orb + transcript + mic
│                       pointer-events:none except its own chrome   │ NEVER intercepts board
└──────────────────────────────────────────────────────────────────┘
        LAYER 3 · TRANSPORT  LiveKit room  ⇄  Python agent  ⇄  Gemini Live
```

- **Layer 2 (Board)** already exists (`MathCanvas`). We add ONE child: `.mc-annotation-layer`
  inside `.mc-board`, plus expose an imperative controller.
- **Layer 1 (Presence)** replaces `LiveDrawer`. New `LumenOverlay`.
- **Layer 3 (Transport)** is new: a token endpoint + a Python agent worker + client room wiring.

## 5. Repo file map (new + edited)

New backend/infra:

```
agent/                              # Python LiveKit agent worker (NEW)
  agent.py                          #   session, Gemini Live model, tools
  tools.py                          #   function tools → canvas commands
  board_context.py                  #   board-state text grounding
  prompts.py                        #   system prompt / persona
  pyproject.toml / requirements.txt
  .env.local                        #   LIVEKIT_*, GOOGLE_API_KEY, OPENAI_API_KEY
token-server/                       # tiny Node token minter (NEW, or TanStack route)
  server.mjs
```

New frontend (all under `sparklearn-ai/src`):

```
lib/live/
  livekit-client.ts                 # connect(), room singleton, token fetch
  tutor-session.ts                  # TutorSession abstraction (start/stop/state)
  canvas-agent-bridge.ts            # global controller registry (mirrors whiteboard-bridge)
  canvas-commands.ts                # JSON command schema + type guards
  board-targets.ts                  # named anchors (vertex, axis, math beats) → world coords
  board-context.ts                  # client-side board summary sender
  use-audio-amplitude.ts            # AnalyserNode → amplitude for the orb
  use-lumen-session.ts              # React hook wrapping TutorSession + RPC registration
components/live/
  LumenOverlay.tsx                  # orb + transcript + mic (replaces LiveDrawer)
  LumenOrb.tsx                      # amplitude-reactive orb
  LumenTranscript.tsx               # minimal top-right transcript
components/math-canvas/
  annotation-layer.tsx              # NEW world-space SVG annotation renderer + controller
  math-canvas.css                   # + annotation styles/keyframes
lib/live/live.css                   # overlay styles/keyframes
```

Edited:

```
components/math-canvas/MathCanvas.tsx   # mount annotation layer, register controller, expose coord fns
components/whiteboard/LessonRoute.tsx   # swap LiveDrawer → LumenOverlay; session at route level
lib/design.css                          # keep .live-orb; overlay-specific moves to live.css
routes/__root.tsx                       # (optional) preconnect to LiveKit
```

Deleted / retired:

```
components/whiteboard/LiveDrawer.tsx     # removed (or kept as mock behind a flag)
```

## 6. Glossary

- **Beat** — an atomic lesson element (title/text/math/options/diagram) laid out in world
  coords by `layout.ts`. Rendered by `BeatView`.
- **World space** — coordinate system of `.mc-board` (0..`BOARD_W` × 0..`BOARD_H`),
  transformed by `view = {x,y,scale}`.
- **Screen space** — raw viewport pixels of `.mc-viewport`.
- **Target / anchor** — a named board location the agent can reference ("vertex", "axis",
  "step-2-equation"), resolved to world coords client-side (`board-targets.ts`).
- **Command** — a JSON instruction from agent → client describing one annotation op.
- **Async tool** — an agent function tool that returns immediately so speech continues while
  the client animates.

## 7. Success definition

- **Day 1:** Speak → Lumen answers in real time; orb pulses to its voice; transcript streams;
  board fully usable; no takeover.
- **Week 1:** Ask "why does it open upward?" → Lumen talks AND circles the vertex + draws the
  axis of symmetry + labels it; marks stay pinned through zoom/pan; can `clear`.
- **Later:** OpenAI fallback flag; barge-in; optional screenshot vision; optional avatar.
