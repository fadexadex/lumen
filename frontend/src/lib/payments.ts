/**
 * Payment API — same-origin TanStack Start routes under /api/payments/*.
 * Optional VITE_LUMEN_PAYMENT_URL overrides the base (empty = same origin).
 */
const ENV_PAYMENT_URL = (
  (import.meta.env.VITE_LUMEN_PAYMENT_URL as string | undefined) ?? ""
).replace(/\/$/, "");

export const STARTER_PACK = {
  amountNaira: 2000,
  credits: 100,
  label: "Starter pack",
} as const;

export type PaymentInitResult = {
  paymentReference: string;
  transactionReference: string;
  checkoutUrl: string;
  amount: number;
  credits: number;
  currencyCode: string;
};

export type PaymentVerifyResult = {
  paid: boolean;
  paymentStatus: string;
  amountPaid: number;
  expectedAmount: number;
  credits: number;
  paymentReference?: string;
  transactionReference?: string;
  error?: string;
};

export type CheckoutPublicConfig = {
  apiKey: string;
  contractCode: string;
  amount: number;
  credits: number;
  currencyCode: string;
  configured: boolean;
};

function paymentUrl(path: string) {
  // path is like /api/payments/config
  return `${ENV_PAYMENT_URL}${path}`;
}

function friendlyFetchError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed|err_connection/i.test(msg)) {
    return "Payment API isn't reachable. Is the frontend/dev server running?";
  }
  return msg;
}

async function paymentFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(paymentUrl(path), init);
  } catch (err) {
    throw new Error(friendlyFetchError(err));
  }
}

export async function fetchCheckoutConfig(): Promise<CheckoutPublicConfig> {
  const res = await paymentFetch("/api/payments/config");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Config failed (${res.status})`);
  }
  const body = data as Partial<CheckoutPublicConfig>;
  if (!body.apiKey || !body.contractCode) {
    throw new Error("Monnify checkout is not configured (check MONNIFY_* in frontend/.env).");
  }
  return {
    apiKey: body.apiKey,
    contractCode: body.contractCode,
    amount: Number(body.amount ?? STARTER_PACK.amountNaira),
    credits: Number(body.credits ?? STARTER_PACK.credits),
    currencyCode: body.currencyCode || "NGN",
    configured: Boolean(body.configured),
  };
}

export async function initSubscriptionPayment(input: {
  customerName: string;
  customerEmail: string;
  redirectUrl: string;
}): Promise<PaymentInitResult> {
  const res = await paymentFetch("/api/payments/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Payment init failed (${res.status})`);
  }
  return data as PaymentInitResult;
}

export async function verifySubscriptionPayment(opts: {
  paymentReference?: string | null;
  transactionReference?: string | null;
}): Promise<PaymentVerifyResult> {
  const q = new URLSearchParams();
  if (opts.paymentReference) q.set("paymentReference", opts.paymentReference);
  if (opts.transactionReference) q.set("transactionReference", opts.transactionReference);

  let res: Response;
  try {
    res = await paymentFetch(`/api/payments/verify?${q}`);
  } catch (err) {
    return {
      paid: false,
      paymentStatus: "UNKNOWN",
      amountPaid: 0,
      expectedAmount: STARTER_PACK.amountNaira,
      credits: 0,
      error: friendlyFetchError(err),
    };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      paid: false,
      paymentStatus: "UNKNOWN",
      amountPaid: 0,
      expectedAmount: STARTER_PACK.amountNaira,
      credits: 0,
      error: (data as { error?: string }).error || `Verify failed (${res.status})`,
    };
  }
  return data as PaymentVerifyResult;
}

export function formatNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}
