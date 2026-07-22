import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "node:crypto";
import { runCourse } from "@/server/course/orchestrator";
import { courses } from "@/server/course/store";
import type { Course, CourseStreamEvent } from "@/lib/course-gen/types";
import type { LearnerProfile } from "@/lib/types";

export const Route = createFileRoute("/api/course/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env.MISTRAL_API_KEY) {
          return Response.json(
            { error: "MISTRAL_API_KEY missing from server env (frontend/.env)" },
            { status: 500 },
          );
        }

        let body: { profile?: LearnerProfile };
        try {
          body = (await request.json()) as { profile?: LearnerProfile };
        } catch {
          return Response.json({ error: "invalid json body" }, { status: 400 });
        }
        const profile = body.profile;
        if (!profile?.topic) {
          return Response.json({ error: "profile.topic is required" }, { status: 400 });
        }

        const course: Course = {
          id: `c_${randomUUID()}`,
          profile,
          topic: profile.topic,
          modules: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        courses.set(course.id, course);

        const encoder = new TextEncoder();
        let cancelled = false;
        request.signal?.addEventListener("abort", () => {
          cancelled = true;
        });

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: CourseStreamEvent) => {
              if (cancelled) return;
              try {
                controller.enqueue(
                  encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
                );
              } catch {
                cancelled = true; // controller closed
              }
            };
            try {
              await runCourse({ course, profile, send });
            } catch (err) {
              console.error("[api/course/start]", err);
              send({
                type: "module_status",
                id: "course",
                status: "failed",
                error: err instanceof Error ? err.message : String(err),
              });
              send({ type: "done" });
            } finally {
              if (!cancelled) controller.close();
            }
          },
          cancel() {
            cancelled = true;
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
            "x-accel-buffering": "no",
          },
        });
      },
    },
  },
});
