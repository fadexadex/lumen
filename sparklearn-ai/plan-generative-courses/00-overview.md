# Generative Courses — Plan Overview (00)

> Sibling to `../plan/` (LiveKit + Gemini Live tutor). This folder covers **AI-generated courses**:
> roadmaps, lesson text + equations, and **generative UI** (interactive widgets emitted by the model),
> with a **streaming pipeline** so Module 1 is ready immediately while Modules 2…N generate in the background.

| File | What it covers |
|------|----------------|
| `00-overview.md` | Vision, decisions, relationship to Live plan (this file) |
| `01-architecture-and-pipeline.md` | End-to-end flow, job queue, status machine |
| `02-schemas-and-content-generation.md` | Zod schemas, `streamObject` for LessonScript / Roadmap |
| `03-generative-ui-vercel-ai-sdk.md` | Vercel AI SDK Generative UI (tools → React components) |
| `04-content-curation.md` | Curating source material (web research → curated briefs) |
| `05-streaming-and-background-jobs.md` | Module-1-first streaming; parallel generation of later modules |
| `06-roadmap-ui-and-lesson-hydration.md` | Roadmap “generating…” states; hydrating MathCanvas |
| `07-integration-with-live-tutor.md` | How generated courses feed Lumen Live + board targets |
| `08-phased-rollout-and-file-manifest.md` | Build phases, files, acceptance |

---

## 1. Product vision

After onboarding (topic + grade + style), Lumen should:

1. **Outline a course** (roadmap of modules) in seconds.
2. **Fully generate Module 1** (text, LaTeX equations, diagram params, practice) so the learner can start immediately.
3. **Generate Modules 2…N in the background** while the learner is in Module 1 — roadmap cards flip from “generating…” → “ready”.
4. **Emit generative UI** when useful: not only prose, but interactive widgets (parabola explorer, algebra tiles, practice card, step reveal) chosen by the model via tools.
5. Optionally **curate** teaching material from the web (your research/sources), then rewrite into Lumen’s calm voice + schema.

Today (`mock-roadmaps.ts` + 3 hand-authored `lesson-scripts.ts` entries) is the placeholder this replaces.

## 2. Stack decisions (locked for this plan)

| Concern | Choice | Why |
|---------|--------|-----|
| LLM framework | **Vercel AI SDK** (`ai` + `@ai-sdk/google` / openai) | First-class streaming, tools, object generation; works with TanStack Start |
| Generative UI | **AI SDK UI** pattern: `streamText` + tools → map `tool-*` parts to React components | **Production path**. Vercel marks `streamUI` / AI SDK RSC as experimental and recommends UI for production |
| Structured lessons | **`streamObject` / `generateObject`** with Zod schemas mirroring `LessonScript` | MathCanvas already consumes this shape |
| Transport to browser | **SSE** (AI SDK default) via TanStack Start API routes | Native, debuggable; WebSockets only if we need bidirectional job control later |
| Background generation | In-process job queue (demo) → durable queue later (Inngest / BullMQ / Cloudflare Queues) | Module-1-first without blocking the UI |
| Model (demo) | Gemini Flash (free/cheap) for outlines + lessons; stronger model for hard math QA | Aligns with Live plan’s Gemini preference |
| Content curation | Curator agent: web research → **CuratedBrief** → lesson generator | Separates “facts” from “teaching voice” |

### Why not AI SDK RSC `streamUI`?

- Your app is **TanStack Start + Vite**, not Next.js App Router RSC.
- Vercel’s own docs: RSC is experimental; migrate to AI SDK UI for production (parallel tools, multi-step, broader framework support).
- The UI pattern is the same idea: **model calls a tool → you render a typed React component**. We implement that with `useChat` / message parts (or a thin custom SSE reader), not RSC streaming of component trees.

If you later move to Next.js, RSC `streamUI` remains an option — schemas and tool catalog stay the same.

## 3. Two kinds of “generation” (don’t conflate them)

```
┌─────────────────────────────────────────────────────────────┐
│ A. SCHEMA GENERATION (course content)                        │
│    streamObject → Roadmap / LessonScript                     │
│    → feeds MathCanvas layout, roadmap, Live board-context    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ B. GENERATIVE UI (interactive surfaces)                      │
│    streamText + tools → render ParabolaWidget / QuizCard /…  │
│    → used inside lessons, Live tutoring, or a “studio” view  │
└─────────────────────────────────────────────────────────────┘
```

- **A** is the backbone of generative *courses*.
- **B** is how the model drops *live interactive UI* (Vercel’s “generative UI” docs).
- MathCanvas remains the primary teaching surface; generative UI tools either (1) write into the `LessonScript.diagram` / beats, or (2) mount as overlays/widgets beside the board.

## 4. Relationship to `../plan/` (Live tutor)

| Live plan | Generative courses |
|-----------|-------------------|
| Speaks + draws on existing board | Creates the board content beforehand / in parallel |
| Needs `board-targets` from script | Generated scripts must emit stable target names |
| `getLessonScript()` today | Becomes `getLessonScriptAsync()` / store hydration |

Shared types in `src/lib/types.ts` are the contract. Extend carefully; don’t fork a second lesson format.

## 5. “Web circuits” note

You mentioned curating text with **“web circuits.”** Interpreting for this plan as: **web-sourced research + streaming delivery** (research APIs / crawl → brief → generate; content streamed to the client over SSE). If you meant a specific product (WebSockets-only, a named curation tool, etc.), swap the curator in `04` — the pipeline stays the same.

## 6. Non-negotiables

1. **Module 1 ready before anything else.** Never make the learner wait for the whole course.
2. **Schema-first.** Invalid LaTeX / missing answers fail validation and regenerate — don’t stream garbage into MathCanvas.
3. **Deterministic widgets.** The model emits *params* (e.g. `{a,b,c}`); *you* own the React component. Never let the model invent arbitrary HTML/JS.
4. **Progressive roadmap.** Cards show `pending | generating | ready | failed` with retry.
5. **Style/grade respected.** `LearnerProfile.style` and `grade` actually change prompts (today they’re stored unused).

## 7. Success definition

- Onboard on “quadratic equations” → roadmap of ~6–7 modules appears; Module 1 opens with real generated steps + parabola diagram within ~10–20s.
- While in Module 1, roadmap shows Modules 2–3 flipping to ready.
- Model can call `showParabola` / `showPractice` tools and the matching React widgets appear.
- Generated Module 1 works with Lumen Live (`../plan/`) board targets (vertex, roots, etc.).
