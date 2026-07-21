import { createFileRoute } from "@tanstack/react-router";
import { PaymentCallback } from "@/components/tutor/PaymentCallback";

export const Route = createFileRoute("/payment/callback")({
  head: () => ({
    meta: [{ title: "Confirming payment — Lumen" }],
  }),
  component: PaymentCallback,
});
