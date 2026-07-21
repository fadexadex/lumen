# Teacher AI (Lumen / SparkLearn)

Real-time voice AI math tutor that talks with the learner on an interactive whiteboard and can draw, label, and highlight on the canvas while speaking.

Local development runs **three processes** that work together over LiveKit Cloud:

| Process | Directory | Default port | Role |
| --- | --- | --- | --- |
| Web app | `frontend/` | `8080` | TanStack Start + Vite frontend (lessons, board, Live UI) |
| API / token server | `token-server/` | `8787` | Mints LiveKit JWTs; also serves Monnify payment APIs |
| Voice agent | `agent/` | — | Python LiveKit worker (Gemini Live or OpenAI Realtime) |

```
Browser (:8080)
   │  GET /token?room=…&identity=…
   ▼
token-server (:8787) ──► LiveKit Cloud (wss://…)
   ▲                            │
   │                            ▼
   └──────── agent worker joins the same room, speaks + RPCs canvas tools
```

> `math-canvas-ai/` is an earlier sibling canvas app. Day-to-day work and Live tutoring use **`frontend`**.

---

## Prerequisites

Install these before the first run:

| Tool | Why | Notes |
| --- | --- | --- |
| **Node.js 20+** (npm) | App + token server | [nvm](https://github.com/nvm-sh/nvm) recommended |
| **[uv](https://docs.astral.sh/uv/)** | Python agent deps + runner | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| **Python 3.10–3.13** | Agent runtime | Pulled/managed by `uv` via `agent/pyproject.toml` |
| **LiveKit Cloud** project | Realtime transport | [cloud.livekit.io](https://cloud.livekit.io) — Build tier is fine |
| **Google AI Studio** key | Gemini Live (default voice model) | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **Mic + browser** | Voice sessions | Chrome/Edge recommended; allow microphone for `localhost` |

Optional:

- **OpenAI API key** — only if you set `LUMEN_MODEL_BACKEND=openai`
- **Monnify sandbox keys** — only if you exercise the subscription / paywall flow
- **Tavily / Mistral keys** — used by generative-course / context features when enabled

---

## 1. Clone and install dependencies

From the repo root:

```bash
# Web app
cd frontend
npm install
cd ..

# Token / payments API
cd token-server
npm install
cd ..

# Voice agent (creates .venv from pyproject.toml + uv.lock)
cd agent
uv sync
cd ..
```

---

## 2. Configure environment

All shared secrets live in **one file**: `frontend/.env`.

The token server loads it via `node --env-file=../frontend/.env`.  
The agent loads it first, then optionally overrides with `agent/.env.local`.

Create `frontend/.env` (it is gitignored):

```dotenv
# --- Required for Live tutoring ---
GEMINI_API_KEY=your-google-ai-studio-key

LIVEKIT_URL=wss://<your-project>.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxx

# Client-visible (VITE_ only — never put API secrets here)
VITE_LIVEKIT_URL=wss://<your-project>.livekit.cloud
VITE_LUMEN_TOKEN_URL=http://localhost:8787/token

# --- Optional: OpenAI Realtime fallback ---
# OPENAI_API_KEY=sk-...
# LUMEN_MODEL_BACKEND=openai
# LUMEN_GEMINI_MODEL=gemini-2.5-flash-native-audio-preview-12-2025

# --- Optional: generative course / search ---
# TAVILY_API_KEY=tvly-...
# MISTRAL_API_KEY=...

# --- Optional: Monnify sandbox (paywall) ---
# MONNIFY_API_KEY=MK_TEST_...
# MONNIFY_SECRET_KEY=...
# MONNIFY_BASE_URL=https://sandbox.monnify.com
# MONNIFY_CONTRACT_CODE=...
# MONNIFY_WALLET_ACCOUNT_NUMBER=...
# SUBSCRIPTION_AMOUNT_NGN=2000
# SUBSCRIPTION_CREDITS=100

# Empty = same-origin; Vite proxies /payments → token-server :8787
VITE_LUMEN_PAYMENT_URL=
```

### Where to get LiveKit values

1. Create a project at [cloud.livekit.io](https://cloud.livekit.io).
2. Open **Settings → Keys** (or project settings).
3. Copy **WebSocket URL** → `LIVEKIT_URL` and `VITE_LIVEKIT_URL`.
4. Copy **API Key** / **API Secret** → `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`.

### Secrets hygiene

- Never prefix secrets with `VITE_` — Vite embeds those into the browser bundle.
- Client only needs: short-lived JWT + public `wss://` URL.
- Optional agent-only overrides go in `agent/.env.local` (also gitignored).
- The agent maps `GEMINI_API_KEY` → `GOOGLE_API_KEY` for the LiveKit Google plugin.

---

## 3. Start the three processes

Open **three terminals**. Start in this order so health checks are easy.

### Terminal 1 — Token / payments server (`:8787`)

```bash
cd token-server
npm start
# equivalent: node --env-file=../frontend/.env server.mjs
```

Expected log:

```text
lumen api on :8787
```

If Monnify contract code is missing you may see a warning; Live tutoring still works without payments.

**Quick check:**

```bash
curl -s "http://localhost:8787/token?room=test&identity=me"
# → {"token":"eyJ...","url":"wss://..."}
```

### Terminal 2 — Voice agent

```bash
cd agent
uv run agent.py dev
```

Expected log includes:

```text
livekit.agents - starting worker
livekit.agents - plugin registered  {"plugin": "livekit.plugins.google", ...}
```

The worker registers with LiveKit Cloud and waits for rooms. After a learner clicks **Live**, the agent joins that room.

**Voice-only smoke test (no browser):**

```bash
cd agent
uv run agent.py console
```

Talk in the terminal; tool calls print to the console. Useful before wiring the UI.

**OpenAI fallback** (requires `OPENAI_API_KEY` in env):

```bash
cd agent
LUMEN_MODEL_BACKEND=openai uv run agent.py dev
```

> Agent code changes require a restart (`uv run agent.py dev` does not hot-reload in-process; use `lk agent dev` if you want LiveKit’s reload tooling).

### Terminal 3 — Web app (`:8080`)

```bash
cd frontend
npm run dev
```

Expected:

```text
VITE v8.x.x  ready in …
➜  Local:   http://localhost:8080/
```

If `8080` is already taken, Vite picks the next free port (e.g. `8081`) — use the URL it prints.

Vite proxies `/payments/*` → `http://localhost:8787` so the browser can call payment APIs same-origin when `VITE_LUMEN_PAYMENT_URL` is empty.

---

## 4. Use the app

1. Open **http://localhost:8080/**.
2. Complete onboarding (name, grade, topic, etc.) if prompted.
3. Open a lesson (e.g. `/lesson/quad-1` or via the roadmap).
4. Click **Live** in the lesson chrome.
5. Allow microphone access when the browser asks.
6. Speak — Lumen should greet and answer; the orb pulses with audio; the board stays interactive.
7. End the session with the overlay’s end control.

While Live is active you can pan/zoom/ink the board; annotations from the agent stay pinned in world space.

---

## Health-check checklist

Do these in order before debugging the UI:

| # | Check | Pass criteria |
| --- | --- | --- |
| 1 | Token server | `curl` to `/token?...` returns JSON with `token` and `url` |
| 2 | Agent | Logs show worker started and plugins registered (not crashing on missing keys) |
| 3 | App | `http://localhost:8080/` loads |
| 4 | Live | Click **Live** → agent log shows a job/room; orb appears; audio plays |

If Live joins but there is no agent voice, the token path is fine — focus on agent env (`GEMINI_API_KEY` / LiveKit keys) and that `uv run agent.py dev` is still running.

---

## Ports and URLs (reference)

| Service | URL |
| --- | --- |
| App | http://localhost:8080 |
| Token | http://localhost:8787/token |
| Payments config | http://localhost:8787/payments/config |
| Payments init | `POST` http://localhost:8787/payments/init |
| Payments verify | http://localhost:8787/payments/verify |
| Proxied payments (from app) | http://localhost:8080/payments/* |

---

## Optional: live tests

With token-server + agent running:

```bash
cd tests/live
npm install   # first time
npm run test:live
```

Browser E2E (expects the app at `http://localhost:8080` by default):

```bash
cd tests/live
node browser-e2e.mjs
# or: LUMEN_APP_URL=http://localhost:8081 node browser-e2e.mjs
```

App unit tests:

```bash
cd frontend
npm test
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Token server exits immediately | Missing `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Fill `frontend/.env`; run via `npm start` so `--env-file` is used |
| `curl /token` fails / CORS in browser | Token server not running or wrong `VITE_LUMEN_TOKEN_URL` | Start terminal 1; URL should be `http://localhost:8787/token` |
| Live connects but silence | Agent not running or bad Gemini key | Start `uv run agent.py dev`; verify `GEMINI_API_KEY` |
| Agent: missing Google key | Only `GEMINI_API_KEY` set incorrectly | Ensure key is in `frontend/.env` (agent loads that path) |
| Port 8080 in use | Another Vite instance | Use the printed port, or kill the old process |
| Payments fail | Missing Monnify contract / keys | Add `MONNIFY_*` to `.env`; restart token-server |
| Mic denied | Browser permission | Allow mic for `localhost` and retry Live |

---

## Repo layout

```
teacher-ai/
├── frontend/     # Main web app (Vite + TanStack Start)
├── token-server/      # LiveKit JWT + Monnify payment API (:8787)
├── agent/             # Python LiveKit + Gemini/OpenAI voice worker
├── tests/live/        # Live integration / browser checks
├── math-canvas-ai/    # Earlier canvas prototype (not required for Lumen Live)
└── README.md          # This file
```

Design and implementation notes for Lumen Live live under `frontend/plan/`. Generative course plans: `frontend/plan-generative-courses/`.

---

## Quick start (cheat sheet)

```bash
# Terminal 1
cd token-server && npm start

# Terminal 2
cd agent && uv run agent.py dev

# Terminal 3
cd frontend && npm run dev
```

Then open http://localhost:8080 → enter a lesson → click **Live**.
