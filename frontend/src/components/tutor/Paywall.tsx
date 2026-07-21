import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTutorStore } from "@/lib/tutor-store";
import {
  fetchCheckoutConfig,
  formatNaira,
  STARTER_PACK,
  verifySubscriptionPayment,
} from "@/lib/payments";
import {
  makePaymentReference,
  openMonnifyCheckout,
  type MonnifyCompleteResponse,
} from "@/lib/monnify-checkout";

/** Local pending ref we send into MonnifySDK as `reference`. */
const PENDING_REF_KEY = "lumen.pendingPaymentRef";
/** Refs returned by Monnify onComplete — these are what Verify Transactions expects. */
const MONNIFY_REFS_KEY = "lumen.monnifyPaymentRefs";

type StoredMonnifyRefs = {
  paymentReference?: string;
  transactionReference?: string;
};

function emailFromName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${slug || "learner"}@lumen.learner`;
}

function readStoredMonnifyRefs(): StoredMonnifyRefs {
  try {
    const raw = sessionStorage.getItem(MONNIFY_REFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredMonnifyRefs;
  } catch {
    return {};
  }
}

function writeStoredMonnifyRefs(refs: StoredMonnifyRefs) {
  sessionStorage.setItem(MONNIFY_REFS_KEY, JSON.stringify(refs));
}

function refsFromComplete(response: MonnifyCompleteResponse | null): StoredMonnifyRefs {
  if (!response) return {};
  return {
    paymentReference: response.paymentReference || undefined,
    transactionReference: response.transactionReference || undefined,
  };
}

export function Paywall() {
  const navigate = useNavigate();
  const profile = useTutorStore((s) => s.profile);
  const subscription = useTutorStore((s) => s.subscription);
  const setSubscription = useTutorStore((s) => s.setSubscription);
  const ensureRoadmap = useTutorStore((s) => s.ensureRoadmap);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUnlock, setCanUnlock] = useState(false);
  const verifiedOnce = useRef(false);

  useEffect(() => {
    if (subscription?.status === "active") {
      ensureRoadmap();
      navigate({ to: "/roadmap" });
    }
  }, [subscription, ensureRoadmap, navigate]);

  useEffect(() => {
    if (!profile) navigate({ to: "/" });
  }, [profile, navigate]);

  useEffect(() => {
    if (profile && !email) setEmail(emailFromName(profile.name));
  }, [profile, email]);

  useEffect(() => {
    const stored = readStoredMonnifyRefs();
    const pending = sessionStorage.getItem(PENDING_REF_KEY);
    setCanUnlock(Boolean(stored.paymentReference || stored.transactionReference || pending));
  }, []);

  const unlockFromPayment = async (opts: {
    paymentReference?: string | null;
    transactionReference?: string | null;
  }) => {
    setVerifying(true);
    setError(null);
    try {
      // Per Monnify Quickstart Path A: verify with the paymentReference from onComplete
      // (https://developers.monnify.com/docs/collections/quickstart).
      const result = await verifySubscriptionPayment(opts);
      if (!result.paid) {
        const status = result.paymentStatus || "UNKNOWN";
        if (status === "NOT_FOUND" || status === "PENDING") {
          setError(
            status === "PENDING"
              ? "Payment is still pending on Monnify. Finish OTP/checkout, then tap Unlock access."
              : result.error ||
                  "Monnify has no transaction for that reference yet. Complete checkout, then unlock.",
          );
        } else {
          setError(
            result.error ||
              `Payment is ${status.toLowerCase()}. Finish checkout, then tap Unlock access.`,
          );
        }
        return false;
      }
      setSubscription({
        status: "active",
        credits: result.credits || STARTER_PACK.credits,
        paymentReference: result.paymentReference || opts.paymentReference || "",
        paidAt: new Date().toISOString(),
      });
      sessionStorage.removeItem(PENDING_REF_KEY);
      sessionStorage.removeItem(MONNIFY_REFS_KEY);
      setCanUnlock(false);
      ensureRoadmap();
      navigate({ to: "/roadmap" });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify payment");
      return false;
    } finally {
      setVerifying(false);
    }
  };

  // Hosted-checkout redirect fallback: /subscribe?paymentReference=...
  useEffect(() => {
    if (!profile || subscription?.status === "active" || verifiedOnce.current) return;

    const params = new URLSearchParams(window.location.search);
    const paymentReference =
      params.get("paymentReference") || params.get("paymentreference") || null;
    const transactionReference =
      params.get("transactionReference") || params.get("transactionreference") || null;

    if (!paymentReference && !transactionReference) return;

    verifiedOnce.current = true;
    writeStoredMonnifyRefs({
      paymentReference: paymentReference || undefined,
      transactionReference: transactionReference || undefined,
    });
    setCanUnlock(true);
    void unlockFromPayment({ paymentReference, transactionReference });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, subscription]);

  const startPayment = async () => {
    if (!profile || busy) return;
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email so Monnify can send your receipt.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Path A — Checkout SDK (https://developers.monnify.com/docs/collections/quickstart)
      const config = await fetchCheckoutConfig();
      const paymentReference = makePaymentReference();
      sessionStorage.setItem(PENDING_REF_KEY, paymentReference);
      setCanUnlock(true);

      const redirectUrl = `${window.location.origin}/payment/callback`;
      const response = await openMonnifyCheckout({
        config,
        customerName: profile.name,
        customerEmail: trimmed,
        paymentReference,
        redirectUrl,
      });

      const monnifyRefs = refsFromComplete(response);
      // Always prefer Monnify's returned refs for verify — not only our local pending ref.
      const verifyRefs: StoredMonnifyRefs = {
        paymentReference: monnifyRefs.paymentReference || paymentReference,
        transactionReference: monnifyRefs.transactionReference,
      };
      writeStoredMonnifyRefs(verifyRefs);

      const status = String(response?.paymentStatus || "").toUpperCase();
      if (response && (status === "PAID" || status === "OVERPAID" || response.completed)) {
        await unlockFromPayment(verifyRefs);
        return;
      }

      setError(
        "Checkout closed. If you already paid, tap Unlock access — we verify with Monnify using the payment reference from checkout.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment");
    } finally {
      setBusy(false);
    }
  };

  const unlockPending = async () => {
    const stored = readStoredMonnifyRefs();
    const pending = sessionStorage.getItem(PENDING_REF_KEY);
    const paymentReference = stored.paymentReference || pending;
    const transactionReference = stored.transactionReference;
    if (!paymentReference && !transactionReference) {
      setError("No pending payment found. Tap Pay & continue to start checkout.");
      return;
    }
    await unlockFromPayment({ paymentReference, transactionReference });
  };

  if (!profile || subscription?.status === "active") return null;

  return (
    <div className="tutor-app paywall-shell min-h-screen flex flex-col">
      <div className="paywall-glow" aria-hidden />
      <main className="paywall-stage">
        <div className="paywall-panel tutor-fade-in">
          <p className="paywall-eyebrow">Almost there, {profile.name}</p>
          <h1 className="tutor-serif paywall-title">Unlock your learning path</h1>
          <p className="paywall-lede">
            One starter pack gets you into Lumen. Credits are shown for clarity — we won&apos;t
            deduct them while you explore.
          </p>

          <div className="paywall-offer" aria-label="Starter pack">
            <div className="paywall-credits">
              <span className="paywall-credits-value">{STARTER_PACK.credits}</span>
              <span className="paywall-credits-label">credits</span>
            </div>
            <div className="paywall-divider" aria-hidden />
            <div className="paywall-price">
              <span className="paywall-price-value">{formatNaira(STARTER_PACK.amountNaira)}</span>
              <span className="paywall-price-note">one-time · sandbox test payment</span>
            </div>
          </div>

          <label className="paywall-field">
            <span>Email for receipt</span>
            <input
              className="tutor-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy || verifying}
            />
          </label>

          {error && (
            <p className="paywall-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            className="tutor-primary-btn paywall-cta"
            disabled={busy || verifying}
            onClick={() => void startPayment()}
          >
            {verifying ? "Confirming payment…" : busy ? "Opening Monnify…" : "Pay & continue"}
          </button>

          {canUnlock && (
            <button
              type="button"
              className="paywall-secondary"
              disabled={busy || verifying}
              onClick={() => void unlockPending()}
            >
              Unlock access
            </button>
          )}

          <p className="paywall-fine">
            Uses Monnify sandbox Checkout SDK. After payment we call Verify Transactions with your
            payment reference, then open your learning path.
          </p>
        </div>
      </main>
    </div>
  );
}
