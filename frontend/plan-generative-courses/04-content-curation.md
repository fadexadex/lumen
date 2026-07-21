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
  keyIdeas: z
    .array(
      z.object({
        claim: z.string(),
        plainExplanation: z.string(),
        commonMisconception: z.string().optional(),
      }),
    )
    .min(2)
    .max(8),
  equations: z
    .array(
      z.object({
        latex: z.string(),
        meaning: z.string(),
      }),
    )
    .max(8),
  workedExampleSeeds: z
    .array(
      z.object({
        setup: z.string(),
        steps: z.array(z.string()).max(8),
        answer: z.string(),
      }),
    )
    .max(3),
  practiceSeeds: z
    .array(
      z.object({
        prompt: z.string(),
        answer: z.string(),
        distractors: z.array(z.string()).max(4).optional(),
      }),
    )
    .max(4),
  sources: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().url().optional(),
        note: z.string().optional(),
      }),
    )
    .max(8),
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

### Option B (RECOMMENDED) — Mistral + Tavily research loop

This is the chosen path: a dynamic, live web-research loop. Mistral drives, Tavily is the search
tool the model calls **per module** to decide what to look up — so the board reflects real,
current material and the learner can't predict what surfaces.

```ts
import { generateText, tool } from "ai";
import { mistral } from "@ai-sdk/mistral";
import { z } from "zod";
import { tavily } from "@tavily/core"; // or a thin fetch wrapper around the Tavily REST API

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY! });

const webSearch = tool({
  description: "Search the web for current, factual teaching material on a math topic.",
  inputSchema: z.object({ query: z.string(), maxResults: z.number().int().max(5).default(4) }),
  execute: async ({ query, maxResults }) => {
    const r = await tvly.search(query, {
      maxResults,
      searchDepth: "basic",
      includeAnswer: true,
      // Optional kid-safe allowlist: includeDomains: ["khanacademy.org","mathsisfun.com", ...]
    });
    return r.results.map((x) => ({ title: x.title, url: x.url, content: x.content }));
  },
});

// Phase 1: research (tool loop) — model gathers facts.
const research = await generateText({
  model: mistral("mistral-small-latest"),
  tools: { webSearch },
  stopWhen: stepCountIs(4), // cap search calls
  prompt: `Research "${module.title}" for grade ${profile.grade}. Find definitions, key ideas,
common misconceptions, worked examples. Cite sources.`,
});

// Phase 2: structure — turn gathered notes into the schema.
const { object: brief } = await generateObject({
  model: mistral("mistral-small-latest"),
  schema: curatedBriefSchema,
  prompt: `From these research notes, produce a CuratedBrief. Notes:\n${research.text}`,
});
```

Good free-tier story (Tavily free tier + Mistral 1M tokens). Still validate equations with
`enrichParabola` downstream.

### Option C — Other search providers

Swap Tavily for Brave / Serp / Exa behind the same `webSearch` tool if you outgrow the free tier
or want semantic (Exa) vs keyword results. The two-phase (research → structure) shape is unchanged.

### Option D — A dedicated research product

If “web circuits” is a specific stack you already use for research, plug it in as the **Source
Provider** interface:

```ts
interface SourceProvider {
  research(query: string, opts: { grade: number; topic: string }): Promise<RawSource[]>;
}
```

Everything downstream stays the same.

**Recommendation:** Option B (Mistral + Tavily) is the default. Use Option A (manual brief) as a
golden-path fallback for a scripted demo module if a live search is ever flaky on stage.

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

If you want the learner to _see_ curation happening on the roadmap:

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
