import http from "node:http";
import { AccessToken } from "livekit-server-sdk";

const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, PORT = 8787, ALLOWED_ORIGIN = "*" } = process.env;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error(
    "Missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET in env. Run with: node --env-file=../sparklearn-ai/.env server.mjs",
  );
  process.exit(1);
}

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
