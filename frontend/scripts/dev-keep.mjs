#!/usr/bin/env node
/**
 * Keep Vite alive across accidental kills (Cursor/agent SIGKILL, etc.).
 * Usage: node scripts/dev-keep.mjs   OR   npm run dev:keep
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let child = null;
let stopping = false;

function start() {
  if (stopping) return;
  console.log(`[dev:keep] starting vite in ${root}`);
  child = spawn("npm", ["run", "dev"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    // New process group so Cursor shell cleanup is less likely to reap children.
    detached: process.platform !== "win32",
  });
  child.on("exit", (code, signal) => {
    child = null;
    if (stopping) return;
    console.warn(`[dev:keep] vite exited code=${code} signal=${signal}; restarting in 1s…`);
    setTimeout(start, 1000);
  });
}

function shutdown() {
  stopping = true;
  if (child?.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
start();
