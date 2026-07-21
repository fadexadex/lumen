import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LumenOverlay } from "./LumenOverlay";

describe("Lumen transcript panel", () => {
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    host?.remove();
    host = null;
  });

  it("reopens with the same transcript without ending the session", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const stop = vi.fn();
    const session = {
      status: "listening",
      turns: [
        { id: "you-1", from: "you", text: "Why does it open upward?", final: true },
        { id: "tutor-1", from: "tutor", text: "Because a is positive.", final: true },
      ],
      amplitude: 0,
      error: null,
      stop,
      setMuted: vi.fn(),
    };

    await act(async () => root.render(<LumenOverlay session={session as never} />));
    expect(host.textContent).toContain("Because a is positive.");

    const close = host.querySelector<HTMLButtonElement>('[aria-label="Close transcript"]');
    await act(async () => close?.click());
    expect(host.textContent).not.toContain("Because a is positive.");
    expect(stop).not.toHaveBeenCalled();

    const reopen = host.querySelector<HTMLButtonElement>('[aria-label="Open transcript"]');
    await act(async () => reopen?.click());
    expect(host.textContent).toContain("Because a is positive.");
    expect(stop).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});
