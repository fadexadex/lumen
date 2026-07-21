/** Lets MathCanvas notify Live when the parabola (or similar live params) change. */

type Para = { a: number; b: number; c: number };
type Listener = (p: Para) => void;

let listener: Listener | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Para | null = null;

export function onLiveParabolaChange(fn: Listener | null) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Debounced so dragging a slider doesn't flood the agent data channel. */
export function emitLiveParabola(p: Para) {
  pending = p;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (pending && listener) listener(pending);
    pending = null;
  }, 250);
}
