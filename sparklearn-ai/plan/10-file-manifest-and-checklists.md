# 10 · File Manifest & Acceptance Checklists

The exact set of files to create/edit, keyed to the earlier plan files, plus per-file
acceptance criteria and the current code anchors for the edits.

---

## 1. New files

### Backend / infra
| File | Purpose | Spec |
|------|---------|------|
| `agent/pyproject.toml` | deps | `02 §2` |
| `agent/.env.local` | secrets | `02 §3`, `03` |
| `agent/prompts.py` | persona + tool rules | `02 §4` |
| `agent/commands.py` | Command builders (Py) | `02 §5` |
| `agent/board_context.py` | board state store | `02 §6` |
| `agent/tools.py` | function tools → RPC | `02 §7` |
| `agent/agent.py` | entrypoint + model | `02 §8` |
| `token-server/server.mjs` | JWT minter | `03 A` |
| `token-server/package.json` | deps | `03 A` |
| `token-server/.env` | secrets | `03 A` |

### Frontend (`sparklearn-ai/src`)
| File | Purpose | Spec |
|------|---------|------|
| `lib/live/livekit-client.ts` | connect/token/identity | `04 §2` |
| `lib/live/tutor-session.ts` | session + audio + RPC | `04 §3` |
| `lib/live/use-lumen-session.ts` | React hook | `04 §4` |
| `lib/live/canvas-agent-bridge.ts` | controller registry | `06 §1` |
| `lib/live/canvas-commands.ts` | schema + `applyCommand` | `06 §2–3` |
| `lib/live/board-targets.ts` | name → world coords | `05 §3` |
| `lib/live/board-context.ts` | `buildBoardState` | `08 §2` |
| `lib/live/pan.ts` | `panToRect`/`animateView` | `05 §5` |
| `lib/live/live.css` | overlay styles | `07` |
| `components/live/LumenOverlay.tsx` | overlay shell | `07 §4` |
| `components/live/LumenOrb.tsx` | reactive orb | `07 §2` |
| `components/live/LumenTranscript.tsx` | transcript | `07 §3` |
| `components/live/LumenControls.tsx` | mic/end | `07 §4` |
| `components/math-canvas/annotation-layer.tsx` | world-space SVG + controller | `05 §2` |

## 2. Edited files (with current anchors)

| File | Edit | Anchor (current) |
|------|------|------------------|
| `components/math-canvas/MathCanvas.tsx` | mount `<AnnotationLayer>` inside `.mc-board`; register controller + coord fns | after `.mc-lesson-layer` (line ~316); new `useEffect` near other effects |
| `components/math-canvas/math-canvas.css` | `.mc-annotation-layer` + anno keyframes | append |
| `components/math-canvas/parabola-widget.tsx` | optional `onParams` callback | setters at lines ~87–89 |
| `components/whiteboard/LessonRoute.tsx` | remove `LiveDrawer`; add `useLumenSession` + `<LumenOverlay>`; Live button → `start` | import line 6; `liveOpen` line 33; button lines ~110–120; `onOpenLive` line 131; `<LiveDrawer>` line 208 |
| `lib/design.css` | (optional) remove `.live-scene`/`.live-close` etc. | lines ~376–470 |
| `.gitignore` | ignore new `.env*` | append |

## 3. Retired
| File | Action |
|------|--------|
| `components/whiteboard/LiveDrawer.tsx` | delete, or keep behind `?mock=1` |

---

## 4. Dependency changes

`sparklearn-ai/package.json`:
```jsonc
"dependencies": {
  "livekit-client": "^2.9.0",
  "@livekit/components-react": "^2.9.0"   // optional (visualizers)
  // Option B token route only:
  // "livekit-server-sdk": "^2.9.0"
}
```
`agent/` (Python): `livekit-agents`, `livekit-plugins-google`, `livekit-plugins-openai`,
`livekit-plugins-silero`, `python-dotenv` (`02 §2`).
`token-server/`: `livekit-server-sdk`, `dotenv` (`03 A`).

> Pin versions to the latest 2.x (client) / 1.4+ (agents) at implementation time; verify method
> names flagged in `04` (`registerTextStreamHandler`, `registerRpcMethod`, `publishData` topic)
> and `03` (server-route API) against the installed packages before writing final code.

---

## 5. Build order (dependency-correct)

```
1. token-server/*                      (03)  ── independent
2. agent/* (no tools)                  (02)  ── independent, test via console
3. lib/live/livekit-client.ts          (04)
4. lib/live/tutor-session.ts           (04)  ← depends on canvas-commands types (stub first)
5. lib/live/use-lumen-session.ts       (04)
6. components/live/*                    (07)
7. LessonRoute swap                     (07)  ══ PHASE 1 DEMO-ABLE ══
8. components/math-canvas/annotation-layer.tsx  (05)
9. lib/live/canvas-agent-bridge.ts     (06)
10. lib/live/board-targets.ts          (05)
11. lib/live/pan.ts                     (05)
12. lib/live/canvas-commands.ts        (06)  ← applyCommand
13. MathCanvas register controller     (05)
14. agent tools + commands.py          (02)
15. lib/live/board-context.ts + grounding (08) ══ PHASE 2 DEMO-ABLE ══
```

---

## 6. Per-file acceptance criteria

**`annotation-layer.tsx`** — renders nothing until controller called; `circle/highlight/label/
arrow/drawAxis/drawPath/clear` all mount SVG; draw-on animation plays; `pointer-events:none`;
lives inside `.mc-world` so marks transform with zoom.

**`board-targets.ts`** — `resolveTargets(script).names` includes `vertex`,`root1/2`,
`axisOfSymmetry`,`graph`,`stepN.equation` when a parabola exists; `point("vertex")` matches the
widget's rendered vertex within a few px; `graphToWorld` mirrors `parabola-widget` exactly.

**`canvas-commands.ts`** — `applyCommand` returns `ok` for valid targets, `unknown-target:x`
otherwise; never throws; `clear` empties layer.

**`tutor-session.ts`** — connect + mic + agent audio playback; amplitude emitted; transcript
upserts partial→final; RPC `lumen.canvas` parses + emits `command`; clean teardown.

**`MathCanvas.tsx` edit** — pan/zoom/ink unchanged; controller registered on mount, cleared on
unmount; `getView/setView/screenToWorld/worldToScreen` correct (round-trip identity:
`worldToScreen(screenToWorld(p)) ≈ p`).

**`LessonRoute.tsx` edit** — no `LiveDrawer`; Live button starts a real session; overlay
non-blocking; board never dims; board-state pushed on step change.

**Agent** — emits correct tool calls for natural prompts; async (speech not blocked); grounded
by `get_board_state`; model-backend swap works.

---

## 7. Definition of done (whole feature)

- [ ] Phase 1 acceptance (`09`) all green.
- [ ] Phase 2 golden path (`09`) runs clean twice in a row.
- [ ] World-space correctness test (`09 C`) passes at 250% zoom.
- [ ] `npm run lint` clean on new/edited TS; no new type errors.
- [ ] No pointer-capture regressions: pan/zoom/pen/highlighter/eraser/text all still work with a
      session active.
- [ ] Fallback path verified once (`LUMEN_MODEL_BACKEND=openai`).
- [ ] Secrets only in server-side `.env*`; `.gitignore` updated.

---

## 8. Known follow-ups / debt (post-demo)

- De-duplicate `estimateBeatBox` (currently in both `MathCanvas` and `board-targets`) by
  exporting from `layout.ts`.
- Move token minting into the app (Option B) for single-deploy.
- Ephemeral Gemini tokens for a hosted/shared build.
- Persist annotations per step (currently cleared on `clear`/unmount).
- Multi-surface: extend bridge to tldraw/Grapher (out of scope for v1 — `MathCanvas` only).
- Consider consolidating `.live-orb` (old) vs `.lumen-orb` (new) styles.

---

This completes the plan. Read order for implementation: `03 → 02 → 04 → 07` (Phase 1), then
`05 → 06 → 08` with `02` tools re-enabled (Phase 2), using `09` to sequence and test and `10`
(this file) as the master checklist.
