# 07 · Overlay UI & Animations (and killing `LiveDrawer`)

The presence layer: an amplitude-reactive **orb**, a **minimal top-right transcript**, and a
**mic/end control** — all as a _non-blocking_ fixed overlay. This replaces the fullscreen
`LiveDrawer` so the learner never leaves the board.

Design language: reuse the existing tokens (`--tutor-*`), the `.live-orb` core, and the
`rb-glass` transcript feel. Flat, calm, no takeover.

---

## 1. Component tree

```
<LumenOverlay session={lumen}>       position:fixed, inset:0, pointer-events:none
  <LumenOrb .../>                    bottom-left, pointer-events:auto (draggable optional)
  <LumenTranscript .../>            top-right, pointer-events:auto, minimal
  <LumenControls .../>              near orb: mic toggle, end, status text
  <LumenErrorToast .../>           only on error
</LumenOverlay>
```

Everything inside is `pointer-events:none` by default; only the actual controls opt back in with
`pointer-events:auto`. This is the mechanical guarantee that the board keeps all gestures.

---

## 2. `components/live/LumenOrb.tsx` — amplitude-reactive

The orb scales/glows off the live amplitude (0..1) from `TutorSession`. Uses a CSS var so we
never re-render React on every audio frame.

```tsx
import { useEffect, useRef } from "react";
import type { SessionStatus } from "@/lib/live/tutor-session";

export function LumenOrb({ amplitude, status }: { amplitude: number; status: SessionStatus }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // smooth the level a touch so the orb doesn't jitter
    const target = amplitude;
    let raf = 0;
    let cur = parseFloat(el.style.getPropertyValue("--amp") || "0");
    const tick = () => {
      cur += (target - cur) * 0.25;
      el.style.setProperty("--amp", cur.toFixed(3));
      if (Math.abs(target - cur) > 0.005) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [amplitude]);

  return (
    <div
      ref={ref}
      className={`lumen-orb lumen-orb--${status}`}
      data-speaking={status === "speaking" || undefined}
      aria-hidden
    >
      <span className="lumen-orb-glow" />
      <span className="lumen-orb-ring" />
      <span className="lumen-orb-ring lumen-orb-ring--slow" />
      <span className="lumen-orb-core" />
    </div>
  );
}
```

### Orb CSS (`lib/live/live.css`)

```css
.lumen-orb {
  --amp: 0;
  position: relative;
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  pointer-events: auto;
  cursor: default;
  filter: saturate(1.05);
}
.lumen-orb-core {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: radial-gradient(circle at 32% 30%, oklch(0.98 0.05 80), var(--tutor-accent) 72%);
  box-shadow:
    0 10px 30px oklch(0.78 0.13 70 / 0.35),
    inset 0 -8px 20px oklch(0 0 0 / 0.08);
  /* amplitude → scale (1.0..1.28) */
  transform: scale(calc(1 + var(--amp) * 0.28));
  transition: transform 60ms linear;
}
.lumen-orb-glow {
  position: absolute;
  inset: -8px;
  border-radius: 999px;
  background: radial-gradient(
    circle,
    oklch(0.85 0.14 80 / calc(0.25 + var(--amp) * 0.5)),
    transparent 70%
  );
  opacity: calc(0.4 + var(--amp) * 0.6);
  transition: opacity 80ms linear;
}
.lumen-orb-ring {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  border: 1px solid oklch(0.78 0.13 70 / 0.35);
  animation: lumen-ring 2.6s var(--ease-tutor) infinite;
}
.lumen-orb-ring--slow {
  animation-duration: 4s;
  animation-delay: 0.4s;
}
@keyframes lumen-ring {
  0% {
    transform: scale(0.7);
    opacity: 0.7;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

/* status tints */
.lumen-orb--connecting .lumen-orb-core {
  animation: lumen-breathe 1.6s var(--ease-tutor) infinite;
  filter: grayscale(0.4);
}
.lumen-orb--listening .lumen-orb-core {
  filter: none;
}
.lumen-orb--thinking .lumen-orb-glow {
  animation: lumen-shimmer 1.2s linear infinite;
}
.lumen-orb--error .lumen-orb-core {
  background: oklch(0.6 0.02 20);
  box-shadow: none;
}
@keyframes lumen-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}
@keyframes lumen-shimmer {
  0% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.9;
  }
  100% {
    opacity: 0.4;
  }
}
```

---

## 3. `components/live/LumenTranscript.tsx` — minimal top-right

Shows the last few turns, auto-fades old ones, streams partials. Not a chat — a whisper.

```tsx
import { useEffect, useRef } from "react";
import type { TranscriptTurn } from "@/lib/live/tutor-session";

export function LumenTranscript({
  turns,
  thinking,
}: {
  turns: TranscriptTurn[];
  thinking: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: 1e6, behavior: "smooth" });
  }, [turns, thinking]);
  const recent = turns.slice(-4);
  return (
    <div className="lumen-transcript" ref={ref} role="log" aria-live="polite">
      {recent.map((t) => (
        <div
          key={t.id}
          className={`lumen-line lumen-line--${t.from}`}
          data-partial={!t.final || undefined}
        >
          <span className="lumen-line-role">{t.from === "tutor" ? "Lumen" : "You"}</span>
          <p className="lumen-line-text">{t.text}</p>
        </div>
      ))}
      {thinking && (
        <div className="lumen-line lumen-line--tutor">
          <span className="lumen-typing">
            <span />
            <span />
            <span />
          </span>
        </div>
      )}
    </div>
  );
}
```

### Transcript CSS

```css
.lumen-transcript {
  position: fixed;
  top: 76px;
  right: 20px;
  z-index: 62;
  width: min(340px, 42vw);
  max-height: 46vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem;
  pointer-events: auto;
  background: oklch(1 0 0 / 0.72);
  backdrop-filter: blur(14px) saturate(1.1);
  border: 1px solid var(--tutor-line);
  border-radius: 16px;
  box-shadow: 0 12px 40px oklch(0 0 0 / 0.08);
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black 24px,
    black calc(100% - 8px),
    transparent 100%
  );
}
.lumen-line {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  animation: lumen-line-in 260ms var(--ease-tutor) both;
}
.lumen-line-role {
  font-size: 0.62rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--tutor-muted);
}
.lumen-line-text {
  font-family: var(--font-serif);
  font-size: 0.98rem;
  line-height: 1.35;
  color: var(--tutor-ink);
  margin: 0;
}
.lumen-line--you .lumen-line-text {
  color: var(--tutor-muted);
  font-style: italic;
}
.lumen-line[data-partial] .lumen-line-text {
  opacity: 0.72;
}
@keyframes lumen-line-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.lumen-typing {
  display: inline-flex;
  gap: 5px;
}
.lumen-typing span {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--tutor-accent);
  animation: lumen-bounce 1s var(--ease-tutor) infinite;
}
.lumen-typing span:nth-child(2) {
  animation-delay: 0.15s;
}
.lumen-typing span:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes lumen-bounce {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  50% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

@media (max-width: 640px) {
  .lumen-transcript {
    top: auto;
    bottom: 120px;
    right: 12px;
    left: 12px;
    width: auto;
    max-height: 30vh;
  }
}
```

---

## 4. `components/live/LumenControls.tsx` + `LumenOverlay.tsx`

```tsx
// LumenControls.tsx
export function LumenControls({
  status,
  muted,
  onToggleMute,
  onEnd,
}: {
  status: string;
  muted: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
}) {
  const label =
    status === "connecting"
      ? "Connecting…"
      : status === "speaking"
        ? "Lumen is talking"
        : status === "thinking"
          ? "Lumen is drawing…"
          : status === "listening"
            ? "Listening"
            : "";
  return (
    <div className="lumen-controls" data-no-pan>
      <button
        className="lumen-btn"
        data-active={!muted}
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🎙️"}
      </button>
      <span className="lumen-status">{label}</span>
      <button className="lumen-btn lumen-btn--end" onClick={onEnd} aria-label="End session">
        ✕
      </button>
    </div>
  );
}
```

```tsx
// LumenOverlay.tsx
import { useState } from "react";
import { LumenOrb } from "./LumenOrb";
import { LumenTranscript } from "./LumenTranscript";
import { LumenControls } from "./LumenControls";
import type { useLumenSession } from "@/lib/live/use-lumen-session";
import "@/lib/live/live.css";

export function LumenOverlay({ session }: { session: ReturnType<typeof useLumenSession> }) {
  const { status, turns, amplitude, error, stop, setMuted } = session;
  const [muted, setMutedState] = useState(false);
  if (status === "idle") return null;
  return (
    <div className="lumen-overlay">
      <LumenTranscript turns={turns} thinking={status === "thinking"} />
      <div className="lumen-dock" data-no-pan>
        <LumenOrb amplitude={amplitude} status={status} />
        <LumenControls
          status={status}
          muted={muted}
          onToggleMute={() => {
            const m = !muted;
            setMutedState(m);
            setMuted(m);
          }}
          onEnd={stop}
        />
      </div>
      {error && (
        <div className="lumen-toast" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
```

### Overlay/dock CSS

```css
.lumen-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
}
.lumen-overlay > * {
  pointer-events: auto;
}
.lumen-dock {
  position: fixed;
  left: 20px;
  bottom: 20px;
  z-index: 62;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.6rem 0.4rem 0.4rem;
  background: oklch(1 0 0 / 0.7);
  backdrop-filter: blur(14px);
  border: 1px solid var(--tutor-line);
  border-radius: 999px;
  box-shadow: 0 12px 40px oklch(0 0 0 / 0.08);
  animation: lumen-dock-in 340ms var(--ease-tutor) both;
}
@keyframes lumen-dock-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.lumen-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.lumen-btn {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1px solid var(--tutor-line);
  background: white;
  font-size: 0.95rem;
}
.lumen-btn[data-active="true"] {
  background: var(--tutor-accent);
  color: white;
  border-color: transparent;
}
.lumen-btn--end {
  color: var(--tutor-muted);
}
.lumen-status {
  font-size: 0.8rem;
  color: var(--tutor-muted);
  min-width: 92px;
}
.lumen-toast {
  position: fixed;
  left: 50%;
  bottom: 90px;
  transform: translateX(-50%);
  background: oklch(0.98 0.02 20);
  color: oklch(0.4 0.12 20);
  border: 1px solid oklch(0.85 0.08 20);
  border-radius: 12px;
  padding: 0.5rem 0.9rem;
  font-size: 0.85rem;
  z-index: 64;
  animation: lumen-line-in 240ms var(--ease-tutor) both;
}
@media (max-width: 640px) {
  .lumen-dock {
    left: 12px;
    bottom: 12px;
  }
}
```

---

## 5. `LessonRoute.tsx` surgery — replace `LiveDrawer`

Precise edits to the existing file (see current lines in `10`).

**Remove:**

```tsx
import { LiveDrawer } from "./LiveDrawer";
// ...
const [liveOpen, setLiveOpen] = useState(false);
// ...
<LiveDrawer moduleId={moduleId} open={liveOpen} onClose={() => setLiveOpen(false)} />;
```

**Add:**

```tsx
import { useLumenSession } from "@/lib/live/use-lumen-session";
import { LumenOverlay } from "@/components/live/LumenOverlay";
import { buildBoardState } from "@/lib/live/board-context";  // 08

const lumen = useLumenSession();

// topbar Live button (existing .live-launch) → start the voice session, not open a modal:
<button className="live-launch" onClick={() => lumen.start(moduleId)} aria-label="Talk to Lumen live">
  <span className="live-launch-orb" aria-hidden />
  <span className="live-launch-label"><strong>Live</strong><em>Lumen listens</em></span>
</button>

// The concept still gets onOpenLive so in-board buttons work:
onOpenLive={() => lumen.start(moduleId)}

// Push board context whenever step changes (and on slider changes via a callback, see 08):
useEffect(() => {
  if (lumen.status !== "idle") lumen.sendBoardState(buildBoardState(script, safeIndex, moduleId));
}, [safeIndex, moduleId, lumen.status]);

// Mount overlay as a sibling (NOT inside the board):
<LumenOverlay session={lumen} />
```

Keep `data-live-open` off the shell (no more dimming/blur of the board). The board stays 100%
lit and interactive.

> Optional: delete `LiveDrawer.tsx` + its CSS (`.live-scene`, `.live-close`, etc. in
> `design.css`), or keep it behind a `?mock=1` flag for offline demos. `.live-orb` styles can
> stay (harmless) or be removed since we now use `.lumen-orb`.

---

## 6. Animation inventory (the "extreme" polish)

| Element                 | Animation              | Trigger            | Impl                       |
| ----------------------- | ---------------------- | ------------------ | -------------------------- |
| Orb core                | scale 1.0→1.28         | audio amplitude    | CSS `--amp` var, 60ms lerp |
| Orb glow                | opacity + spread       | amplitude          | CSS var                    |
| Orb rings               | expanding fade         | always (listening) | keyframes                  |
| Orb (connecting)        | breathe + desaturate   | status             | keyframes                  |
| Orb (thinking)          | glow shimmer           | tool in flight     | keyframes                  |
| Dock                    | rise + fade in         | session start      | keyframes                  |
| Transcript line         | rise + fade            | new turn           | keyframes                  |
| Partial text            | dimmed                 | streaming          | `[data-partial]`           |
| Circle/axis/arrow/curve | draw-on (dashoffset)   | annotation add     | WAAPI (`05`)               |
| Highlight box           | pop-scale              | annotation add     | keyframes (`05`)           |
| Label                   | fade-rise              | annotation add     | keyframes (`05`)           |
| Camera (panTo)          | easeOutCubic view lerp | `focus_on`         | rAF (`05`)                 |

All easings use the existing `--ease-tutor` for consistency with the rest of the app.

---

## 7. Accessibility & polish

- Transcript is `role="log" aria-live="polite"` so screen readers get Lumen's words.
- Orb is `aria-hidden` (decorative); status text in controls conveys state.
- Respect `prefers-reduced-motion`: gate draw-on + orb scale behind a media query, fall back to
  instant appearance + static orb.
- Mic-denied path: show a small text input in the dock that calls `session.sendText`.

Next: `08` makes Lumen actually _know_ what's on the board so its drawing is correct.
