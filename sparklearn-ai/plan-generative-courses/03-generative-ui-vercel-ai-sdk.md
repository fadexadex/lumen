# 03 · Generative UI (Vercel AI SDK)

This is the Vercel pattern you asked about: the model doesn’t invent arbitrary UI — it **calls
tools**, and each tool’s result is bound to a **React component you already trust**.

Official docs: [AI SDK UI — Generative User Interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces).

---

## 1. Recommended approach for Lumen

| Approach | Status | Fit for sparklearn-ai |
|----------|--------|------------------------|
| **AI SDK UI** (`streamText` + tools + `useChat` / message parts) | **Production** | ✅ TanStack Start friendly |
| AI SDK RSC (`streamUI`, `createStreamableUI`) | Experimental; Next.js RSC | ❌ Skip for now |

We implement Generative UI as:

```
Model ─tool call─► { name: "showParabola", args: { a,b,c } }
                         │
                         ▼
Client sees message.parts[] entry type "tool-showParabola"
                         │
                         ▼
Render <ParabolaWidget {...args} />   // existing component
```

---

## 2. Tool catalog (course / lesson surface)

Define tools that map 1:1 onto existing board concepts / widgets:

| Tool name | Args (Zod) | React component | When the model should call it |
|-----------|------------|-----------------|-------------------------------|
| `showParabola` | `{ a,b,c }` | `ParabolaWidget` | Graph intuition, vertex/roots |
| `showAlgebraTiles` | `{ xSquared,x,unit,factored? }` | Tiles concept | Factoring |
| `showNumberLine` | `{ points, range }` | NumberLine | Roots / intervals |
| `showPracticeCard` | `{ prompt, options, answer, hint? }` | new `PracticeCard` | Check understanding |
| `showWorkedExample` | `{ lines: {text?,math?}[] }` | new `WorkedExample` | Step-by-step reveal |
| `showEquation` | `{ latex, caption? }` | KaTeX block | Emphasize a formula |
| `updateLessonDiagram` | same as diagram schema | writes into `LessonScript.diagram` | Persist into the course board |

`updateLessonDiagram` is special: it **mutates the stored script** so MathCanvas / Live targets
update — generative UI that becomes durable course content.

---

## 3. Server route (TanStack Start)

`src/routes/api/course/gen-ui.ts` (or `api/gen-ui`):

```ts
import { streamText, tool, convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { enrichParabola } from "@/lib/course-gen/math";

const showParabola = tool({
  description: "Show an interactive parabola y=ax²+bx+c the learner can explore.",
  inputSchema: z.object({
    a: z.number(), b: z.number(), c: z.number(),
    caption: z.string().optional(),
  }),
  execute: async (input) => enrichParabola(input), // return data only — UI on client
});

const showPracticeCard = tool({
  description: "Show a short multiple-choice practice question.",
  inputSchema: z.object({
    prompt: z.string(),
    options: z.array(z.string()).min(2).max(5),
    answer: z.string(),
    hint: z.string().optional(),
  }),
  execute: async (input) => input,
});

export async function POST({ request }: { request: Request }) {
  const { messages, context } = await request.json();
  // context: { moduleId, stepTitle, equation, grade, style }

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system: `You are Lumen teaching on a whiteboard. Prefer calling UI tools over long prose.
Context: ${JSON.stringify(context)}`,
    messages: await convertToModelMessages(messages),
    tools: { showParabola, showPracticeCard /* … */ },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
```

> Exact AI SDK 5 export names (`createUIMessageStreamResponse`, etc.) move between minors —
> pin `ai` and match the installed docs. The **pattern** (tools + typed parts → components) is stable.

---

## 4. Client rendering

```tsx
import { useChat } from "@ai-sdk/react";
import { ParabolaWidget } from "@/components/math-canvas/parabola-widget";
import { PracticeCard } from "@/components/course-gen/PracticeCard";

export function GenUIRail({ context }: { context: object }) {
  const { messages, sendMessage, status } = useChat({
    api: "/api/course/gen-ui",
    body: { context },
  });

  return (
    <div className="genui-rail">
      {messages.map((m) => (
        <div key={m.id}>
          {m.parts.map((part, i) => {
            if (part.type === "text") return <p key={i} className="tutor-serif">{part.text}</p>;

            if (part.type === "tool-showParabola") {
              if (part.state === "input-available") return <Skeleton key={i} label="Sketching graph…" />;
              if (part.state === "output-available") {
                const { a, b, c } = part.output;
                return (
                  <div key={i} className="genui-widget tutor-fade-in">
                    <ParabolaWidget width={420} height={360} initial={{ a, b, c }} />
                  </div>
                );
              }
            }

            if (part.type === "tool-showPracticeCard" && part.state === "output-available") {
              return <PracticeCard key={i} {...part.output} />;
            }

            return null;
          })}
        </div>
      ))}
    </div>
  );
}
```

### Where this sits in the lesson UI

Two placements (pick for demo; both valid):

1. **Side rail** on concepts that aren’t MathCanvas-fullscreen (Focus Panel, Split Studio).
2. **Inside Live overlay transcript area** — when Lumen Live (`../plan/`) wants a widget mid-voice,
   the Live agent can emit the same tool names via RPC → client mounts the same components
   (shared catalog). Prefer one component registry: `src/lib/course-gen/ui-registry.ts`.

MathCanvas-primary path for durable content remains **schema generation** (`02`). Generative UI
is for *ephemeral / conversational* interactivity and for writing diagram updates into the script.

---

## 5. Shared UI registry

```ts
// src/lib/course-gen/ui-registry.ts
export const GEN_UI = {
  showParabola: { component: "ParabolaWidget", schema: parabolaArgsSchema },
  showPracticeCard: { component: "PracticeCard", schema: practiceSchema },
  // …
} as const;
```

Server tools and client switch statements both import from here — prevents drift.

---

## 6. Safety rules for generative UI

1. **Allowlist only** — never `eval`, never model-supplied HTML/CSS/JS.
2. **Sanitize LaTeX** before KaTeX (length cap, charset).
3. **Enrich math server-side** (`enrichParabola`) before the client trusts roots/vertex.
4. **No pointer theft** — widgets that mount over MathCanvas must respect the Live overlay
   pointer-events rules (`../plan/07`).
5. **Budget** — max N tool calls per turn (`stopWhen: stepCountIs(5)`).

---

## 7. How this differs from “generative courses” content

| | LessonScript generation (`02`) | Generative UI (`03`) |
|--|-------------------------------|----------------------|
| Output | Full module JSON | Tool results mid-conversation |
| Persistence | Saved on Course | Ephemeral unless `updateLessonDiagram` |
| Primary consumer | MathCanvas / roadmap | Rails, Live, studio chat |
| Latency | Seconds–tens of seconds | Sub-second streaming parts |

A complete product uses **both**: courses are generated as scripts; the tutor/studio can still
drop live widgets.

Next: `04` — curating source content before generation.
