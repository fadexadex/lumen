#!/usr/bin/env bash
#
# Start both Lumen Live processes together with auto-restart.
#   1. frontend — vite dev on :8080 (serves token + payment APIs)
#   2. agent    — Python tutor that joins the LiveKit room (voice + transcript)
#
# A dead agent = a silent room with no browser-side error, so each service runs
# under a supervisor loop that restarts it if it exits. Ctrl-C stops all three.
#
# Usage:  ./dev-all.sh
#
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- preflight ---------------------------------------------------------------
fail=0
[ -f "$ROOT/frontend/.env" ]         || { echo "✗ missing frontend/.env (LIVEKIT_*, GEMINI_API_KEY, MONNIFY_*)"; fail=1; }
[ -d "$ROOT/frontend/node_modules" ] || { echo "✗ frontend deps missing — run: cd frontend && npm install"; fail=1; }
command -v uv >/dev/null 2>&1        || { echo "✗ 'uv' not found — the Python agent needs it (https://docs.astral.sh/uv/)"; fail=1; }

# Ports must be free. Vite silently falls back to :8081 if :8080 is taken, which
# breaks the client + agent (they assume :8080). Abort loudly instead of drifting.
check_port() {
  local port="$1" name="$2" holder
  holder=$(lsof -iTCP:"$port" -sTCP:LISTEN -P -n 2>/dev/null | awk 'NR==2{print $1" (pid "$2")"}')
  if [ -n "$holder" ]; then
    echo "✗ port $port ($name) already in use by: $holder"
    echo "    free it first:  lsof -tiTCP:$port -sTCP:LISTEN | xargs kill"
    fail=1
  fi
}
check_port 8080 frontend
[ "$fail" = 0 ] || exit 1

# --- colored, prefixed logging ----------------------------------------------
C_FE=$'\033[36m'; C_AG=$'\033[32m'; C_SYS=$'\033[33m'; C_RST=$'\033[0m'
prefix() { local tag="$1" color="$2"; while IFS= read -r line; do printf '%s%-8s%s | %s\n' "$color" "$tag" "$C_RST" "$line"; done; }
sys() { printf '%s%-8s%s | %s\n' "$C_SYS" "system" "$C_RST" "$1"; }

pids=()
STOPPING=0

# Supervisor: run a command in a dir, restart it 1s after any exit (unless stopping).
supervise() {
  local tag="$1" color="$2" dir="$3"; shift 3
  (
    cd "$dir" || exit 1
    while [ "$STOPPING" = 0 ]; do
      "$@" 2>&1 | prefix "$tag" "$color"
      [ "$STOPPING" = 1 ] && break
      printf '%s%-8s%s | exited — restarting in 1s…\n' "$color" "$tag" "$C_RST"
      sleep 1
    done
  ) &
  pids+=("$!")
}

shutdown() {
  STOPPING=1
  sys "shutting down…"
  # Kill our whole process group so vite/node/python children go too.
  trap - INT TERM EXIT
  kill 0 2>/dev/null
  wait 2>/dev/null
  sys "stopped."
  exit 0
}
trap shutdown INT TERM

sys "starting frontend + agent  (Ctrl-C to stop all)"
supervise "frontend" "$C_FE" "$ROOT/frontend" npm run dev
supervise "agent"    "$C_AG" "$ROOT/agent"    uv run agent.py dev

sys "→ app:   http://localhost:8080"
sys "→ APIs:  http://localhost:8080/api"
sys "→ agent: LiveKit worker (watch for 'registered worker')"

wait
