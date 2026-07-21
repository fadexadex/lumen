import type { CanvasControllerHandle, View, WPoint } from "./canvas-agent-bridge";

export type WRect = { x: number; y: number; w: number; h: number };
export type { WPoint };

/** Re-centers a world rect in the viewport by animating `view` (zoom-around-point math). */
export function panToRect(ctrl: CanvasControllerHandle, rect: WRect, pad = 120) {
  const el = ctrl.viewportEl();
  if (!el) return;
  const availW = el.clientWidth - pad * 2;
  const availH = el.clientHeight - pad * 2;
  const targetScale = Math.max(0.4, Math.min(1.6, Math.min(availW / rect.w, availH / rect.h)));
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const nx = el.clientWidth / 2 - cx * targetScale;
  const ny = el.clientHeight / 2 - cy * targetScale;
  animateView(ctrl, { x: nx, y: ny, scale: targetScale }, 620);
}

function animateView(ctrl: CanvasControllerHandle, to: View, ms: number) {
  const from = ctrl.getView();
  const t0 = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    const k = ease(t);
    ctrl.setView({
      x: from.x + (to.x - from.x) * k,
      y: from.y + (to.y - from.y) * k,
      scale: from.scale + (to.scale - from.scale) * k,
    });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
