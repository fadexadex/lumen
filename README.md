# Teacher AI (Lumen)

Real-time voice AI math tutor. The learner talks with Lumen on an interactive whiteboard; the agent can draw, label, and highlight on the canvas while speaking.

## How it fits together

Two processes + LiveKit Cloud:

| Piece | Directory | Role |
| --- | --- | --- |
| **Web app** | `frontend/` | UI, lessons, board. Also mints LiveKit tokens and serves payment APIs (`/api/*`). |
| **Voice agent** | `agent/` | Python LiveKit worker (Gemini Live by default). Joins the room and tutors. |
| **LiveKit Cloud** | — | Realtime audio + RPC between browser and agent. |

```
Browser  ──►  frontend (:8080)
               │  GET /api/lumen-token
               ▼
         LiveKit Cloud (wss://…)
               ▲
               │  worker joins room
         agent (Python)
```

Local tip: `./dev-all.sh` starts frontend + agent together.

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

Optional: `OPENAI_API_KEY` (if `LUMEN_MODEL_BACKEND=openai`), Monnify keys (paywall), Tavily / Mistral (generative courses).

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

```dotenv
# Required for Live tutoring
GEMINI_API_KEY=your-google-ai-studio-key

LIVEKIT_URL=wss://<your-project>.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxx

# Client-visible (VITE_ only — never put secrets here)
VITE_LIVEKIT_URL=wss://<your-project>.livekit.cloud
VITE_LUMEN_TOKEN_URL=/api/lumen-token

# Optional: OpenAI Realtime instead of Gemini
# OPENAI_API_KEY=sk-...
# LUMEN_MODEL_BACKEND=openai

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

Starts frontend on `:8080` and the agent worker. Ctrl-C stops both.

### Option B — two terminals

```bash
# Terminal 1 — agent
cd agent
uv run agent.py dev
# expect: starting worker / plugin registered

# Terminal 2 — app
cd frontend
npm run dev
# → http://localhost:8080
```

Keep port **8080** free (`dev-all.sh` aborts if it’s taken).

### Use the app

1. Open http://localhost:8080  
2. Open a lesson → click **Live** → allow mic  
3. Speak — agent should greet; board stays interactive  

---

## URLs (local)

| What | URL |
| --- | --- |
| App | http://localhost:8080 |
| LiveKit token | http://localhost:8080/api/lumen-token |
| Payments | http://localhost:8080/api/payments/{config,init,verify} |

---

## Tests

```bash
# App unit tests
cd frontend && npm test

# Browser E2E (app on :8080)
cd tests/live && npm install && node browser-e2e.mjs
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Token curl fails | Frontend not running, or missing `LIVEKIT_*` in `frontend/.env` |
| Live connects but silence | Agent not running, or bad `GEMINI_API_KEY` |
| Agent missing Google key | Put `GEMINI_API_KEY` in `frontend/.env` (agent loads it) |
| Port 8080 in use | Free it, or use `./dev-all.sh` after killing the holder |
| Payments fail | Fill `MONNIFY_*` (esp. contract code); restart frontend |
| Mic denied | Allow mic for localhost and retry Live |

---

## Repo layout

```
teacher-ai/
├── frontend/       # Web app + /api/lumen-token + /api/payments/*
├── agent/          # Python LiveKit voice worker
├── tests/live/     # Live / browser checks
├── math-canvas-ai/ # Earlier canvas prototype (optional)
├── dev-all.sh      # Start frontend + agent
└── README.md
```
