
# AI Tutor — V1 Plan

Single-session experience (no accounts). No AI calls in v1 — everything runs on mock data. State lives in memory + sessionStorage. Calm, white, immersive aesthetic. Laptop-first with a floating math toolbar.

## Flow

```text
/  (onboarding)  →  /roadmap  →  /lesson/:moduleId  (whiteboard + mock "Live" help)
```

Onboarding is a full-screen, chat-style intake — one question at a time, big type, soft fade transitions. No sidebar, no chrome.

## 1. Onboarding — `/`

Conversational, one prompt per screen, Enter or big "Next" to advance. Progress is a thin top bar (not numbered steps — feels less like a form).

Questions collected into a `LearnerProfile`:
1. Name
2. Grade (chips: 1–12)
3. Class / subject context (free text, e.g. "Math — Algebra I")
4. What do you want to learn today? (free text, e.g. "quadratic equations")
5. How do you like to learn? (chips: Stories · Examples · Step-by-step · Challenge me)
6. Voice / music preference (Off · Soft background · Voice guidance) — stored only, not wired

End screen: "Building your roadmap for {name}…" shimmer (~2 s), then navigate to `/roadmap`.

Profile stored in `sessionStorage` under `tutor:profile` and in a Zustand store.

## 2. Roadmap — `/roadmap`

Tailored, age-appropriate learning path for the requested topic. Rendered as a vertical, gently curved path of nodes (SVG) with the child's name in the header ("{name}'s path to quadratic equations").

- Built from `src/lib/mock-roadmaps.ts`: a keyword lookup on the topic (quadratic equations → full 7-module path; fallback generic path for anything else) with module titles adjusted by grade band.
- Each node → click → `/lesson/:moduleId`. First node highlighted; later ones dimmed but clickable in v1.

## 3. Whiteboard lesson — `/lesson/:moduleId`

The heart of v1. Full-viewport white canvas, minimal chrome.

Layout:
```text
┌──────────────────────────────────────────────┐
│  ← back    Module title           ⓘ  🎧      │  (thin top bar, blends into white)
├──────────────────────────────────────────────┤
│                                              │
│           [ Whiteboard canvas ]              │
│    Mocked lesson content appears here in     │
│    sequence: explanation cards, KaTeX        │
│    equations, worked examples, then a        │
│    practice question.                        │
│                                              │
│   [◀ prev step]   step 3 / 7   [next ▶]      │
├──────────────────────────────────────────────┤
│  ✏️ pen  ▭ shapes  T text   [ fx math ]  🎙 Live │
└──────────────────────────────────────────────┘
```

### Canvas engine
Custom lightweight canvas. SVG + HTML overlay, two layers:
- **Lesson layer**: positioned cards containing text, KaTeX-rendered equations, small diagrams. Absolutely-positioned React nodes with subtle fade/slide-in.
- **Ink layer**: SVG paths for freehand pen, plus draggable shapes and text boxes.

Pan (space+drag / trackpad) and zoom (pinch / ⌘+scroll). Bounded ~3000×3000 world.

Bottom bar tools: Pen, Eraser, Shape (rect/ellipse/arrow), Text, Math (fx).

### Lesson progression
Each module has a scripted sequence of steps from `src/lib/lesson-scripts.ts` (full script for quadratic equations end-to-end; short stubs for the other modules). A step is one of:
- `explanation` — headline + short body + optional KaTeX
- `example` — worked example revealed line by line
- `practice` — question with an answer input area on the canvas

Learner advances with `next`. Soft typewriter effect on text for an AI-tutor feel.

### Math input (fx toolbar)
Floating math toolbar via MathLive (`mathlive` — virtual math keyboard + editable math field with KaTeX-quality output).
- Buttons: `x²`, `xⁿ`, `√`, `∛`, `π`, `±`, `≤`, `≥`, `≠`, fraction, `log`, `ln`, `sin/cos/tan`, `∫`, `Σ`, `( )`, `→`.
- Also accepts LaTeX shorthand (`x^2`, `\sqrt{}`, `\frac{}{}`) with live preview.

### "Live" help (mocked)
`🎙 Live` button opens a right-side drawer (~380 px) so the canvas stays visible.
- No AI call. The drawer replays a canned Socratic exchange from `src/lib/mock-live-hints.ts` keyed by current module + step.
- Chat UI shows a mock tutor typing indicator, then reveals the next hint. "Give me another hint" cycles through the list.
- Closes with Esc or ✕.

## Design system

- Palette: pure white background, near-black ink (`oklch(0.18 0 0)`), single warm accent (soft amber `oklch(0.82 0.12 75)`) for active node, Live button glow, progress. Muted greys for secondary UI.
- Typography: display serif for prompts and module titles (Instrument Serif), clean sans for body/UI (Inter). Loaded via `<link>` in `__root.tsx`.
- Motion: gentle fades, 250–400 ms, easing `cubic-bezier(0.22, 1, 0.36, 1)`.
- Minimal borders; separation via whitespace and soft shadows.

## Technical section

### Routes (TanStack Start, file-based)
- `src/routes/index.tsx` — onboarding (replaces placeholder)
- `src/routes/roadmap.tsx` — roadmap view
- `src/routes/lesson.$moduleId.tsx` — whiteboard lesson

No server routes and no server functions in v1.

### State
- Zustand store `src/lib/tutor-store.ts`: `profile`, `roadmap`, `currentModuleId`, `stepIndex`, `canvasByModule`.
- Persisted to `sessionStorage` (single session only).

### Mock data
- `src/lib/mock-roadmaps.ts` — topic → modules, adjusted by grade band.
- `src/lib/lesson-scripts.ts` — full step script for quadratic equations, stubs for others.
- `src/lib/mock-live-hints.ts` — canned Socratic hint sequences per (module, step).

### Whiteboard implementation
- `src/components/whiteboard/Canvas.tsx` — pan/zoom container, SVG ink layer, HTML lesson layer.
- `src/components/whiteboard/tools/` — Pen, Shape, Text, Math, Eraser.
- `src/components/whiteboard/LessonStep.tsx` — renders explanation / example / practice steps.
- `src/components/whiteboard/MathField.tsx` — MathLive wrapper (client-only, dynamic import behind `<ClientOnly>`).
- `src/components/whiteboard/LiveDrawer.tsx` — mock hint drawer.

### Dependencies to add
`zustand`, `mathlive`, `katex`, `react-katex`. No AI SDK, no Lovable Cloud.

### Out of scope for v1 (deferred)
- Accounts / cross-session persistence
- Any AI calls (roadmap generation, lesson generation, Live tutor)
- Voice / audio (button present, non-functional)
- WebSocket / bi-directional realtime
- Multi-user, sharing, export

## Build order
1. Design tokens + fonts in `styles.css` and `__root.tsx` head (real title/description too).
2. Zustand store + profile types + mock data files.
3. Onboarding at `/` (replaces placeholder).
4. Roadmap route driven by mock lookup.
5. Whiteboard shell (pan/zoom, tools, lesson layer) with the quadratic-equations script.
6. MathLive integration + fx toolbar.
7. Mock Live drawer.
8. Polish: transitions, empty states, error boundaries per route.
