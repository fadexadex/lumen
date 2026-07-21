
# Whiteboard AI Math Tutor — v1

A pure-white digital whiteboard where a scripted "AI tutor" writes math lessons onto the board line-by-line, while the student annotates freely on the same surface. First playable lesson: **Quadratic Equations**, with a live parabola the student can manipulate via a/b/c sliders.

## Screens & Flow

```
/                    Topic picker (4 cards)
/board/$topic        Whiteboard for the chosen topic
```

1. **Topic picker (`/`)** — Minimal white page, small heading "Pick a topic to learn". Four cards:
   - Quadratic Equations (fully authored)
   - Linear Equations (stub script)
   - Pythagoras' Theorem (stub script)
   - Basic Trigonometry (stub script)
2. **Whiteboard (`/board/$topic`)** — Full-screen white canvas with a floating tool dock and a lesson control bar.

## Whiteboard surface

Pure white background everywhere. Three stacked layers, same coordinate space:

```text
┌─────────────────────────────────────────────┐
│  Lesson layer (SVG)   ← AI-written text     │
│  Diagram layer (SVG)  ← parabola + sliders  │
│  Ink layer (canvas)   ← student annotations │
└─────────────────────────────────────────────┘
```

- Lesson layer renders scripted "steps" (headings, equations, worked lines). Each step animates in as if being hand-written: characters reveal left-to-right with a subtle cursor, ~25ms/char, staggered per line.
- Diagram layer renders the parabola plot + slider controls as a self-contained widget the script can drop onto the board at a given step.
- Ink layer is a `<canvas>` that captures pointer input for pen/highlighter/eraser and click-to-place text notes. Annotations sit on top and are not cleared when new lesson steps appear.

## Lesson playback

Each lesson is a plain TS array of steps:

```ts
type Step =
  | { kind: "text"; content: string; x: number; y: number; size?: "h1"|"h2"|"body" }
  | { kind: "equation"; latex: string; x: number; y: number }
  | { kind: "diagram"; widget: "parabola"; x: number; y: number; w: number; h: number }
  | { kind: "pause"; ms: number };
```

Control bar (bottom center): ⏮ Restart · ⏯ Play/Pause · ⏭ Next step · progress dots. Steps auto-advance with a short pause between; Next skips the current typewriter to done.

Quadratic script (authored): title → standard form `ax² + bx + c = 0` → what a/b/c mean → discriminant → quadratic formula → worked example `x² − 5x + 6 = 0` factoring to `(x−2)(x−3)` → drop parabola widget → prompt "try changing a, b, c".

Other three topics: 3–4 step stubs each so the flow works end-to-end.

## Tools (floating left dock)

Icons only, tooltips on hover:
- Pen (black, thin)
- Highlighter (translucent yellow, thick)
- Eraser (removes ink strokes it intersects)
- Text note (click to place a caret, type, Esc/click-away commits)
- Clear annotations (with confirm)

State machine: one active tool at a time. Pointer events on the ink canvas dispatch to the active tool. Strokes stored as arrays of points so eraser can hit-test and Clear can wipe in one call. Text notes stored as `{x,y,text}` and rendered in an absolutely-positioned overlay above the canvas.

## Parabola widget

Rendered inside the diagram layer at the position the script specifies.

- SVG axes (−10..10 on both), gridlines, plotted curve `y = ax² + bx + c` sampled at ~200 points.
- Highlighted markers: vertex `(-b/2a, c - b²/4a)`, real roots when discriminant ≥ 0.
- Three sliders below the plot: **a** (−3..3, step 0.1, default 1), **b** (−10..10, step 0.5, default −5), **c** (−10..10, step 0.5, default 6). Live updates.
- Small readout: current equation and discriminant sign.

The widget is interactive; it does not block pen input outside its bounding box. Inside its bounds, pointer events go to the widget (not the ink canvas).

## Visual language

- Background `#ffffff` everywhere. No cards, no shadows, no gradients on the board itself.
- Lesson text in a hand-feeling font (Caveat or Kalam via `<link>` in `__root.tsx`) at ~28–36px for body, ~48px for headings, in near-black `#111`.
- Diagrams in thin black strokes; parabola curve in a single accent color (deep indigo) so it reads against annotations.
- Topic picker is also pure white with quiet type; each topic card is a bordered rectangle, no fills.

## Out of scope (v1)

- No real AI calls, no backend, no persistence — reloading the board resets ink and lesson progress.
- No multi-user, no export, no undo/redo (Clear only).
- Shapes tool, LaTeX rendering engine beyond simple sup/sub, and stroke smoothing beyond basic quadratic curves are deferred.

## Technical notes

- Routes: `src/routes/index.tsx` (picker, replaces placeholder), `src/routes/board.$topic.tsx` (whiteboard). Each route sets its own `head()` title/description; no og:image.
- Lesson data: `src/lessons/quadratic.ts`, `linear.ts`, `pythagoras.ts`, `trigonometry.ts`, plus `src/lessons/index.ts` registry keyed by topic slug. Unknown slug → `notFound()`.
- Components: `Whiteboard` (layout + layer composition), `LessonLayer` (renders + animates steps via a small stepper hook `useLessonPlayer`), `InkCanvas` (pen/highlighter/eraser using `getContext('2d')` with pointer events, pointer capture, and touch-action: none), `TextNotesOverlay`, `Toolbar`, `LessonControls`, `ParabolaWidget`.
- Simple equation rendering: render as styled text with `sup`/`sub` spans (e.g. `x²`, subscripts). No KaTeX/MathJax dependency in v1.
- Fonts loaded via `<link>` in `src/routes/__root.tsx`; `--font-hand` token added in `src/styles.css` under `@theme`, used by lesson text only. No color tokens changed (board hard-codes white per requirement).
- Desktop-first layout; preview will be switched to desktop.
