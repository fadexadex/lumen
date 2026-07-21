# 09 · Phased Rollout, Testing, Quotas & Fallback

Sequenced build so you get dopamine early and de-risk the hard part. Includes the demo scripts,
a contract test, and the quota/fallback strategy so a live pitch can't die.

---

## Phase 0 — Accounts & scaffolding (½ day)

1. Create a **LiveKit Cloud** project (Build, free) → copy `LIVEKIT_URL`, API key/secret.
2. Create a **Google AI Studio** API key (free tier) for Gemini Live.
3. (Optional) OpenAI key for fallback.
4. Scaffold: `agent/`, `token-server/`, `frontend/lib/live/`, `components/live/`.
5. Install the LiveKit docs MCP for your IDE (optional but recommended — the quickstart repo
   suggests it): `https://docs.livekit.io/mcp`.

Exit: all three processes start without crashing (`03` health checks pass).

---

## Phase 1 — "It talks and it's alive" (Day 1)

Scope: voice loop + orb + transcript. **No canvas tools yet.**

Build order:

1. `token-server` (`03` Option A).
2. `agent/` with Gemini model, **no tools** (comment out `ALL_TOOLS`), greeting only. Verify
   with `uv run agent.py console`.
3. `lib/live/livekit-client.ts`, `tutor-session.ts`, `use-lumen-session.ts` (`04`).
4. `components/live/*` overlay (`07`).
5. `LessonRoute` surgery: swap `LiveDrawer` → `LumenOverlay`, wire Live button to `start()`.

Demo script (Day 1):

> Click **Live** → "Hey, I'm Lumen, what are we working on?" → you: "Explain what a parabola
> is." → Lumen answers in voice; orb pulses; transcript streams; you pan/zoom the board the
> whole time.

Acceptance:

- [ ] Round-trip voice < ~1.5 s to first audio.
- [ ] Orb amplitude tracks speech; status transitions correct.
- [ ] Board fully interactive during the session (pan/zoom/ink).
- [ ] End button tears down cleanly.

This alone is ~70% of the "wow."

---

## Phase 2 — "It draws while it talks" (Week 1, the differentiator)

Build order:

1. `annotation-layer.tsx` + mount inside `.mc-board`; `canvas-agent-bridge.ts`;
   register controller in `MathCanvas` (`05`).
2. `board-targets.ts` (`05`) + `canvas-commands.ts` `applyCommand` (`06`).
3. Re-enable agent `ALL_TOOLS` + `commands.py` (`02`).
4. Grounding: `board-context.ts` + `get_board_state` (`08`).
5. Rehearse ONE golden path end-to-end.

Golden-path demo script (Week 1):

> Learner: "Why does this open upward?"
> Lumen (speaking): "Because the x-squared coefficient is positive —" `circle_point("vertex")`
> "— and this lowest point is the vertex." `draw_axis_of_symmetry()` `add_label("vertex","minimum")`
> Learner zooms in → marks stay glued. "Show me a wider one." `plot_parabola(0.3,0,-2)`.
> "Clear that." `clear_annotations()`.

Acceptance:

- [ ] Speech continues while marks animate (async tools proven).
- [ ] Every mark is world-space correct at 100% and after zoom/pan.
- [ ] Unknown target degrades gracefully (model recovers verbally).
- [ ] `focus_on("vertex")` cinematic pan works, marks track camera.

---

## Phase 3 — Later / polish (de-risk + delight)

- **OpenAI fallback** auto-switch (below).
- **Barge-in**: confirm interruption feels natural; tune VAD.
- **Push grounding** on slider changes (`08` push mode).
- **Reduced-motion** paths.
- **Vision (optional)**: periodic canvas screenshot → Gemini vision for freeform boards where
  named targets aren't enough. Adds latency + quota; only if a stakeholder needs it.
- **Avatar (optional)**: swap orb for Simli/Anam via LiveKit avatar plugin (paid) if photoreal
  is demanded.

---

## Testing strategy

### A. Backend-only (no browser)

`uv run agent.py console` — talk, watch tool calls print. Fastest inner loop.

### B. Contract test (TS↔Py schema drift guard)

A dev-only route/button that fires every command once against a mounted board and asserts
`applyCommand` returns `ok`:

```ts
const CMDS: CanvasCommand[] = [
  { id: "t1", op: "highlight", args: { target: "step2.equation" } },
  { id: "t2", op: "circle", args: { target: "vertex", label: "vertex" } },
  { id: "t3", op: "drawAxis", args: {} },
  { id: "t4", op: "plotParabola", args: { a: 0.3, b: 0, c: -2 } },
  { id: "t5", op: "label", args: { target: "root1", text: "root" } },
  { id: "t6", op: "arrow", args: { from: "vertex", to: "root1" } },
  { id: "t7", op: "panTo", args: { target: "graph" } },
  { id: "t8", op: "clear" },
];
CMDS.forEach((c) => console.assert(applyCommand(getCanvasController()!, c) === "ok", c.op));
```

Run this on a lesson that has a parabola diagram so all targets exist.

### C. Coordinate correctness (visual)

Manually: `circle("vertex")` then zoom 100%→250%→pan. The ellipse must stay on the vertex.
This is the single most important visual test — it proves the world-space decision.

### D. Latency budget

- First audio after `start()`: target < 1.5 s (Build cold start may add a few s on first run —
  keep the agent warm by starting it before the demo).
- Tool call → mark visible: < 200 ms.
- `panTo` animation: 600 ms.

---

## Quotas & cost reality (demo)

| Resource                  | Free allotment                               | Watch-out                                               |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| LiveKit agent minutes     | 1,000/mo (Build)                             | plenty for demos                                        |
| LiveKit inference credits | ~$2.50 (~50 min)                             | N/A — we use Gemini key directly, not LiveKit inference |
| Gemini Live free tier     | rate-limited daily (preview models stricter) | can 429 / 1011 mid-demo                                 |
| Concurrent agent sessions | 5 (Build)                                    | 1 learner = fine                                        |
| Cold start                | Build agents may sleep                       | start worker before pitch                               |

Mitigations:

- **Warm the worker** a minute before demoing (it registers and idles cheaply).
- Keep sessions short; `stop()` when idle.
- Have the **OpenAI fallback** ready (below).

---

## Fallback strategy (quota insurance)

Because the tool/RPC/prompt layer is model-agnostic, switching is a config change.

**Manual (safest for a pitch):** run a second worker with `LUMEN_MODEL_BACKEND=openai` on a
different agent name; if Gemini walls, restart the app session — the OpenAI worker picks it up.

**Semi-auto:** in `agent.py`, catch Gemini errors and notify the client, then exit so LiveKit
reschedules; run both workers so the healthy one takes the job:

```python
try:
    await session.start(agent=agent, room=ctx.room)
except Exception as e:
    if is_quota_error(e):
        await ctx.room.local_participant.perform_rpc(
            destination_identity=user, method="lumen.system",
            payload="Lumen hit a limit — switching voice…")
    raise
```

Client `lumen.system` handler (`04`) shows the toast. For a demo, **manual** is more reliable
than clever auto-switching.

---

## Go/no-go checklist before a live demo

- [ ] Worker started & warm (log: "registered worker").
- [ ] Token server up (`curl` returns a token).
- [ ] App loads on the lesson with a parabola diagram (targets exist).
- [ ] Mic permission pre-granted in the demo browser.
- [ ] Golden path rehearsed once end-to-end in the last 10 min.
- [ ] Fallback worker on standby (OpenAI) OR quota checked in AI Studio.
- [ ] Network: hardwired/stable (WebRTC hates flaky Wi-Fi).

Next: `10` — the exact file manifest and per-file acceptance criteria.
