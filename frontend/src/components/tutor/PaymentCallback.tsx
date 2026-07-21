import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTutorStore } from "@/lib/tutor-store";
import { STARTER_PACK, verifySubscriptionPayment } from "@/lib/payments";

const PENDING_REF_KEY = "lumen.pendingPaymentRef";

/**
 * Monnify redirect landing page.
 * Hosted checkout / "Return to merchant" sends users here with paymentReference in the query.
 * We verify server-side, then send them into the product.
 */
export function PaymentCallback() {
  const navigate = useNavigate();
  const profile = useTutorStore((s) => s.profile);
  const subscription = useTutorStore((s) => s.subscription);
  const setSubscription = useTutorStore((s) => s.setSubscription);
  const ensureRoadmap = useTutorStore((s) => s.ensureRoadmap);
  const [message, setMessage] = useState("Confirming your payment…");
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (subscription?.status === "active") {
      ensureRoadmap();
      navigate({ to: "/roadmap" });
      return;
    }
    if (!profile) {
      navigate({ to: "/" });
      return;
    }
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const paymentReference =
      params.get("paymentReference") ||
      params.get("paymentreference") ||
      sessionStorage.getItem(PENDING_REF_KEY);
    const transactionReference =
      params.get("transactionReference") || params.get("transactionreference");

    if (!paymentReference && !transactionReference) {
      setFailed(true);
      setMessage("Missing payment reference. Go back and unlock from the paywall.");
      return;
    }

    void (async () => {
      const result = await verifySubscriptionPayment({
        paymentReference,
        transactionReference,
      });
      if (!result.paid) {
        setFailed(true);
        setMessage(
          result.error ||
            `Payment is ${result.paymentStatus.toLowerCase()}. Return to the paywall to retry or unlock.`,
        );
        return;
      }
      setSubscription({
        status: "active",
        credits: result.credits || STARTER_PACK.credits,
        paymentReference: result.paymentReference || paymentReference || "",
        paidAt: new Date().toISOString(),
      });
      sessionStorage.removeItem(PENDING_REF_KEY);
      ensureRoadmap();
      setMessage("Payment confirmed — opening your path…");
      navigate({ to: "/roadmap" });
    })();
  }, [profile, subscription, setSubscription, ensureRoadmap, navigate]);

  return (
    <div className="tutor-app paywall-shell min-h-screen flex flex-col items-center justify-center px-6">
      <div className="paywall-panel tutor-fade-in" style={{ textAlign: "center" }}>
        <p className="paywall-eyebrow">{failed ? "Almost there" : "Payment"}</p>
        <h1 className="tutor-serif paywall-title" style={{ fontSize: "2rem" }}>
          {failed ? "We couldn't confirm yet" : "Unlocking Lumen"}
        </h1>
        <p className="paywall-lede">{message}</p>
        {failed && (
          <button
            type="button"
            className="tutor-primary-btn paywall-cta"
            onClick={() => navigate({ to: "/subscribe" })}
          >
            Back to paywall
          </button>
        )}
      </div>
    </div>
  );
}
