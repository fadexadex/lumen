# 06 · Roadmap UI & Lesson Hydration

Wire generation into the existing screens without inventing a new app shell.

---

## 1. RoadmapView — status-aware cards

Extend `RoadmapView.tsx` cards:

| Status | UI |
|--------|-----|
| `pending` | Dim card, lock icon, “Waiting…” |
| `generating` | Soft pulse / shimmer, “Writing lesson…” |
| `ready` | Full card, primary CTA “Open” |
| `failed` | Warning chip + “Retry” button → `POST /api/course/:id/modules/:mid/retry` |

Module 1: when it becomes `ready`, emphasize with a short motion (reuse `tutor-fade-in`).

Progress header: `3 / 7 lessons ready`.

---

## 2. Store changes (`tutor-store.ts`)

```ts
interface TutorState {
  // existing…
  course: Course | null;
  setCourse: (c: Course) => void;
  patchModule: (id: string, patch: Partial<CourseModule>) => void;
}
```

`roadmap` can be derived: `course ? { topic: course.topic, modules: course.modules } : null`
for backward compatibility with `LessonRoute` / PathNavigator.

`getLessonScript(moduleId)` becomes:

```ts
export function getLessonScript(moduleId: string, title: string): LessonScript {
  const course = useTutorStore.getState().course;
  const mod = course?.modules.find((m) => m.id === moduleId);
  if (mod?.script) return mod.script;
  // fallback: legacy static scripts OR placeholder
  return legacyOrPlaceholder(moduleId, title);
}
```

Prefer injecting script via props from the route once the store is the source of truth.

---

## 3. Lesson route guard

```ts
// lesson.$moduleId.tsx / LessonRoute
const mod = course.modules.find(m => m.id === moduleId);
if (!mod || mod.status !== "ready" || !mod.script) {
  return <LessonGeneratingState module={mod} />; // skeleton + "Still writing…"
}
```

Don’t mount MathCanvas on an incomplete script.

---

## 4. Hydration → MathCanvas

No change to `layoutScript` / `MathCanvas` if `LessonScript` is valid. Generative path success =
**valid schema in → same board out**.

Checklist when a generated script opens:

- [ ] Beats layout (titles, body, math, options)
- [ ] `diagram.parabola` drives `ParabolaWidget` when present
- [ ] Practice options clickable
- [ ] Live tutor `resolveTargets` finds `vertex` / `root*` when parabola exists

---

## 5. PathNavigator / next module

When learner finishes Module k:

- If Module k+1 `ready` → navigate as today.
- If `generating` → show “Next lesson is almost ready…” with live status (subscribe to store).
- If `failed` → offer retry or skip.

---

## 6. Skeleton / partial UX (optional polish)

While `module_partial` streams for Module 1 **before** first navigation, roadmap can show a
tiny preview: module title + first step title. After navigation, don’t live-rewrite the open
lesson mid-play (confusing). Treat open lessons as immutable snapshots; regen = new version.

---

## 7. Onboarding fake delay

Remove or shorten the cosmetic “building your path” delay; replace with real SSE progress
(“Outlining path…”, “Writing lesson 1…”).

Next: `07` — integration with the Live tutor plan.
