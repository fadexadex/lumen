// Tier 2 #3 — token-roundtrip
// Starts the real token-server (Node, real LIVEKIT_API_KEY/SECRET from frontend/.env),
// hits GET /token, and verifies the JWT shape + grants + expiry for real.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokenServerDir = path.resolve(__dirname, "../../token-server");
const envFile = path.resolve(__dirname, "../../frontend/.env");
const PORT = 8787;

function b64urlDecode(seg) {
  const pad = "=".repeat((4 - (seg.length % 4)) % 4);
  const b64 = (seg + pad).replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

async function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status !== undefined) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export async function run() {
  const proc = spawn("node", ["--env-file", envFile, "server.mjs"], {
    cwd: tokenServerDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  proc.stdout.on("data", (d) => (serverLog += d.toString()));
  proc.stderr.on("data", (d) => (serverLog += d.toString()));

  try {
    const up = await waitForServer(`http://localhost:${PORT}/token?room=x&identity=y`);
    if (!up) throw new Error("token-server did not come up in time. log:\n" + serverLog);

    const res = await fetch(
      `http://localhost:${PORT}/token?room=lumen-test&identity=learner-test`,
    );
    const status = res.status;
    const body = await res.json();

    if (status !== 200) throw new Error(`expected 200, got ${status}: ${JSON.stringify(body)}`);
    if (typeof body.token !== "string") throw new Error("no token string in response");
    const segments = body.token.split(".");
    if (segments.length !== 3) throw new Error(`JWT should have 3 segments, got ${segments.length}`);
    if (typeof body.url !== "string" || !body.url.startsWith("wss://"))
      throw new Error(`expected wss:// url, got ${body.url}`);

    const payload = b64urlDecode(segments[1]);
    const grants = payload.video ?? payload.grants ?? {};
    if (grants.room !== "lumen-test") throw new Error(`grant room mismatch: ${JSON.stringify(grants)}`);
    if (grants.roomJoin !== true) throw new Error(`roomJoin not granted: ${JSON.stringify(grants)}`);
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= nowSec)
      throw new Error(`exp not in the future: exp=${payload.exp} now=${nowSec}`);

    return {
      name: "token-roundtrip",
      pass: true,
      detail: `status=${status} segments=3 grants.room=${grants.room} grants.roomJoin=${grants.roomJoin} exp=${payload.exp} (now=${nowSec}, +${payload.exp - nowSec}s) url=${body.url}`,
    };
  } finally {
    proc.kill("SIGTERM");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.pass ? 0 : 1);
    })
    .catch((e) => {
      console.error("FAIL:", e.message);
      process.exit(1);
    });
}
