# 05 · Streaming & Background Jobs (Module-1-First)

The core UX promise: **start learning Module 1 while the rest of the course generates.**

---

## 1. Client experience timeline

```
t=0s    Submit onboarding
t=1–4s  Roadmap outline appears (all cards "pending" → first "generating")
t=8–20s Module 1 → "ready"; auto-enable "Start" / navigate to lesson
t=20s+  Modules 2,3,… flip to "generating" then "ready" in parallel (2 at a time)
        Learner is already inside Module 1 — roadmap updates live in background
```

Never block the lesson on Modules 2…N.

---

## 2. API: start course (SSE)

`POST /api/course/start`

Body: `{ profile: LearnerProfile }`  
Response: `text/event-stream`

```
event: course
data: {"id":"c_abc","topic":"Quadratic Equations"}

event: roadmap
data: {"modules":[{"id":"m1","title":"…","blurb":"…","status":"pending"}, …]}

event: module_status
data: {"id":"m1","status":"generating"}

event: module_partial
data: {"id":"m1","partial":{ "title":"…", "steps":[…] }}

event: module_ready
data: {"id":"m1","script":{…full LessonScript…}}

event: module_status
data: {"id":"m2","status":"generating"}

event: module_ready
data: {"id":"m2","script":{…}}

event: done
data: {}
```

Client: `EventSource` or `fetch` + `ReadableStream` reader updating Zustand `course`.

---

## 3. Orchestrator (server)

```ts
class CourseOrchestrator {
  async run(courseId: string, profile: LearnerProfile, send: SendFn) {
    const roadmap = await generateRoadmap(profile);
    const course = persistCourse(courseId, profile, roadmap);
    send("roadmap", course);

    // PRIORITY: module 0
    await this.generateOne(course, 0, send);

    // BACKGROUND: remaining with concurrency 2
    await mapPool(course.modules.slice(1), 2, (mod, i) =>
      this.generateOne(course, i + 1, send),
    );
    send("done", {});
  }

  private async generateOne(course: Course, index: number, send: SendFn) {
    const mod = course.modules[index];
    mod.status = "generating"; send("module_status", { id: mod.id, status: "generating" });

    try {
      const brief = await maybeCurate(course.profile, mod);
      const stream = streamLesson({ profile: course.profile, module: mod, priorModules: course.modules.slice(0, index), brief });

      for await (const partial of stream.partialObjectStream) {
        send("module_partial", { id: mod.id, partial });
      }
      let script = lessonScriptSchema.parse(await stream.object);
      script = enrichDiagrams(script);
      await assertMathOk(script);

      mod.script = script;
      mod.status = "ready";
      persistModule(course.id, mod);
      send("module_ready", { id: mod.id, script });
    } catch (e) {
      mod.status = "failed";
      mod.error = String(e);
      send("module_status", { id: mod.id, status: "failed", error: mod.error });
    }
  }
}
```

`mapPool` = simple promise pool (p-limit). Boost priority of `index+1` when the client opens module `index` (optional `POST /api/course/boost`).

---

## 4. Connection longevity

SSE for a 2–5 minute generation run can drop on mobile. Mitigations:

1. **Persist course in memory/DB** keyed by `courseId`.
2. Client reconnects with `GET /api/course/:id/events?since=cursor` or polls
   `GET /api/course/:id` every 2s for statuses.
3. On reconnect, replay only missed `module_ready` / status events.

Demo: in-memory `Map<courseId, Course>` is enough; add SQLite/Turso/Redis later.

---

## 5. Onboarding UX changes

Today: fake “building your path” then navigate to roadmap with static modules.

New:

1. Onboarding submit → `POST /api/course/start` → store `courseId`.
2. Navigate to `/roadmap` immediately with empty/pending modules.
3. Roadmap subscribes to SSE / poll; Module 1 Start button enables on `ready`.
4. Optional: auto-navigate to `/lesson/$moduleId` when Module 1 ready (with a short “Your first lesson is ready” beat).

---

## 6. Quota & cost control

| Lever | Demo setting |
|-------|----------------|
| Max modules | 6–8 |
| Concurrency | 2 |
| Model | Flash |
| Partial streaming | on (status UX) / off if flaky |
| Skip curation | on for speed unless Option B is free |

Estimate: 1 roadmap + 6 lessons ≈ handful of Flash calls — fine for demos if you don’t regenerate endlessly.

---

## 7. WebSockets?

Only needed if you want bidirectional control (cancel module 5, boost module 2) with less glue.
**SSE + POST boost/retry is enough** for v1. LiveKit already covers realtime voice; don’t add a
second realtime stack for course gen unless it hurts.

Next: `06` — roadmap UI + hydrating lessons into MathCanvas.
