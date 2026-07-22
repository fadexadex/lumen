import { createFileRoute } from "@tanstack/react-router";
import {
  monnifyConfigured,
  subscriptionAmount,
  subscriptionCredits,
} from "@/server/monnify";

export const Route = createFileRoute("/api/payments/config")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          amount: subscriptionAmount(),
          credits: subscriptionCredits(),
          currencyCode: "NGN",
          configured: monnifyConfigured(),
          // Public by design for Monnify Checkout SDK.
          apiKey: process.env.MONNIFY_API_KEY || null,
          contractCode: process.env.MONNIFY_CONTRACT_CODE || null,
        });
      },
    },
  },
});
