import { createFileRoute } from "@tanstack/react-router";
import { mintLiveKitToken } from "@/server/livekit-token";

export const Route = createFileRoute("/api/lumen-token")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const room = url.searchParams.get("room");
        const identity = url.searchParams.get("identity");
        const name = url.searchParams.get("name") ?? "Learner";
        if (!room || !identity) {
          return Response.json({ error: "room and identity required" }, { status: 400 });
        }
        try {
          const body = await mintLiveKitToken({ room, identity, name });
          return Response.json(body);
        } catch (err) {
          console.error("[api/lumen-token]", err);
          return Response.json(
            { error: err instanceof Error ? err.message : "token mint failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
