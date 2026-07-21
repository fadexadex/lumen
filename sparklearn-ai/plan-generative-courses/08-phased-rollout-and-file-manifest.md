# 08 · Phased Rollout & File Manifest

---

## Phase A — Schema pipeline (Module 1 only) · ~2–3 days

**Goal:** Onboard → real AI roadmap → Module 1 generated → open in MathCanvas.

1. Add Zod schemas (`02`).
2. `POST /api/course/start` generates roadmap + Module 1 only (no background yet).
3. Hydrate store; replace `buildRoadmap` / `getLessonScript` paths.
4. Roadmap shows Module 1 ready; others locked “Coming next”.

**Accept:** Quadratic (and one non-quadratic topic) produce usable Module 1 with valid math.

---

## Phase B — Background generation · ~1–2 days

1. Orchestrator + concurrency pool (`05`).
2. SSE / poll statuses on RoadmapView (`06`).
3. Retry failed modules.
4. Next-module wait state.

**Accept:** Enter Module 1; watch Modules 2–3 flip to ready without refresh.

---

## Phase C — Generative UI (Vercel AI SDK UI) · ~2 days

1. Install `ai`, `@ai-sdk/react`, `@ai-sdk/mistral`.
2. Tool catalog + `PracticeCard` / reuse `ParabolaWidget` (`03`).
3. Side rail or studio route for tool-rendered widgets.
4. Optional `updateLessonDiagram` to persist into script.

**Accept:** Ask “show me the graph” → `showParabola` mounts interactive widget.

---

## Phase D — Curation via live web research · ~1–3 days

1. `CuratedBrief` schema + Option B (Mistral + Tavily research loop) (`04`).
2. Pass brief into lesson prompt.
3. Optional source chips on roadmap.

**Accept:** Lesson cites/follows brief objectives from real web sources; fewer hallucinations on
niche topics.

---

## Phase E — Concept animations (dynamic board) · ~2–4 days

1. `conceptAnimationSchema` + primitive union (`09`); wire into `lessonScript`.
2. `animation-registry.ts` + first 8–10 primitive components.
3. `ConceptAnimationPlayer` + `showConceptAnimation` tool + Live RPC `play_concept_scene`.
4. Server-side math enrichment for animated function/curve primitives.

**Accept:** A module renders ≥2 different animation primitives; the learner can't predict which.

---

## Phase F — Live integration polish

1. Verify `enrichParabola` + Live targets on generated modules (`07`).
2. Shared registry naming.
3. Voice-pref soft prompt.
4. Session-summary bridge to keep Gemini Live under budget (`../plan/11`).

---

## File manifest (new)

```
sparklearn-ai/
  plan-generative-courses/          # this plan
  src/lib/course-gen/
    types.ts
    schemas.ts
    prompts.ts
    math.ts                         # enrichParabola, etc.
    generate-roadmap.ts
    generate-lesson.ts
    curator.ts                      # Mistral + Tavily research loop (04)
    web-search.ts                   # Tavily tool wrapper
    orchestrator.ts
    ui-registry.ts
    animation-registry.ts           # concept-animation primitives (09)
    store-helpers.ts
  src/lib/live/
    session-summary.ts              # Mistral rolling summary → Gemini Live (../plan/11)
  src/components/course-gen/
    PracticeCard.tsx
    WorkedExample.tsx
    ModuleStatusCard.tsx            # or fold into RoadmapView
    GenUIRail.tsx
    LessonGeneratingState.tsx
    ConceptAnimationPlayer.tsx      # plays a ConceptAnimation storyboard (09)
  src/components/animations/        # deterministic primitive components (09)
    PlotFunction.tsx  MorphCurve.tsx  BalanceScale.tsx  PartitionGrid.tsx
    NumberLineWalk.tsx  CountObjects.tsx  VectorField.tsx  GeometryTransform.tsx
    StepReveal.tsx  FractionBar.tsx
  src/routes/api/course/
    start.ts                        # SSE start
    $courseId.ts                    # GET status
    $courseId.modules.$moduleId.retry.ts
    gen-ui.ts                       # generative UI chat
```

## Edited

```
src/lib/tutor-store.ts              # course + patchModule
src/lib/lesson-scripts.ts           # read from course store first
src/lib/mock-roadmaps.ts            # deprecate / fallback only
src/components/tutor/Onboarding.tsx # call /api/course/start
src/components/tutor/RoadmapView.tsx
src/components/tutor/PathNavigator.tsx
src/components/whiteboard/LessonRoute.tsx  # guard on ready
package.json                        # ai, @ai-sdk/*
```

## Env

```
MISTRAL_API_KEY=...         # content generation (roadmap, lessons, summaries, animations)
TAVILY_API_KEY=...          # live web research during curation (04)
# Voice (Live plan) lives in agent/.env.local, not here — see ../plan/03 + ../plan/11:
#   GOOGLE_API_KEY, LIVEKIT_URL/API_KEY/API_SECRET, optional OPENAI_API_KEY
```

---

## Dependencies

```bash
npm i ai @ai-sdk/react @ai-sdk/mistral zod   # zod already present
npm i @tavily/core                            # or call the Tavily REST API with fetch
```

---

## Definition of done

- [ ] Module-1-first: learner in lesson while later modules generate.
- [ ] Generated `LessonScript` renders correctly in MathCanvas.
- [ ] Parabola diagrams have server-enriched roots/vertex.
- [ ] Generative UI tool → React component path works (Vercel AI SDK UI).
- [ ] Failed module is retryable; doesn’t brick the course.
- [ ] Live plan board-targets resolve on a generated quadratic module.
- [ ] Style + grade affect prompts (visible difference in output).

---

## Decisions (locked)

- **Content model:** Mistral — `mistral-small-latest` (bulk) + `mistral-large-latest` (repair).
- **Web research:** Tavily, called as a tool during curation (Option B).
- **Animations:** Level A (composable primitive library) now; Level B (keyframe DSL) later (`09`).
- **Roadmap:** streamed (`streamObject`) as the "planning" pop-in animation.

## Open questions (resolve when implementing)

1. Persist courses across refresh? (sessionStorage vs DB — default sessionStorage for demo)
2. Gen UI rail vs board-only for demo? (default: side rail on non-MathCanvas concepts)
3. Max modules / concurrency? (default: 6 modules / concurrency 3)
