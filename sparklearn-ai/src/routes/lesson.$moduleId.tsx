import { createFileRoute } from "@tanstack/react-router";
import { LessonRoute } from "@/components/whiteboard/LessonRoute";

export const Route = createFileRoute("/lesson/$moduleId")({
  head: () => ({
    meta: [
      { title: "Lesson — Lumen" },
      { name: "description", content: "Learn on a calm, interactive whiteboard." },
    ],
  }),
  component: LessonRoute,
});