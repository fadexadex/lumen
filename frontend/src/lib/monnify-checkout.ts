import { STARTER_PACK } from "./payments";

const SCRIPT_ID = "monnify-checkout-sdk";
const SCRIPT_SRC = "https://sdk.monnify.com/plugin/monnify.js";

export type MonnifyCompleteResponse = {
  paymentStatus?: string;
  paymentReference?: string;
  transactionReference?: string;
  amountPaid?: number;
  completed?: boolean;
  [key: string]: unknown;
};

type MonnifySdk = {
  initialize: (opts: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    MonnifySDK?: MonnifySdk;
  }
}

export function loadMonnifySdk(): Promise<MonnifySdk> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Monnify SDK requires a browser"));
  }
  if (window.MonnifySDK) return Promise.resolve(window.MonnifySDK);

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => {
        if (window.MonnifySDK) resolve(window.MonnifySDK);
        else reject(new Error("Monnify SDK failed to load"));
      });
      existing.addEventListener("error", () => reject(new Error("Monnify SDK failed to load")));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.MonnifySDK) resolve(window.MonnifySDK);
      else reject(new Error("Monnify SDK loaded without MonnifySDK global"));
    };
    script.onerror = () => reject(new Error("Could not load Monnify checkout script"));
    document.head.appendChild(script);
  });
}

export function makePaymentReference() {
  return `lumen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type CheckoutPublicConfig = {
  apiKey: string;
  contractCode: string;
  amount: number;
  credits: number;
  currencyCode: string;
};

/**
 * Monnify's client SDK validates redirectUrl with a regex that requires a dotted
 * hostname (e.g. example.com or 127.0.0.1). Plain `localhost` fails with
 * "Monnify: Invalid redirectUrl". redirectUrl is optional for the Checkout SDK
 * (we rely on onComplete / Unlock), so skip unsafe local URLs.
 */
export function monnifySafeRedirectUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost") return undefined;
    // Mirror Monnify plugin regex: hostname must contain a "."
    if (!parsed.hostname.includes(".")) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

/** Opens Monnify's in-page checkout modal. Resolves when the modal closes or payment completes. */
export function openMonnifyCheckout(input: {
  config: CheckoutPublicConfig;
  customerName: string;
  customerEmail: string;
  paymentReference: string;
  /** Optional; omitted when Monnify would reject it (e.g. http://localhost/...). */
  redirectUrl?: string;
}): Promise<MonnifyCompleteResponse | null> {
  return loadMonnifySdk().then(
    (sdk) =>
      new Promise((resolve) => {
        let settled = false;
        let cleanup = () => {};
        const finish = (value: MonnifyCompleteResponse | null) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        };

        // Some Monnify sandbox builds throw while tearing down an iframe that
        // has already been removed. In those builds onClose is never reached,
        // so without this guard the checkout promise — and the paywall button —
        // remain pending forever. Treat that SDK-specific teardown error as a
        // close; the separately persisted reference still allows verification.
        const onSdkError = (event: ErrorEvent) => {
          const error = event.error;
          const isMonnifyScript = event.filename.includes("monnify");
          const isDuplicateRemoval =
            error instanceof DOMException &&
            error.name === "NotFoundError" &&
            error.message.includes("removeChild");
          if (!isMonnifyScript || !isDuplicateRemoval) return;
          event.preventDefault();
          finish(null);
        };
        window.addEventListener("error", onSdkError);
        const timeout = window.setTimeout(() => finish(null), 120_000);
        cleanup = () => {
          window.removeEventListener("error", onSdkError);
          window.clearTimeout(timeout);
        };

        const redirectUrl = monnifySafeRedirectUrl(input.redirectUrl);

        sdk.initialize({
          amount: input.config.amount || STARTER_PACK.amountNaira,
          currency: input.config.currencyCode || "NGN",
          reference: input.paymentReference,
          customerFullName: input.customerName,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          apiKey: input.config.apiKey,
          contractCode: input.config.contractCode,
          paymentDescription: `Lumen starter pack — ${input.config.credits} credits`,
          ...(redirectUrl ? { redirectUrl } : {}),
          metadata: {
            product: "lumen-starter",
            credits: String(input.config.credits),
          },
          onComplete: (response: MonnifyCompleteResponse) => {
            finish(response ?? {});
          },
          onClose: (data?: MonnifyCompleteResponse) => {
            // Some sandbox builds only report success on close after OTP.
            const status = String(data?.paymentStatus || "").toUpperCase();
            if (data && (status === "PAID" || status === "OVERPAID" || data.completed)) {
              finish(data);
              return;
            }
            finish(null);
          },
        });
      }),
  );
}
