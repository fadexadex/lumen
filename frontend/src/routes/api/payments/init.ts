import { createFileRoute } from "@tanstack/react-router";
import {
  makePaymentReference,
  monnifyFetch,
  subscriptionAmount,
  subscriptionCredits,
} from "@/server/monnify";

export const Route = createFileRoute("/api/payments/init")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env.MONNIFY_CONTRACT_CODE) {
          return Response.json(
            {
              error:
                "MONNIFY_CONTRACT_CODE is missing. Add it to frontend/.env (Monnify → Developers → API Keys & Contracts).",
            },
            { status: 500 },
          );
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "invalid json body" }, { status: 400 });
        }

        const customerName = String(body.customerName || "").trim();
        const customerEmail = String(body.customerEmail || "").trim();
        const redirectUrl = String(body.redirectUrl || "").trim();
        if (!customerName || !customerEmail || !redirectUrl) {
          return Response.json(
            { error: "customerName, customerEmail, and redirectUrl are required" },
            { status: 400 },
          );
        }

        const amount = subscriptionAmount();
        const credits = subscriptionCredits();
        const paymentReference = makePaymentReference();

        try {
          const data = await monnifyFetch("/api/v1/merchant/transactions/init-transaction", {
            method: "POST",
            body: {
              amount,
              customerName,
              customerEmail,
              paymentReference,
              paymentDescription: `Lumen starter pack — ${credits} credits`,
              currencyCode: "NGN",
              contractCode: process.env.MONNIFY_CONTRACT_CODE,
              redirectUrl,
              paymentMethods: ["CARD", "ACCOUNT_TRANSFER"],
              metaData: {
                product: "lumen-starter",
                credits: String(credits),
                walletAccountNumber: process.env.MONNIFY_WALLET_ACCOUNT_NUMBER || "",
              },
            },
          });

          const checkoutUrl = data.responseBody?.checkoutUrl;
          if (!data.requestSuccessful || typeof checkoutUrl !== "string") {
            return Response.json(
              {
                error: data.responseMessage || "Failed to initialize Monnify payment",
                details: data,
              },
              { status: 502 },
            );
          }

          return Response.json({
            paymentReference: data.responseBody?.paymentReference ?? paymentReference,
            transactionReference: data.responseBody?.transactionReference,
            checkoutUrl,
            amount,
            credits,
            currencyCode: "NGN",
          });
        } catch (err) {
          console.error("[api/payments/init]", err);
          return Response.json(
            { error: err instanceof Error ? err.message : "payment init failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
