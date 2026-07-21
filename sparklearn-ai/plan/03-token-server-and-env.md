# 03 · Token Server, Env & Running Everything

The browser needs a short-lived **LiveKit access token (JWT)** to join a room. Tokens MUST be
minted server-side (the API secret can never ship to the client). Two options — pick one.

---

## Option A (recommended for demo) — tiny standalone Node token server

Decoupled, 30 lines, no coupling to TanStack SSR. Runs on `:8787`.

```
token-server/
  server.mjs
  package.json
  .env
```

`token-server/package.json`:

```json
{
  "name": "lumen-token-server",
  "type": "module",
  "private": true,
  "dependencies": {
    "livekit-server-sdk": "^2.9.0",
    "dotenv": "^16.4.5"
  }
}
```

`token-server/.env`:

```dotenv
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxx
PORT=8787
ALLOWED_ORIGIN=http://localhost:3000
```

`token-server/server.mjs`:

```js
import "dotenv/config";
import http from "node:http";
import { AccessToken } from "livekit-server-sdk";

const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, PORT = 8787, ALLOWED_ORIGIN = "*" } = process.env;

const server = http.createServer(async (req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/token") {
    res.writeHead(404, cors);
    return res.end("not found");
  }

  const room = url.searchParams.get("room");
  const identity = url.searchParams.get("identity");
  const name = url.searchParams.get("name") ?? "Learner";
  if (!room || !identity) {
    res.writeHead(400, cors);
    return res.end("room and identity required");
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: "15m", // short-lived
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true, // mic
    canSubscribe: true, // agent audio
    canPublishData: true, // board-state deltas
  });

  const token = await at.toJwt();
  res.writeHead(200, { ...cors, "content-type": "application/json" });
  res.end(JSON.stringify({ token, url: process.env.LIVEKIT_URL ?? null }));
});

server.listen(PORT, () => console.log(`token-server on :${PORT}`));
```

Run:

```bash
cd token-server && npm i && node --env-file=.env server.mjs
```

Client env (`sparklearn-ai/.env` — Vite reads `VITE_` vars):

```dotenv
VITE_LIVEKIT_URL=wss://<project>.livekit.cloud
VITE_LUMEN_TOKEN_URL=http://localhost:8787/token
```

---

## Option B — TanStack Start server route (no extra process)

If you prefer one dev command, add a server route inside the app. TanStack Start (this repo:
`@tanstack/react-start ^1.168`) supports server routes via `createServerFileRoute`.

`sparklearn-ai/src/routes/api/lumen-token.ts`:

```ts
import { createServerFileRoute } from "@tanstack/react-start/server";
import { AccessToken } from "livekit-server-sdk";

export const ServerRoute = createServerFileRoute("/api/lumen-token").methods({
  GET: async ({ request }) => {
    const url = new URL(request.url);
    const room = url.searchParams.get("room");
    const identity = url.searchParams.get("identity");
    if (!room || !identity) {
      return new Response("room and identity required", { status: 400 });
    }
    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity,
      ttl: "15m",
    });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return Response.json({ token: await at.toJwt(), url: process.env.LIVEKIT_URL ?? null });
  },
});
```

Add `livekit-server-sdk` to the app deps:

```bash
cd sparklearn-ai && npm i livekit-server-sdk
```

App env (`.env`, server-side — NOT `VITE_` so it never reaches the client):

```dotenv
LIVEKIT_URL=wss://<project>.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxx
VITE_LIVEKIT_URL=wss://<project>.livekit.cloud
VITE_LUMEN_TOKEN_URL=/api/lumen-token
```

> Verify the exact server-route export name against your installed version
> (`node_modules/@tanstack/react-start`), since the API has moved between `createServerFileRoute`
> and `createServerFn`. If the route API differs, use **Option A** — it's version-proof.

**Recommendation:** ship the demo on **Option A** (isolated, can't break SSR), migrate to
Option B later if you want a single deploy.

---

## Identity & room naming

Generate a stable per-tab identity and a deterministic room per lesson so the agent + learner
land in the same room:

```ts
// lib/live/livekit-client.ts (excerpt — full file in 04)
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
```

Each learner+module gets its own room, so a single agent worker (Build tier: 5 concurrent
sessions) comfortably serves a demo.

---

## Secrets hygiene

- `LIVEKIT_API_SECRET`, `GOOGLE_API_KEY`, `OPENAI_API_KEY` (voice), and `MISTRAL_API_KEY` /
  `TAVILY_API_KEY` (content — see `../plan-generative-courses/08`) live ONLY in server-side `.env`
  files (`token-server/.env`, `agent/.env.local`, and the app server env). Never `VITE_`-prefix
  them — that would ship them to the browser.
- Client only ever receives: the short-lived JWT + the public `wss://` URL.
- Add to `.gitignore`: `agent/.env.local`, `token-server/.env`, `sparklearn-ai/.env`.
- For a shared demo build, use Gemini AI Studio **ephemeral tokens** later; not needed locally.

---

## The three-terminal dev ritual

```bash
# 1) token server (Option A)
cd token-server && node --env-file=.env server.mjs        # :8787

# 2) agent worker
cd agent && uv run agent.py dev                            # connects to LiveKit Cloud

# 3) the app
cd sparklearn-ai && npm run dev                            # :3000
```

Health check order: token server responds to
`curl "http://localhost:8787/token?room=test&identity=me"` → returns `{token, url}`; agent log
shows "registered worker"; app loads. Then click **Live**.

Next: `04` wires the browser to actually join the room and stream audio.
