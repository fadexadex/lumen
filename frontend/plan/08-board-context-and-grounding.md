# 08 · Board Context & Grounding

Gemini can _speak_ but has no idea what's on the canvas unless we tell it. This file makes Lumen
aware of the current step, equation, parabola coefficients, and the **named targets** it's
allowed to point at — so "circle the vertex" refers to the _right_ vertex, and the model never
invents a target that doesn't exist.

Two channels:

1. **Client → agent board-state deltas** (LiveKit data messages, topic `lumen.board`).
2. **Agent-side context injection** (system prompt + `get_board_state` tool), from `02`.

For the demo we deliberately use **text grounding, not vision** — deterministic, zero extra
latency, zero quota burn. Vision is a `Later` item (`09`).

---

## 1. What the model needs to know (and NOT know)

| Model SHOULD know                      | Model should NOT know        |
| -------------------------------------- | ---------------------------- |
| Current step index/title               | Pixel coordinates            |
| The equation as words/latex            | The `view` transform / zoom  |
| Parabola a,b,c (if any)                | SVG paths                    |
| List of target _names_ it can point to | How annotations are rendered |
| Roots count / vertex existence         | DOM structure                |

Keeping geometry client-side (targets resolved in `05`) means the prompt stays tiny and the
model can't produce out-of-bounds coordinates.

---

## 2. Client builder — `lib/live/board-context.ts`

Reuses `resolveTargets` (`05`) so the target _names_ the model sees are exactly the ones the
client can resolve. Single source of truth.

```ts
import type { LessonScript } from "@/lib/types";
import { resolveTargets } from "./board-targets";
import { prettifyLatex } from "@/lib/whiteboard-bridge"; // reuse existing latex→text

export interface BoardState {
  moduleId: string;
  stepIndex: number;
  stepTotal: number;
  stepTitle: string;
  equation: string; // human-readable
  parabola: { a: number; b: number; c: number } | null;
  targets: string[]; // names the model may reference
}

export function buildBoardState(
  script: LessonScript,
  stepIndex: number,
  moduleId: string,
): BoardState {
  const step = script.steps[stepIndex];
  const T = resolveTargets(script);

  // Prefer the step's own math; fall back to the diagram equation.
  const stepMath =
    step && "math" in step && step.math
      ? step.math
      : script.diagram?.parabola
        ? paramsToEq(script.diagram.parabola)
        : "";

  return {
    moduleId,
    stepIndex,
    stepTotal: script.steps.length,
    stepTitle: step?.title ?? script.title,
    equation: stepMath ? prettifyLatex(stepMath) : "",
    parabola: T.parabola ? { a: T.parabola.a, b: T.parabola.b, c: T.parabola.c } : null,
    targets: T.names,
  };
}

function paramsToEq(p: { a: number; b: number; c: number }): string {
  const s = (n: number) => (n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`);
  return `y = ${p.a}x^2 ${s(p.b)}x ${s(p.c)}`;
}
```

## 3. When to send

Send a board-state delta whenever the picture changes:

| Event                 | Where                                          | Why                         |
| --------------------- | ---------------------------------------------- | --------------------------- |
| Session start         | `useLumenSession.start` → after connect        | first grounding             |
| Step change           | `LessonRoute` effect on `safeIndex` (`07`)     | model follows the lesson    |
| Parabola slider moved | `ParabolaWidget` → callback → `sendBoardState` | targets (vertex/roots) move |
| Concept switch        | `LessonRoute` (conceptId change)               | different surface/targets   |

The `LessonRoute` step effect is already shown in `07`. For slider changes, thread a callback:

```tsx
// ParabolaWidget gains an optional onChange prop:
export function ParabolaWidget({
  width,
  height,
  initial,
  onParams,
}: {
  width: number;
  height: number;
  initial?: { a: number; b: number; c: number };
  onParams?: (p: { a: number; b: number; c: number }) => void;
}) {
  // in each setter: setA(v); onParams?.({ a: v, b, c });  (etc.)
}
```

Then `MathCanvas`/the diagram beat forwards `onParams` up to `LessonRoute`, which calls
`lumen.sendBoardState({...buildBoardState(...), parabola: newParams})`. For the demo you can keep
it simpler: recompute targets from the widget's live params only when the agent asks
`get_board_state` (pull model) — less plumbing, still correct at the moment of drawing.

> Pull vs push tradeoff: **push** (send on every change) keeps the model's running context
> fresh so it can proactively reference the current shape. **Pull** (`get_board_state` tool)
> guarantees correctness at draw time with zero streaming. Ship **pull for Day-1 correctness**,
> add **push** in Week 1 for proactivity. Both use the same `buildBoardState`.

## 4. Agent side (recap from 02)

- `agent.py` subscribes to `data_received` on topic `lumen.board`, updates the `BoardContext`
  singleton.
- The greeting appends `board.as_prompt()` so turn 1 is grounded.
- `get_board_state` tool returns `board.as_prompt()` on demand.
- Optionally, re-inject board context at the start of each user turn via a
  `session.on("user_turn_started")`-style hook so the model always has the latest without you
  bloating the system prompt. (Keep it short — step, equation, targets.)

## 5. Example grounding payload

Client sends (topic `lumen.board`):

```json
{
  "moduleId": "quadratics-intro",
  "stepIndex": 2,
  "stepTotal": 5,
  "stepTitle": "Finding the vertex",
  "equation": "y = x² − 5x + 6",
  "parabola": { "a": 1, "b": -5, "c": 6 },
  "targets": [
    "step0.title",
    "step2.equation",
    "vertex",
    "root1",
    "root2",
    "axisOfSymmetry",
    "graph"
  ]
}
```

Agent turns this into the model-visible text (`BoardContext.as_prompt`):

```
Current step 3 of 5: Finding the vertex
Equation on board: y = x² − 5x + 6
Parabola coefficients: a=1, b=-5, c=6
Targets you can point to: step0.title, step2.equation, vertex, root1, root2, axisOfSymmetry, graph
```

Now when the learner says "where's the lowest point?", the model can confidently
`circle_point(target="vertex")` + `add_label(target="vertex", text="minimum")`, and the client
resolves `vertex` to the exact world coordinate computed from a=1,b=-5,c=6.

## 6. Grounding correctness tests

- [ ] Change step → agent's `get_board_state` reflects the new step/equation.
- [ ] Move a slider → `vertex`/`root` targets resolve to the new location; a subsequent
      `circle("vertex")` lands correctly.
- [ ] Ask the model to point at a non-existent target → it declines / picks a real one (prompt
      rule + `unknown-target` ack reinforce this).
- [ ] Target names in the payload exactly match keys `applyCommand` can resolve (contract test
      in `09`).

Next: `09` sequences the build, defines demo scripts, and handles quota/fallback so a live pitch
can't die.
