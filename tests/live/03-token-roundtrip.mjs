// Tier 2 #3 — token-roundtrip
// Mints a LiveKit JWT the same way the frontend API does (livekit-server-sdk +
// frontend/.env) and verifies JWT shape + grants + expiry.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AccessToken } from "livekit-server-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(__dirname, "../../frontend/.env");

function loadEnvFile(filePath) {
  const env = {};
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function b64urlDecode(seg) {
  const pad = "=".repeat((4 - (seg.length % 4)) % 4);
  const b64 = (seg + pad).replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

export async function run() {
  const env = loadEnvFile(envFile);
  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  const livekitUrl = env.LIVEKIT_URL || env.VITE_LIVEKIT_URL;
  if (!apiKey || !apiSecret) {
    throw new Error("LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing from frontend/.env");
  }
  if (!livekitUrl || !livekitUrl.startsWith("wss://")) {
    throw new Error(`expected wss:// LIVEKIT_URL, got ${livekitUrl}`);
  }

  const room = "lumen-test";
  const identity = "learner-test";
  const at = new AccessToken(apiKey, apiSecret, { identity, name: "Learner" });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
  const token = await at.toJwt();

  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new Error(`JWT should have 3 segments, got ${segments.length}`);
  }

  const payload = b64urlDecode(segments[1]);
  const grants = payload.video ?? payload.grants ?? {};
  if (grants.room !== room) {
    throw new Error(`grant room mismatch: ${JSON.stringify(grants)}`);
  }
  if (grants.roomJoin !== true) {
    throw new Error(`roomJoin not granted: ${JSON.stringify(grants)}`);
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    throw new Error(`exp not in the future: exp=${payload.exp} now=${nowSec}`);
  }

  return {
    name: "token-roundtrip",
    pass: true,
    detail: `segments=3 grants.room=${grants.room} grants.roomJoin=${grants.roomJoin} exp=${payload.exp} (now=${nowSec}, +${payload.exp - nowSec}s) url=${livekitUrl}`,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.pass ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
