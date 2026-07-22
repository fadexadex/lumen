# Teacher AI (Lumen)

Real-time voice AI math tutor. The learner talks with Lumen on an interactive whiteboard; the agent can draw, label, and highlight on the canvas while speaking.

## How it fits together

Two processes + LiveKit Cloud:

| Piece | Directory | Role |
| --- | --- | --- |
| **Web app** | `frontend/` | UI, onboarding, generative courses, board. Mints LiveKit tokens and serves APIs (`/api/*`). |
| **Voice agent** | `agent/` | Python LiveKit worker (Gemini Live by default). Joins the room and tutors. |
| **LiveKit Cloud** | — | Realtime audio + RPC between browser and agent. |

```
Browser  ──►  frontend (:8080 local)
               │  GET /api/lumen-token
               ▼
         LiveKit Cloud (wss://…)
               ▲
               │  worker joins room
         agent (Python)
```

The browser and agent never call each other over HTTP — both join the **same LiveKit project**.  
Local tip: `./dev-all.sh` starts frontend + agent together.

Typical flow: onboard → (optional paywall) → generated course/roadmap → open a lesson → **Live**.

---

## Prerequisites

| Tool | Why |
| --- | --- |
| **Node.js 20+** | Frontend |
| **[uv](https://docs.astral.sh/uv/)** | Agent deps + runner |
| **Python 3.10–3.13** | Agent (managed by uv) |
| **LiveKit Cloud** project | [cloud.livekit.io](https://cloud.livekit.io) |
| **Gemini API key** | [Google AI Studio](https://aistudio.google.com/apikey) |
| Mic + Chrome/Edge | Voice sessions |

Optional: `OPENAI_API_KEY` (if `LUMEN_MODEL_BACKEND=openai`), `MISTRAL_API_KEY` (generative courses), Monnify keys (paywall). Tavily research is planned, not wired yet.

---

## Quick start

```bash
# 1) Install
cd frontend && npm install && cd ..
cd agent && uv sync && cd ..

# 2) Create frontend/.env  (see below)

# 3) Run both
./dev-all.sh
# or separately:
#   cd agent && uv run agent.py dev
#   cd frontend && npm run dev

# 4) Open http://localhost:8080 → lesson → Live
```

---

## Environment

One shared file: **`frontend/.env`** (gitignored).  
The agent loads it automatically, then optional overrides from `agent/.env.local`.  
(`GEMINI_API_KEY` is also copied to `GOOGLE_API_KEY` for the LiveKit Google plugin.)

```dotenv
# Required for Live tutoring
GEMINI_API_KEY=your-google-ai-studio-key

LIVEKIT_URL=wss://<your-project>.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxx

# Client-visible (VITE_ only — never put secrets here)
VITE_LIVEKIT_URL=wss://<your-project>.livekit.cloud
VITE_LUMEN_TOKEN_URL=/api/lumen-token

# Generative courses (server-side)
MISTRAL_API_KEY=...

# Optional: OpenAI Realtime instead of Gemini
# OPENAI_API_KEY=sk-...
# LUMEN_MODEL_BACKEND=openai
# LUMEN_GEMINI_MODEL=...          # override default Gemini model
# LUMEN_AGENT_NAME=...            # isolate workers on a shared LiveKit project

# Optional: Monnify paywall
# MONNIFY_API_KEY=...
# MONNIFY_SECRET_KEY=...
# MONNIFY_BASE_URL=https://sandbox.monnify.com
# MONNIFY_CONTRACT_CODE=...
# MONNIFY_WALLET_ACCOUNT_NUMBER=...
# SUBSCRIPTION_AMOUNT_NGN=2000
# SUBSCRIPTION_CREDITS=100
```

**LiveKit keys:** Cloud project → Settings → Keys → copy URL, API Key, API Secret into the vars above.

**Secrets:** never prefix secrets with `VITE_`. The browser only gets a short-lived JWT + the public `wss://` URL.

---

## Local development

### Option A — one command

```bash
./dev-all.sh
```

Starts frontend on `:8080` and the agent worker (with auto-restart). Ctrl-C stops both.

### Option B — two terminals

```bash
# Terminal 1 — agent
cd agent
uv run agent.py dev
# expect: registered worker / plugin registered

# Terminal 2 — app
cd frontend
npm run dev
# → http://localhost:8080
```

Keep port **8080** free (`dev-all.sh` aborts if it’s taken).

### Use the app

1. Open http://localhost:8080  
2. Complete onboarding / open a lesson → click **Live** → allow mic  
3. Speak — agent should greet; board stays interactive (agent draws via LiveKit RPC)

---

## URLs (local)

| What | URL |
| --- | --- |
| App | http://localhost:8080 |
| LiveKit token | http://localhost:8080/api/lumen-token |
| Payments | http://localhost:8080/api/payments/{config,init,verify} |
| Courses | http://localhost:8080/api/course/{start,$id} |

---

## Deployment

Frontend and agent deploy separately; they only need the **same LiveKit Cloud credentials**.

| Piece | Host | Command / notes |
| --- | --- | --- |
| **Agent** | Railway (`agent/railway.toml`) | `python agent.py start` |
| **Web app** | Lovable / Nitro → Cloudflare (`cloudflare-module`) | Build with `frontend` `npm run build`; set server + `VITE_*` env on the host |

### Railway (agent) env

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
- Optional: `LUMEN_MODEL_BACKEND`, `LUMEN_GEMINI_MODEL`, `LUMEN_AGENT_NAME`, `OPENAI_API_KEY`

### Frontend host env

- Server: `LIVEKIT_*`, `GEMINI_API_KEY` (if needed), `MISTRAL_API_KEY`, Monnify vars
- Build-time: `VITE_LIVEKIT_URL`, `VITE_LUMEN_TOKEN_URL` (usually `/api/lumen-token`)

### Prod smoke check

1. Stop any **local** agent (`uv run agent.py dev`) so it doesn’t race the Railway worker.
2. Confirm Railway service is Running and logs show a registered worker.
3. Open the **deployed** app (not localhost) → lesson → **Live** → allow mic.
4. You should hear Lumen; in [LiveKit Cloud](https://cloud.livekit.io) the room should show both learner + agent.
5. Optional: start a generative course (`MISTRAL_API_KEY` must be set on the frontend host).

**Silence after connect** usually means the agent isn’t online or LiveKit keys don’t match the frontend project.

> Note: “Vercel” in this repo mainly means the **Vercel AI SDK** used for course generation — not the frontend host.

---

## Tests

```bash
# App unit tests
cd frontend && npm test

# Agent unit tests (pytest must be available in the environment)
cd agent && uv run pytest

# Browser E2E (app on :8080)
cd tests/live && npm install && node browser-e2e.mjs
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Token curl fails | Frontend not running, or missing `LIVEKIT_*` in `frontend/.env` |
| Live connects but silence | Agent not running (local or Railway), or bad `GEMINI_API_KEY` / mismatched LiveKit project |
| Agent missing Google key | Put `GEMINI_API_KEY` in `frontend/.env` (agent loads it) |
| Port 8080 in use | Free it, or use `./dev-all.sh` after killing the holder |
| Course start fails | Set `MISTRAL_API_KEY` in `frontend/.env` / host env |
| Payments fail | Fill `MONNIFY_*` (esp. contract code); restart frontend |
| Mic denied | Allow mic for localhost (or your deployed origin) and retry Live |
| Local + Railway both online | Kill local agent so only one worker claims rooms |

---

## Repo layout

```
teacher-ai/
├── frontend/       # Web app + /api/lumen-token + payments + courses
├── agent/          # Python LiveKit voice worker (+ railway.toml, tests/)
├── tests/live/     # Live / browser checks
├── token-server/   # Legacy leftover (unused — tokens live in frontend /api)
├── dev-all.sh      # Start frontend + agent
└── README.md
```
