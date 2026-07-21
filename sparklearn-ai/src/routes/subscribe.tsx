import { createFileRoute } from "@tanstack/react-router";
import { Paywall } from "@/components/tutor/Paywall";

export const Route = createFileRoute("/subscribe")({
  head: () => ({
    meta: [
      { title: "Unlock Lumen — starter pack" },
      {
        name: "description",
        content: "Get 100 credits for ₦2,000 to unlock your learning path.",
      },
    ],
  }),
  component: Paywall,
});
