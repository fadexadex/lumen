import { createFileRoute } from "@tanstack/react-router";
import { RoadmapView } from "@/components/tutor/RoadmapView";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: "Your learning path — Lumen" },
      {
        name: "description",
        content: "A calm, tailored path through the topic you want to learn.",
      },
      { property: "og:title", content: "Your learning path — Lumen" },
      {
        property: "og:description",
        content: "A calm, tailored path through the topic you want to learn.",
      },
    ],
  }),
  component: RoadmapView,
});
