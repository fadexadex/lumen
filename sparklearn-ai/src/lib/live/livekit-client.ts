import { Room, RoomEvent, Track } from "livekit-client";
import type { RemoteParticipant, RemoteTrack } from "livekit-client";

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;
const TOKEN_URL = import.meta.env.VITE_LUMEN_TOKEN_URL as string;

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

export async function fetchToken(
  room: string,
  identity: string,
): Promise<{ token: string; url: string }> {
  const u = `${TOKEN_URL}?room=${encodeURIComponent(room)}&identity=${encodeURIComponent(identity)}`;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = await res.json();
  return { token: data.token, url: data.url ?? LIVEKIT_URL };
}

export function createRoom(): Room {
  return new Room({
    adaptiveStream: true,
    dynacast: true,
    // We only need audio; keep it light.
  });
}

export { RoomEvent, Track };
export type { Room, RemoteTrack, RemoteParticipant };
