# 01 · Architecture & Pipeline

## 1. High-level flow

```
Onboarding (topic, grade, style)
        │
        ▼
 POST /api/course/start  ──►  CourseOrchestrator
        │                         │
        │                         ├─1─ generateRoadmap (fast, generateObject)
        │                         │       └─ persist Course { modules: [{id,status:pending}] }
        │                         │
        │                         ├─2─ generateLesson(module[0])  PRIORITY
        │                         │       └─ status: generating → ready (stream to client)
        │                         │
        │                         └─3─ enqueue generateLesson(module[1..n])  BACKGROUND
        │                                 (concurrency 2–3)
        ▼
 Client: RoadmapView (live statuses via SSE / poll)
        │
        └─ Module 1 ready → /lesson/$id with hydrated LessonScript
              while Modules 2..N keep filling in
```

## 2. Domain additions (on top of existing types)

Keep `Roadmap` / `LessonScript` as the rendered shapes. Add generation metadata:

```ts
// src/lib/course-gen/types.ts
export type ModuleGenStatus = "pending" | "generating" | "ready" | "failed";

export interface CourseModule extends RoadmapModule {
  status: ModuleGenStatus;
  error?: string;
  script?: LessonScript;          // present when ready
  curatedBriefId?: string;        // optional link to curator output
}

export interface Course {
  id: string;                     // uuid
  profile: LearnerProfile;
  topic: string;
  modules: CourseModule[];
  createdAt: number;
  updatedAt: number;
}
```

Zustand (`tutor-store`) grows to hold `course: Course | null` instead of bare `roadmap`, or wraps roadmap + statuses.

## 3. Processes

| Process | Role |
|---------|------|
| TanStack Start API routes | SSE streams for roadmap/lesson; start/retry endpoints |
| CourseOrchestrator | Priority queue: module 0 first, then parallel rest |
| LessonGenerator | `streamObject(lessonScriptSchema)` + validation + repair |
| UI Tool Router (optional path) | `streamText` + generative UI tools during lesson / studio |
| Curator (optional) | Web research → `CuratedBrief` before lesson gen |

Demo: all in one Node process. Later: extract orchestrator to a worker.

## 4. Status machine (per module)

```
 pending ──start──► generating ──validate ok──► ready
                       │
                       └──validate fail / timeout──► failed ──retry──► generating
```

Roadmap UI binds to `status`. Lesson route refuses to open unless `ready` (or shows skeleton while `generating` if user jumped early — prefer lock until ready for Module 1 only; Module 1 should be ready before navigate).

## 5. Streaming surfaces

1. **Course start SSE** — events:
   - `roadmap` (full outline)
   - `module_status` `{ id, status }`
   - `module_partial` `{ id, partialScript }` (optional, for progressive reveal)
   - `module_ready` `{ id, script }`
   - `done` / `error`

2. **Lesson generative UI SSE** (separate, in-lesson) — AI SDK UI message stream with tool parts.

## 6. Where content lands

```
Course.modules[i].script  (LessonScript)
        │
        ▼
getLessonScript(moduleId)  →  read from course store / cache
        │
        ▼
layoutScript(script) → beats → MathCanvas
        │
        ▼
resolveTargets(script) → Live tutor tools (../plan/)
```

Single write path: generators write `LessonScript`; all UIs read it. No parallel “gen UI only” format that bypasses the script unless it’s ephemeral (Live session widgets).

## 7. Concurrency model

```
Priority queue:
  [module-0]          weight 100
  [module-1]          weight 10
  [module-2]          weight 10
  ...

Worker pool size: 2 (demo) — enough to fill ahead without melting free-tier quotas.
When module-0 completes → unlock navigation to lesson.
When learner opens module-k → boost weight of module-(k+1).
```

## 8. Failure isolation

- Module 3 failing must not block Module 4 or break Module 1.
- Store `error` string; UI shows Retry on that card only.
- Soft fallback: if generation fails twice, inject a short “placeholder” script (today’s coming-soon) so the path never dead-ends.

Next: `02` — Zod schemas and content generation details.
