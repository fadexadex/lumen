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

1. Install `ai`, `@ai-sdk/react`, `@ai-sdk/google`.
2. Tool catalog + `PracticeCard` / reuse `ParabolaWidget` (`03`).
3. Side rail or studio route for tool-rendered widgets.
4. Optional `updateLessonDiagram` to persist into script.

**Accept:** Ask “show me the graph” → `showParabola` mounts interactive widget.

---

## Phase D — Curation · ~1–3 days

1. `CuratedBrief` schema + Option A (manual) or B (Gemini grounded) (`04`).
2. Pass brief into lesson prompt.
3. Optional source chips on roadmap.

**Accept:** Lesson cites/follows brief objectives; fewer hallucinations on niche topics.

---

## Phase E — Live integration polish

1. Verify `enrichParabola` + Live targets on generated modules (`07`).
2. Shared registry naming.
3. Voice-pref soft prompt.

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
    curator.ts
    orchestrator.ts
    ui-registry.ts
    store-helpers.ts
  src/components/course-gen/
    PracticeCard.tsx
    WorkedExample.tsx
    ModuleStatusCard.tsx            # or fold into RoadmapView
    GenUIRail.tsx
    LessonGeneratingState.tsx
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
GOOGLE_API_KEY=...          # or OPENAI_API_KEY
# optional search provider keys for curator Option C
```

---

## Dependencies

```bash
npm i ai @ai-sdk/react @ai-sdk/google zod   # zod already present
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

## Open questions (resolve when implementing)

1. Exact meaning of **“web circuits”** — which source provider?
2. Persist courses across refresh? (sessionStorage vs DB)
3. Gen UI rail vs board-only for demo?
4. Max modules / concurrency for free-tier demos?

Until answered, defaults: Gemini Flash curator-optional, sessionStorage course, Gen UI side rail on non-MathCanvas concepts, 6 modules / concurrency 2.
