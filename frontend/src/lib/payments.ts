/** Prefer VITE_LUMEN_PAYMENT_URL; fall back to local token-server. */
const ENV_PAYMENT_URL = (
  (import.meta.env.VITE_LUMEN_PAYMENT_URL as string | undefined) ?? ""
).replace(/\/$/, "");
const FALLBACK_PAYMENT_URL = "http://127.0.0.1:8787";

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

function apiBases() {
  const bases = [ENV_PAYMENT_URL, FALLBACK_PAYMENT_URL].filter(
    (b, i, arr) => b !== undefined && b !== null && arr.indexOf(b) === i,
  );
  // Same-origin proxy first when env is empty string
  if (!ENV_PAYMENT_URL) return ["", FALLBACK_PAYMENT_URL];
  return bases.length ? bases : [FALLBACK_PAYMENT_URL];
}

function paymentUrls(path: string) {
  return apiBases().map((base) => `${base}${path}`);
}

function friendlyFetchError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed|err_connection/i.test(msg)) {
    return "Payment server isn't reachable. In another terminal run: cd token-server && npm start";
  }
  return msg;
}

async function paymentFetch(path: string, init?: RequestInit): Promise<Response> {
  let lastErr: unknown = null;
  for (const url of paymentUrls(path)) {
    try {
      const res = await fetch(url, init);
      // Proxy returns HTML 502 when token-server is down — try the next base.
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        lastErr = new Error(`Upstream ${res.status} from ${url || "same-origin"}`);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(friendlyFetchError(lastErr));
}

export async function fetchCheckoutConfig(): Promise<CheckoutPublicConfig> {
  let res: Response;
  try {
    res = await paymentFetch("/payments/config");
  } catch (err) {
    throw new Error(friendlyFetchError(err));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Config failed (${res.status})`);
  }
  const body = data as Partial<CheckoutPublicConfig>;
  if (!body.apiKey || !body.contractCode) {
    throw new Error("Monnify checkout is not configured on the payment server.");
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
  let res: Response;
  try {
    res = await paymentFetch("/payments/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err) {
    throw new Error(friendlyFetchError(err));
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Payment init failed (${res.status})`,
    );
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
    res = await paymentFetch(`/payments/verify?${q}`);
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
