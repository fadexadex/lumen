import { createFileRoute } from "@tanstack/react-router";
import { Onboarding } from "@/components/tutor/Onboarding";

export const Route = createFileRoute("/")({
  component: Onboarding,
});