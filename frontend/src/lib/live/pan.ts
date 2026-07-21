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

/** Keep a growing block readable without changing zoom or needlessly re-centering it. */
export function keepRectInView(ctrl: CanvasControllerHandle, rect: WRect, pad = 64) {
  const el = ctrl.viewportEl();
  if (!el) return;
  const from = ctrl.getView();
  const left = rect.x * from.scale + from.x;
  const top = rect.y * from.scale + from.y;
  const right = (rect.x + rect.w) * from.scale + from.x;
  const bottom = (rect.y + rect.h) * from.scale + from.y;
  const availW = Math.max(0, el.clientWidth - pad * 2);
  const availH = Math.max(0, el.clientHeight - pad * 2);
  const blockW = right - left;
  const blockH = bottom - top;

  let dx = 0;
  let dy = 0;
  if (blockW > availW) dx = pad - left;
  else if (left < pad) dx = pad - left;
  else if (right > el.clientWidth - pad) dx = el.clientWidth - pad - right;
  if (blockH > availH) dy = pad - top;
  else if (top < pad) dy = pad - top;
  else if (bottom > el.clientHeight - pad) dy = el.clientHeight - pad - bottom;

  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  animateView(ctrl, { x: from.x + dx, y: from.y + dy, scale: from.scale }, 360);
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
