/**
 * Live E2E harness (no mic/voice required for most checks).
 *
 * Covers:
 *  1) token mint
 *  2) LiveKit room join + agent participant appears
 *  3) board-state data publish accepted
 *  4) existing vitest contract + transcript suites (spawned)
 *
 * Voice round-trip (real speech → Lumen audio) still needs a human or a fake-audio
 * browser profile — called out in the summary.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Room, RoomEvent, ConnectionState } from "@livekit/rtc-node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const envPath = path.resolve(root, "frontend/.env");

function loadEnv() {
  const raw = readFileSync(envPath, "utf8");
  /** @type {Record<string,string>} */
  const out = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function ok(name, detail) {
  return { name, pass: true, detail };
}
function fail(name, detail) {
  return { name, pass: false, detail };
}

async function testToken(env) {
  const tokenUrl = env.VITE_LUMEN_TOKEN_URL || "http://localhost:8787/token";
  const res = await fetch(
    `${tokenUrl}?room=${encodeURIComponent("lumen-e2e-harness")}&identity=e2e-learner`,
  );
  if (!res.ok) return fail("token-mint", `HTTP ${res.status}`);
  const body = await res.json();
  if (!body.token || !(body.url || env.VITE_LIVEKIT_URL || env.LIVEKIT_URL)) {
    return fail("token-mint", `bad body keys: ${Object.keys(body)}`);
  }
  return ok("token-mint", `token len=${body.token.length} url=${body.url ?? env.LIVEKIT_URL}`);
}

async function testAgentJoinsRoom(env) {
  const tokenUrl = env.VITE_LUMEN_TOKEN_URL || "http://localhost:8787/token";
  const identity = `e2e-${Math.random().toString(36).slice(2, 8)}`;
  const roomName = `lumen-quad-1-${identity}`;
  const res = await fetch(
    `${tokenUrl}?room=${encodeURIComponent(roomName)}&identity=${encodeURIComponent(identity)}`,
  );
  const { token, url } = await res.json();
  const liveUrl = url || env.VITE_LIVEKIT_URL || env.LIVEKIT_URL;

  const room = new Room();
  /** @type {string[]} */
  const remotes = [];

  const agentSeen = new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 20000);
    room.on(RoomEvent.ParticipantConnected, (p) => {
      remotes.push(`${p.identity}:${p.kind ?? "?"}`);
      // Agents usually have identity containing "agent" or kind AGENT
      const id = (p.identity || "").toLowerCase();
      if (id.includes("agent") || String(p.kind).includes("AGENT")) {
        clearTimeout(t);
        resolve(true);
      }
    });
    room.on(RoomEvent.Connected, () => {
      for (const [, p] of room.remoteParticipants) {
        remotes.push(`${p.identity}:${p.kind ?? "?"}`);
        const id = (p.identity || "").toLowerCase();
        if (id.includes("agent") || String(p.kind).includes("AGENT")) {
          clearTimeout(t);
          resolve(true);
        }
      }
    });
  });

  try {
    await room.connect(liveUrl, token);
    // Publish a board-state packet like the app does.
    const board = {
      moduleId: "quad-1",
      stepIndex: 3,
      stepTotal: 4,
      stepTitle: "Your turn",
      equation: "y = 1x^2 - 5x + 6",
      parabola: { a: 1, b: -5, c: 6 },
      targets: ["vertex", "root1", "root2", "graph"],
    };
    const payload = new TextEncoder().encode(JSON.stringify(board));
    await room.localParticipant.publishData(payload, { topic: "lumen.board", reliable: true });

    const joined = await agentSeen;
    await room.disconnect();

    if (!joined) {
      return fail(
        "agent-joins-room",
        `no agent within 20s. remotes=[${remotes.join(", ") || "none"}]. Is agent.py running?`,
      );
    }
    return ok("agent-joins-room", `agent present; remotes=[${remotes.join(", ")}]`);
  } catch (e) {
    try {
      await room.disconnect();
    } catch {
      /* ignore */
    }
    return fail("agent-joins-room", String(e));
  }
}

function runVitest() {
  return new Promise((resolve) => {
    const proc = spawn("npm", ["test", "--", "--run", "src/lib/live/__tests__/"], {
      cwd: path.resolve(root, "frontend"),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (out += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(ok("vitest-live-unit", out.trim().split("\n").slice(-6).join(" | ")));
      else resolve(fail("vitest-live-unit", out.slice(-1500)));
    });
  });
}

async function main() {
  const env = loadEnv();
  /** @type {Array<{name:string,pass:boolean,detail:string}>} */
  const results = [];

  results.push(await testToken(env));
  results.push(await runVitest());
  results.push(await testAgentJoinsRoom(env));

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ summary: { pass: failed.length === 0, failed: failed.length, total: results.length }, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
