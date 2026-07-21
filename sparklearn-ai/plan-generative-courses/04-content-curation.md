# 04 · Content Curation (Web-Sourced Briefs)

You said you’ll **curate** text content (likely via web research / “web circuits”) and then turn that
into generative lessons. Curation is a **separate stage** before `streamObject(lessonScript)` so
the model teaches from vetted material instead of hallucinating the curriculum.

---

## 1. Pipeline

```
Topic + module title
        │
        ▼
 Curator Agent
   1. Search / fetch sources (web)
   2. Extract key facts, definitions, pitfalls, example problems
   3. Emit CuratedBrief (Zod)
        │
        ▼
 LessonGenerator (02) receives brief as grounding
        │
        ▼
 LessonScript (Lumen voice + schema + diagrams)
```

Without curation, generation still works (model prior knowledge). With curation, quality and
trust go up — especially for non-quadratic topics.

---

## 2. `CuratedBrief` schema

```ts
export const curatedBriefSchema = z.object({
  moduleId: z.string(),
  topic: z.string(),
  learningObjectives: z.array(z.string()).min(2).max(6),
  keyIdeas: z.array(z.object({
    claim: z.string(),
    plainExplanation: z.string(),
    commonMisconception: z.string().optional(),
  })).min(2).max(8),
  equations: z.array(z.object({
    latex: z.string(),
    meaning: z.string(),
  })).max(8),
  workedExampleSeeds: z.array(z.object({
    setup: z.string(),
    steps: z.array(z.string()).max(8),
    answer: z.string(),
  })).max(3),
  practiceSeeds: z.array(z.object({
    prompt: z.string(),
    answer: z.string(),
    distractors: z.array(z.string()).max(4).optional(),
  })).max(4),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string().url().optional(),
    note: z.string().optional(),
  })).max(8),
  caution: z.string().optional(), // e.g. "avoid calculus"
});
```

The lesson generator is instructed: **teach only from this brief**; expand into Lumen voice;
don’t invent conflicting facts.

---

## 3. Curator implementations (pick one for demo)

### Option A — Manual / editorial (fastest demo control)
You paste or upload a brief JSON / markdown per module. No web calls. Best for demos where you
want a known golden path.

### Option B — Gemini + Google Search grounding
Use Gemini’s grounded search (when available on your key) to produce a brief in one
`generateObject` call. Good free-tier story; still validate equations with `enrichParabola`.

### Option C — Explicit search API + fetch + summarize
1. Query (Tavily / Brave / Serp / Exa / etc.)
2. Fetch top K pages (HTML → text)
3. `generateObject` → `CuratedBrief`
4. Store sources for transparency (“Based on …”)

### Option D — Your “web circuits” product
If “web circuits” is a specific stack you already use for research, plug it in as the **Source
Provider** interface:

```ts
interface SourceProvider {
  research(query: string, opts: { grade: number; topic: string }): Promise<RawSource[]>;
}
```

Everything downstream stays the same.

**Recommendation for shortest convincing demo:** Option A or B for Module 1; add C when you care
about citation UX.

---

## 4. When curation runs in the orchestrator

```
generateRoadmap
  └─ for each module (priority order):
       optional: curateBrief(module)     // can run in parallel with weight
       then:     streamLesson(module, brief)
```

- Module 0: curate + generate **serially** (quality over speed, still target &lt; 20s total).
- Modules 1..N: curate∥generate in the background with concurrency limits.
- Cache briefs by `(topic, moduleTitle, grade)`.

---

## 5. Streaming curated text to the UI (optional)

If you want the learner to *see* curation happening on the roadmap:

```
event: curating   { moduleId, message: "Gathering examples…" }
event: brief_ready { moduleId, objectives: [...] }
event: generating { moduleId }
event: module_ready { moduleId }
```

Don’t dump raw web text into the UI — only short status + maybe “Objectives” chips from the brief.

---

## 6. Quality gates for briefs

- Reject briefs with empty `equations` when the module title implies formulas.
- Cap source domain allowlist for kids (educational domains) if scraping.
- Strip PII / unsafe content from fetched pages before summarize.
- Arithmetic: same `enrichParabola` / answer checks as lessons.

---

## 7. Human-in-the-loop (later)

Admin “Studio” view:
- Edit brief → regenerate lesson
- Lock a module’s script so regen won’t overwrite
- Approve sources

Out of scope for first demo; leave the `CuratedBrief` table shape ready.

Next: `05` — background jobs and Module-1-first streaming.
