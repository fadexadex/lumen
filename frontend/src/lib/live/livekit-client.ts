import { Room, RoomEvent, Track } from "livekit-client";
import type { RemoteParticipant, RemoteTrack } from "livekit-client";

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;
/** Same-origin TanStack Start route — secrets stay on the server. */
const TOKEN_URL = (import.meta.env.VITE_LUMEN_TOKEN_URL as string | undefined) || "/api/lumen-token";

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

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isConnectionRefused(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|load failed|err_connection_refused/i.test(msg);
}

/**
 * Mint a LiveKit JWT via the TanStack Start route.
 * Retries briefly — Vite sometimes restarts and looks like connection refused mid-HMR.
 */
export async function fetchToken(
  room: string,
  identity: string,
): Promise<{ token: string; url: string }> {
  const u = `${TOKEN_URL}?room=${encodeURIComponent(room)}&identity=${encodeURIComponent(identity)}`;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(u);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `token ${res.status}`);
      }
      const data = await res.json();
      return { token: data.token, url: data.url ?? LIVEKIT_URL };
    } catch (err) {
      lastErr = err;
      if (!isConnectionRefused(err) && !(err instanceof TypeError)) throw err;
      // Dev server down / restarting — wait and retry.
      await sleep(400 + attempt * 250);
    }
  }

  throw new Error(
    "Dev server isn't reachable on :8080 (token API). " +
      "In a terminal run: cd frontend && npm run dev:keep — then try Live again. " +
      `(${lastErr instanceof Error ? lastErr.message : String(lastErr)})`,
  );
}

export function createRoom(): Room {
  return new Room({
    adaptiveStream: true,
    dynacast: true,
  });
}

export { RoomEvent, Track };
export type { Room, RemoteTrack, RemoteParticipant };
