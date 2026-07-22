import { AccessToken } from "livekit-server-sdk";

export async function mintLiveKitToken(opts: {
  room: string;
  identity: string;
  name?: string;
}): Promise<{ token: string; url: string | null }> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing from server env");
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name ?? "Learner",
    ttl: "15m",
  });
  at.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return {
    token: await at.toJwt(),
    url: process.env.LIVEKIT_URL ?? process.env.VITE_LIVEKIT_URL ?? null,
  };
}
