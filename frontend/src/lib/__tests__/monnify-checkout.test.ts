import { afterEach, describe, expect, it, vi } from "vitest";
import { openMonnifyCheckout } from "../monnify-checkout";

describe("Monnify checkout", () => {
  afterEach(() => {
    delete window.MonnifySDK;
    vi.useRealTimers();
  });

  it("settles when the SDK throws while removing its modal", async () => {
    window.MonnifySDK = {
      initialize: vi.fn(),
    };

    const checkout = openMonnifyCheckout({
      config: {
        apiKey: "test-key",
        contractCode: "test-contract",
        amount: 2_000,
        credits: 100,
        currencyCode: "NGN",
      },
      customerName: "Learner",
      customerEmail: "learner@example.com",
      paymentReference: "lumen-test",
    });
    await Promise.resolve();

    window.dispatchEvent(
      new ErrorEvent("error", {
        error: new DOMException(
          "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
          "NotFoundError",
        ),
        filename: "https://sdk.monnify.com/plugin/monnify.js",
      }),
    );

    const result = await Promise.race([
      checkout,
      new Promise<"timed-out">((resolve) => setTimeout(() => resolve("timed-out"), 30)),
    ]);
    expect(result).toBeNull();
  });
});
