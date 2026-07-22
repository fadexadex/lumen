import { createFileRoute } from "@tanstack/react-router";
import { retryCourseModule } from "@/server/course/orchestrator";
import { courses } from "@/server/course/store";

export const Route = createFileRoute("/api/course/$id/modules/$moduleId/retry")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const course = courses.get(params.id);
        if (!course) return Response.json({ error: "course not found" }, { status: 404 });

        const module = course.modules.find((item) => item.id === params.moduleId);
        if (!module) return Response.json({ error: "module not found" }, { status: 404 });
        if (module.status === "generating") {
          return Response.json({ error: "module is already generating" }, { status: 409 });
        }

        try {
          const retried = await retryCourseModule(course, params.moduleId);
          return Response.json(retried, { status: retried.status === "ready" ? 200 : 422 });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});
