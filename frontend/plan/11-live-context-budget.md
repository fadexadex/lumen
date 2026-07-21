# 11 · Live Context Budget (Staying Under 65k TPM)

Gemini Live free tier is capped at **~65,000 tokens per minute**, and native-audio Live tokenizes
**audio in *and* out** — not just the text we inject. So the budget is dominated by the voice
stream itself, and every extra token of context we push shrinks the runway before a rate wall.

This doc defines how Lumen Live stays cheap: **Mistral does the thinking and compresses context;
Gemini Live only speaks and draws.** Content generation (`../plan-generative-courses/`) already
moved to Mistral (1M free tokens); we extend that split to the live loop.

---

## 1. Division of labor

```
┌─ MISTRAL (mistral-small-latest, 1M budget) ───────────────┐
│  • Roadmap + lessons + concept animations (course plan)   │
│  • Rolling SESSION SUMMARY of what the learner is doing    │
│  • Web research (Tavily) during generation                 │
└───────────────────────────┬───────────────────────────────┘
                            │ tiny text (1–2 sentences)
                            ▼
┌─ GEMINI LIVE (native audio) ──────────────────────────────┐
│  • Speech-to-speech only                                   │
│  • Canvas draw tools (RPC)                                  │
│  • Sees: lean system prompt + board-state (PULL) + summary │
└────────────────────────────────────────────────────────────┘
```

Gemini Live never receives the lesson history, the full transcript, or raw web content. It
receives the **smallest possible** grounding to speak and draw correctly.

---

## 2. Four levers to shrink Live input

### Lever 1 — PULL board context, don't PUSH it

`08` already supports both. For the budget, **pull wins**: the model calls `get_board_state` only
when it's about to draw, instead of us streaming a delta on every step change. One `as_prompt()`
(~60 tokens) on demand beats N pushes per minute. Keep push **off** on the free tier; enable it
only if you move to a paid key.

### Lever 2 — Mistral-maintained rolling session summary

The single richest thing Live sees. A 1–2 sentence state that Mistral keeps fresh:

```
"Learner is on Module 2, step 3 (finding the vertex). They solved factoring easily but got
the sign of b wrong twice. Prefers worked examples."
```

New module `lib/live/session-summary.ts`:

```ts
export interface SessionSummary {
  text: string;      // ≤ 2 sentences, ≤ ~60 tokens
  updatedAt: number;
}

// Called on meaningful events (wrong answer, step jump, concept switch, every ~5 turns).
// Uses mistral-small-latest with a hard output cap.
export async function refreshSummary(prev: SessionSummary, events: LearnerEvent[]) {
  const { text } = await generateText({
    model: mistral("mistral-small-latest"),
    maxOutputTokens: 90,
    prompt: `Update this one-paragraph learner state in <=2 sentences. Keep only what a tutor
needs right now. Prev: "${prev.text}". New events: ${JSON.stringify(events)}`,
  });
  return { text: text.trim(), updatedAt: Date.now() };
}
```

Delivery: send the summary to the agent over the **same** `lumen.board` data channel (add a
`summary` field), so `BoardContext.as_prompt()` appends it. No new transport.

```python
# board_context.py — extend as_prompt()
if self.summary:
    lines.append(f"Learner state: {self.summary}")
```

Update it **on events**, not on a timer — a wrong answer or a step jump, throttled to at most
once every few turns. This keeps the summary token cost off the per-minute audio budget.

### Lever 3 — Lean system prompt + short turns

- Keep `SYSTEM_PROMPT` tight (the `02` prompt is already ~150 tokens — don't grow it).
- The "1–3 sentences before pausing" rule (already in the persona) directly caps output-audio
  tokens. Enforce it; long monologues are the biggest budget leak.
- Don't re-inject board context into every user turn on the free tier (the optional
  `user_turn_started` hook in `08 §4`) — that multiplies text cost per minute. Rely on pull.

### Lever 4 — Tiny draw payloads

Canvas RPC already sends compact JSON (`{op, args}`). For concept animations, the agent advances
scenes by **index** (`play_concept_scene(target, 2)`) rather than re-describing the animation —
see `../plan-generative-courses/09 §6`.

---

## 3. Pacing & fallback

| Concern                     | Mitigation                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| Audio-heavy minutes         | Short-turn rule (Lever 3); cap continuous session length (e.g. soft 10 min) |
| Approaching TPM wall        | Detect Gemini 429 / rate signal → surface "let me catch my breath" beat     |
| Native audio too token-hot  | **Fallback: half-cascade** (audio-in → text-out → TTS) is lighter than native-audio; wire as a second backend flag alongside the OpenAI fallback in `09` |
| Summary refresh cost        | Runs on **Mistral**, not Gemini — costs nothing against the 65k budget      |

Half-cascade note: `livekit-plugins-google` can run STT→LLM(text)→TTS instead of native audio.
It loses some prosody but roughly halves the token pressure on the Live model. Keep it behind
`LUMEN_LIVE_MODE=native|cascade` next to `LUMEN_MODEL_BACKEND`.

---

## 4. Rough budget sketch (order-of-magnitude)

```
Per minute of conversation (native audio, free tier ≈ 65k TPM):
  audio in  (learner speaking)      ~ dominant, variable
  audio out (Lumen speaking)        ~ dominant, controlled by short-turn rule
  system prompt                     ~150 tokens (once, cached where possible)
  get_board_state pulls             ~60 tokens × a few draws
  session summary                   ~60 tokens × ~1 refresh
  draw RPC acks                     negligible
```

The controllable text (prompt + board + summary) is a rounding error next to audio — which is
exactly why the strategy is "**keep turns short + let Mistral hold the memory**," not "trim the
grounding text." Grounding is already tiny; audio pacing is the real lever.

---

## 5. Checklist

- [ ] `lib/live/session-summary.ts` (Mistral, ≤90 out tokens, event-driven refresh).
- [ ] `summary` field on the `lumen.board` payload; `BoardContext.as_prompt()` appends it.
- [ ] Board context stays **pull** (`get_board_state`) on free tier; push disabled.
- [ ] Short-turn persona rule verified (no long monologues in `console` test).
- [ ] `LUMEN_LIVE_MODE=native|cascade` flag; cascade path validated as a budget fallback.
- [ ] 429 / rate-limit handling → graceful spoken "catch my breath" beat, no hard crash.

This closes the loop: Mistral is the always-on brain and memory; Gemini Live is a cheap,
short-spoken mouth + hand that stays comfortably under 65k TPM.
