import { createFileRoute } from "@tanstack/react-router";
import { courses } from "@/server/course/store";

/** Reconnect / poll: current course snapshot for the given id. */
export const Route = createFileRoute("/api/course/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const course = courses.get(params.id);
        if (!course) return Response.json({ error: "course not found" }, { status: 404 });
        return Response.json(course);
      },
    },
  },
});
