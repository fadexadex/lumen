import { createFileRoute } from "@tanstack/react-router";
import { monnifyFetch, subscriptionAmount, subscriptionCredits } from "@/server/monnify";

export const Route = createFileRoute("/api/payments/verify")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const paymentReference = url.searchParams.get("paymentReference");
        const transactionReference = url.searchParams.get("transactionReference");

        if (!paymentReference && !transactionReference) {
          return Response.json(
            { error: "paymentReference or transactionReference required" },
            { status: 400 },
          );
        }

        const amount = subscriptionAmount();
        const credits = subscriptionCredits();

        const attempts: { kind: string; path: string }[] = [];
        if (transactionReference) {
          attempts.push({
            kind: "transactionReference",
            path: `/api/v2/transactions/${encodeURIComponent(transactionReference)}`,
          });
        }
        if (paymentReference) {
          attempts.push({
            kind: "paymentReference",
            path: `/api/v1/merchant/transactions/query?paymentReference=${encodeURIComponent(paymentReference)}`,
          });
        }

        try {
          let data: Awaited<ReturnType<typeof monnifyFetch>> | null = null;
          let lastMessage = "Transaction not found";
          for (const attempt of attempts) {
            data = await monnifyFetch(attempt.path);
            if (data.requestSuccessful && data.responseBody) break;
            lastMessage = data.responseMessage || lastMessage;
            data = null;
          }

          if (!data?.responseBody) {
            return Response.json({
              paid: false,
              paymentStatus: "NOT_FOUND",
              amountPaid: 0,
              expectedAmount: amount,
              credits: 0,
              paymentReference: paymentReference || undefined,
              transactionReference: transactionReference || undefined,
              error: lastMessage,
            });
          }

          const body = data.responseBody;
          const status = String(body.paymentStatus || "").toUpperCase();
          const amountPaid = Number(body.amountPaid ?? body.amount ?? 0);
          const paid =
            (status === "PAID" || status === "OVERPAID") && amountPaid >= amount;

          return Response.json({
            paid,
            paymentStatus: status,
            amountPaid,
            expectedAmount: amount,
            credits: paid ? credits : 0,
            paymentReference: (body.paymentReference as string) || paymentReference || undefined,
            transactionReference:
              (body.transactionReference as string) || transactionReference || undefined,
          });
        } catch (err) {
          console.error("[api/payments/verify]", err);
          return Response.json(
            { error: err instanceof Error ? err.message : "verify failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
