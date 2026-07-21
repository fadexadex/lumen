# 07 · Integration with Lumen Live (`../plan/`)

Generative courses and the live voice tutor share one content contract: **`LessonScript`**.
This file lists the touchpoints so the two plans don’t fight.

---

## 1. Shared contract

```
Course generator ──writes──► LessonScript (+ enriched diagram)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
               MathCanvas     board-targets    board-context
               (layout)       (Live draw)      (Live grounding)
```

Rules:

1. Generators **must** run `enrichParabola` (and friends) before persist — Live targets depend on correct vertex/roots.
2. Module ids stay stable for the course lifetime (Live rooms use `lumen-${moduleId}-${identity}`).
3. Don’t regenerate an open lesson under the learner; Live session would desync targets mid-draw.

---

## 2. Board context from generated scripts

`buildBoardState` (`../plan/08`) already reads `script` + `stepIndex`. Once the store serves
generated scripts, Live grounding works with **zero Live-plan changes**.

Ensure generated practice/math steps expose resolvable names (`stepN.equation`) via the same
`layoutScript` path.

---

## 3. Generative UI tools ↔ Live RPC tools

Two catalogs that should stay conceptually aligned:

| Course Gen UI tool (`03`) | Live canvas tool (`../plan/02`)          |
| ------------------------- | ---------------------------------------- |
| `showParabola`            | `plot_parabola` / existing diagram       |
| `showEquation`            | `add_label` / highlight equation beat    |
| `showPracticeCard`        | (voice asks; optional highlight options) |
| `updateLessonDiagram`     | refresh targets after write              |

Long-term: one `ui-registry` + one `commands` schema. Short-term: duplicate is OK if names match.

When Live is active, prefer **Live RPC draw-on-board** over mounting a second ParabolaWidget in
a side rail (one visual authority — the board).

---

## 4. Onboarding → Live audio pref

`profile.audio === "voice"` can auto-suggest starting Live on Module 1 ready (don’t auto-start
mic without a click — browsers block that). Soft prompt: “Want Lumen to talk you through this?”

---

## 5. Build order across both plans

Suggested sequencing if you implement both:

1. **Live Phase 1** (voice overlay) — works on static scripts.
2. **Generative Phase 1** (roadmap + Module 1 `streamObject`) — still uses static Live.
3. **Live Phase 2** (draw-while-talk) — needs good diagrams → generative enrichment helps.
4. **Generative Phase 2** (background modules + Gen UI rail).
5. Unify registries / polish.

You can also do Generative Module-1 first if demos care more about “infinite topics” than voice.

---

## 6. Risks

| Risk                             | Mitigation                    |
| -------------------------------- | ----------------------------- |
| Generated LaTeX breaks KaTeX     | validate + repair (`02`)      |
| Wrong roots confuse Live circles | server-side `enrichParabola`  |
| SSE + LiveKit both open          | fine; different concerns      |
| Free-tier Gemini exhaustion      | Flash + concurrency 2 + cache |
| Partial script mounted           | lesson guard (`06`)           |

Next: `08` — phased rollout and file manifest.
