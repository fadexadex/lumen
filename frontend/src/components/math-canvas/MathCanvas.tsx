import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LessonScript } from "@/lib/types";
import { InkCanvas, type InkHandle, type MCTool } from "./ink-canvas";
import { TextNotes, type NotesHandle } from "./text-notes";
import { ParabolaWidget } from "./parabola-widget";
import { ConceptAnimationPlayer } from "./concept-animation";
import { layoutScript, PAGE_STRIDE, LEFT_X, COL_W, VISUAL_X, VISUAL_W, type Beat } from "./layout";
import { Equation, toHandMath } from "./equation";
import { MathText } from "@/lib/math-text";
import { AnnotationLayer, type LumenCanvasController } from "./annotation-layer";
import { setCanvasController } from "@/lib/live/canvas-agent-bridge";
import { estimateBeatRect, resolveTargets } from "@/lib/live/board-targets";
import { emitLiveParabola } from "@/lib/live/board-live";
import { activeConceptScene, sceneIndexForStep } from "@/lib/concept-visual";

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

type Pad = { left: number; right: number; top: number; bottom: number };

/** Chrome insets — tighten on small screens so the board stays readable. */
function chromePad(el: HTMLElement): Pad {
  const w = el.clientWidth;
  const safeBottom = 0; // CSS also applies env(safe-area); keep JS pads for layout math
  if (w < 520) {
    return { left: 16, right: 16, top: 72, bottom: 176 + safeBottom };
  }
  if (w < 720) {
    return { left: 56, right: 20, top: 80, bottom: 160 + safeBottom };
  }
  if (w < 1100) {
    return { left: 72, right: 56, top: 88, bottom: 148 };
  }
  return { left: 96, right: 96, top: 96, bottom: 136 };
}

type Bounds = { x: number; y: number; w: number; h: number };
type View = { x: number; y: number; scale: number };

function fitFrame(el: HTMLElement, frame: Bounds, maxScale = 1.05, alignTop = false): View {
  const pad = chromePad(el);
  const availW = Math.max(120, el.clientWidth - pad.left - pad.right);
  const availH = Math.max(120, el.clientHeight - pad.top - pad.bottom);
  const scale = Math.max(0.35, Math.min(maxScale, availW / frame.w, availH / frame.h));
  const x = pad.left + (availW - frame.w * scale) / 2 - frame.x * scale;
  const y = alignTop
    ? pad.top - frame.y * scale + 8
    : pad.top + (availH - frame.h * scale) / 2 - frame.y * scale;
  return { x, y, scale };
}

/* The page frame is the SAME shape for every step — that's what makes every
   advance land on identical zoom with the visual always in view. */
const PAGE_FRAME_TOP = 72;
const PAGE_FRAME_H = 600;
/** Full page: prose column + visual model side by side. */
function pageFrame(stepIndex: number): Bounds {
  const originX = stepIndex * PAGE_STRIDE + LEFT_X;
  return {
    x: originX - 40,
    y: PAGE_FRAME_TOP,
    w: VISUAL_X + VISUAL_W + 40 - (LEFT_X - 40),
    h: PAGE_FRAME_H,
  };
}
/** Just the prose column — used on narrow screens where the whole page can't
    fit legibly; the visual is one horizontal pan to the right, same zoom. */
function proseFrame(stepIndex: number): Bounds {
  const originX = stepIndex * PAGE_STRIDE + LEFT_X;
  return { x: originX - 40, y: PAGE_FRAME_TOP, w: COL_W + 80, h: PAGE_FRAME_H };
}

export interface MathCanvasProps {
  script: LessonScript;
  stepIndex: number;
  goto: (i: number) => void;
  demoActive: boolean;
  onWriteMath: () => void;
  onOpenLive: () => void;
  onVisualSceneChange?: (index: number) => void;
  nextModule?: { id: string; title: string } | null;
  onNextModule?: () => void;
}

export function MathCanvas(props: MathCanvasProps) {
  const { script, stepIndex, goto, onWriteMath, nextModule, onNextModule, onVisualSceneChange } =
    props;
  const [tool, setTool] = useState<MCTool>("pan");
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [spaceDown, setSpaceDown] = useState(false);
  const inkRef = useRef<InkHandle | null>(null);
  const notesRef = useRef<NotesHandle | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const fittedKeyRef = useRef<string | null>(null);
  const lastFitVpRef = useRef({ w: 0, h: 0 });
  const lessonFollowPausedUntilRef = useRef(0);
  // True once the learner has zoomed/panned by hand. Auto-framing must not fight
  // a hand-set camera — a viewport resize (e.g. browser zoom changes clientWidth)
  // would otherwise snap the board back to the page frame mid-zoom. Cleared when
  // a deliberate step change re-frames (see applyOverview).
  const userAdjustedRef = useRef(false);
  const panning = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const annoRef = useRef<LumenCanvasController | null>(null);
  const boardElRef = useRef<HTMLDivElement | null>(null);
  const automaticSceneIndex =
    script.visual?.kind === "animation"
      ? sceneIndexForStep(stepIndex, script.steps.length, script.visual.scenes.length)
      : 0;
  const [visualSceneIndex, setVisualSceneIndex] = useState(automaticSceneIndex);
  useEffect(() => {
    setVisualSceneIndex(automaticSceneIndex);
    onVisualSceneChange?.(automaticSceneIndex);
  }, [automaticSceneIndex, onVisualSceneChange]);

  const selectVisualScene = useCallback(
    (index: number) => {
      setVisualSceneIndex(index);
      onVisualSceneChange?.(index);
    },
    [onVisualSceneChange],
  );
  const scriptPara = useMemo(() => {
    const activeScene =
      script.visual?.kind === "animation"
        ? activeConceptScene(script.visual, stepIndex, script.steps.length, visualSceneIndex).scene
        : null;
    return activeScene?.primitive === "plotFunction" && activeScene.fn === "parabola"
      ? { a: activeScene.a, b: activeScene.b, c: activeScene.c }
      : (script.diagram?.parabola ?? null);
  }, [script, stepIndex, visualSceneIndex]);
  const [paraParams, setParaParams] = useState<{ a: number; b: number; c: number } | null>(
    scriptPara,
  );

  useEffect(() => {
    setParaParams(scriptPara);
  }, [scriptPara]);

  const {
    beats,
    height: BOARD_H,
    width: BOARD_W,
  } = useMemo(() => layoutScript(script, stepIndex), [script, stepIndex]);

  // Register the Lumen Live canvas controller: annotations + view/coord helpers.
  // Re-resolve targets when the lesson OR live parabola params change.
  useEffect(() => {
    const targets = resolveTargets(script, paraParams, stepIndex, visualSceneIndex);
    setCanvasController({
      anno: () => annoRef.current,
      targets,
      getView: () => viewRef.current,
      setView,
      viewportEl: () => viewportRef.current,
      boardEl: () => boardElRef.current,
      lessonRects: beats.map(estimateBeatRect),
      suspendLessonFollow: (ms) => {
        lessonFollowPausedUntilRef.current = Math.max(
          lessonFollowPausedUntilRef.current,
          performance.now() + ms,
        );
      },
      screenToWorld: (sx, sy) => {
        const v = viewRef.current;
        return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
      },
      worldToScreen: (wx, wy) => {
        const v = viewRef.current;
        return { x: wx * v.scale + v.x, y: wy * v.scale + v.y };
      },
      boardSize: { w: BOARD_W, h: BOARD_H },
      pageBounds: () => ({ x: stepIndex * PAGE_STRIDE, y: 0, w: PAGE_STRIDE, h: BOARD_H }),
      setParabola: (a, b, c) => {
        const next = { a, b, c };
        setParaParams(next);
        emitLiveParabola(next);
      },
      setVisualScene: selectVisualScene,
      setStep: (index) => goto(index),
      stepCount: script.steps.length,
    });
    return () => setCanvasController(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, beats, BOARD_H, paraParams, stepIndex, visualSceneIndex, selectVisualScene, goto]);

  // Viewport size (for full-screen ink layer)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setVp({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const activeBeats = useMemo(() => beats.filter((b) => b.step === stepIndex), [beats, stepIndex]);
  const visibleBeats = useMemo(
    () => beats.filter((beat) => beat.kind === "visual" || beat.step <= stepIndex),
    [beats, stepIndex],
  );

  // Every step lands on the SAME page frame — identical zoom, visual always in
  // view. On narrow screens we frame just the prose (visual is one pan right).
  const hasVisual = useMemo(
    () => beats.some((beat) => beat.kind === "visual" || beat.kind === "diagram"),
    [beats],
  );
  const applyOverview = () => {
    const el = viewportRef.current;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
    // With a visual: frame the whole page (prose + model) on wide screens, or
    // just the prose on narrow ones. Without a visual: always center the prose
    // so a text-only step never opens on an empty half-board.
    const wideEnough = el.clientWidth >= 1180;
    const frame = hasVisual && wideEnough ? pageFrame(stepIndex) : proseFrame(stepIndex);
    setView(fitFrame(el, frame, 1.05, true));
    // The camera is back on a system-defined frame; the learner's hand-set view
    // (if any) has been intentionally replaced.
    userAdjustedRef.current = false;
  };

  useEffect(() => {
    if (vp.w === 0 || vp.h === 0) return;
    const scriptKey = `${script.title}:${BOARD_H}:${beats.length}`;
    const last = lastFitVpRef.current;
    const scriptChanged = fittedKeyRef.current !== scriptKey;
    const sizeChanged =
      last.w === 0 || Math.abs(vp.w - last.w) > 64 || Math.abs(vp.h - last.h) > 64;
    if (!scriptChanged && !sizeChanged) return;
    fittedKeyRef.current = scriptKey;
    lastFitVpRef.current = { w: vp.w, h: vp.h };
    // A new lesson always re-fits. A bare viewport resize (browser zoom, a
    // scrollbar, an orientation nudge) must NOT clobber a view the learner has
    // zoomed/panned by hand — that was the "zoom keeps resetting" bug.
    if (!scriptChanged && userAdjustedRef.current) return;
    applyOverview();
  }, [BOARD_H, beats, script.title, vp.w, vp.h]);

  // Advancing (or rewinding) a step glides to that page. A deliberate step
  // change — whether the learner taps Continue or the AI calls go_to_step — is
  // always honored, even if an AI write just suspended lesson-follow: navigation
  // outranks staying put. Re-framing WITHIN the same step still respects the
  // suspension so an in-progress write isn't yanked off screen.
  const prevStepRef = useRef(stepIndex);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (!fittedKeyRef.current) return; // wait for the initial overview
    const stepChanged = prevStepRef.current !== stepIndex;
    prevStepRef.current = stepIndex;
    if (stepChanged) {
      lessonFollowPausedUntilRef.current = 0; // navigation clears any write-hold
    } else if (performance.now() < lessonFollowPausedUntilRef.current || userAdjustedRef.current) {
      // Same page: don't re-frame over an AI write in progress, nor over a view
      // the learner has zoomed/panned by hand.
      return;
    }
    if (!activeBeats[0]) return;
    applyOverview();
  }, [stepIndex, activeBeats]);

  // Wheel: pinch-zoom or pan
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userAdjustedRef.current = true;
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const k = nextScale / v.scale;
        setView({ scale: nextScale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Space-to-pan
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) setSpaceDown(true);
    };
    const u = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => {
      window.removeEventListener("keydown", d);
      window.removeEventListener("keyup", u);
    };
  }, []);

  const panActive = tool === "pan" || spaceDown;
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(panActive || e.button === 1)) return;
    const tgt = e.target as Element | null;
    if (tgt && tgt.closest("input, button, textarea, select, label, a, [data-no-pan]")) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    panning.current = { x: e.clientX, y: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panning.current) return;
    userAdjustedRef.current = true;
    const p = panning.current;
    setView({ ...viewRef.current, x: p.ox + (e.clientX - p.x), y: p.oy + (e.clientY - p.y) });
  };
  const onUp = () => {
    panning.current = null;
  };

  const zoomBy = (f: number) => {
    const el = viewportRef.current;
    if (!el) return;
    userAdjustedRef.current = true;
    const cx = el.clientWidth / 2,
      cy = el.clientHeight / 2;
    const v = viewRef.current;
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * f));
    const k = nextScale / v.scale;
    setView({ scale: nextScale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
  };
  const resetView = () => {
    applyOverview();
  };

  const total = script.steps.length;
  const finished = stepIndex >= total - 1;

  const onRestart = () => {
    goto(0);
  };
  const onNext = () => {
    if (finished) onNextModule?.();
    else goto(stepIndex + 1);
  };
  const onPrev = () => {
    if (stepIndex > 0) goto(stepIndex - 1);
  };

  return (
    <div
      ref={viewportRef}
      className="mc-viewport"
      style={{ cursor: panning.current ? "grabbing" : panActive ? "grab" : "default" }}
      onPointerDown={(e) => {
        onDown(e);
      }}
      onPointerMove={(e) => {
        onMove(e);
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div
        className="mc-world"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <div ref={boardElRef} className="mc-board" style={{ width: BOARD_W, height: BOARD_H }}>
          <div className="mc-lesson-layer" style={{ pointerEvents: "none" }}>
            {visibleBeats.map((b) => {
              const beatIndex = beats.indexOf(b);
              const isProse =
                b.kind === "title" ||
                b.kind === "text" ||
                b.kind === "math" ||
                b.kind === "options";
              const past = isProse && b.step < stepIndex;
              const current = isProse && b.step === stepIndex;
              return (
                <BeatView
                  key={beatIndex}
                  beat={b}
                  beatIndex={beatIndex}
                  charsRevealed={Infinity}
                  active={false}
                  past={past}
                  current={current}
                  picked={picked}
                  onPick={(bi, oi) => setPicked((p) => ({ ...p, [bi]: oi }))}
                  paraParams={paraParams}
                  stepIndex={stepIndex}
                  stepTotal={script.steps.length}
                  visualSceneIndex={visualSceneIndex}
                  onVisualSceneChange={selectVisualScene}
                  onParaChange={(p) => {
                    setParaParams(p);
                    emitLiveParabola(p);
                  }}
                />
              );
            })}
          </div>
          <AnnotationLayer ref={annoRef} width={BOARD_W} height={BOARD_H} viewScale={view.scale} />
        </div>
      </div>

      {/* Full-viewport ink + text — annotate anywhere, not just the board */}
      {vp.w > 0 && (
        <>
          <div
            className="mc-ink-layer"
            style={{
              pointerEvents:
                tool === "pen" || tool === "highlighter" || tool === "eraser" ? "auto" : "none",
            }}
          >
            <InkCanvas ref={inkRef} width={vp.w} height={vp.h} tool={tool} />
          </div>
          <div
            className="mc-notes-layer"
            style={{ pointerEvents: tool === "text" ? "auto" : "none" }}
          >
            <TextNotes tool={tool} width={vp.w} height={vp.h} overlayRef={notesRef} />
          </div>
        </>
      )}

      {/* Left tool rail */}
      <div className="mc-toolrail" data-no-pan>
        <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} label="Pan">
          <HandI />
        </ToolBtn>
        <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} label="Pen">
          <PenI />
        </ToolBtn>
        <ToolBtn
          active={tool === "highlighter"}
          onClick={() => setTool("highlighter")}
          label="Highlighter"
        >
          <HighI />
        </ToolBtn>
        <ToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")} label="Eraser">
          <EraseI />
        </ToolBtn>
        <ToolBtn active={tool === "text"} onClick={() => setTool("text")} label="Text note">
          <TextI />
        </ToolBtn>
        <div className="mc-toolrail-sep" />
        <ToolBtn
          onClick={() => {
            inkRef.current?.clear();
            notesRef.current?.clear();
            annoRef.current?.clear();
          }}
          label="Clear notes & marks"
        >
          <TrashI />
        </ToolBtn>
      </div>

      {/* Bottom lesson controls — next topic lives here (thumb reach), not as a floating banner */}
      <div className="mc-controls" data-no-pan data-finished={finished || undefined}>
        <button className="mc-ctrl" onClick={onRestart} aria-label="Restart" title="Restart lesson">
          ↺
        </button>
        <button
          className="mc-ctrl"
          onClick={onPrev}
          disabled={stepIndex === 0}
          aria-label="Previous step"
          title="Previous"
        >
          ‹
        </button>
        {finished ? (
          <button
            className="mc-ctrl mc-ctrl--continue"
            onClick={() => onNextModule?.()}
            aria-label={nextModule ? `Continue to ${nextModule.title}` : "Back to path"}
            title={nextModule ? `Continue · ${nextModule.title}` : "Back to path"}
          >
            {nextModule ? "Continue" : "Path"}
          </button>
        ) : (
          <button
            className="mc-ctrl mc-ctrl--continue"
            onClick={onNext}
            aria-label="Continue to next section"
            title="Continue"
          >
            Continue
          </button>
        )}
        <span className="mc-ctrl-sep" />
        <div className="mc-progress">
          {script.steps.map((s, i) => (
            <button
              key={i}
              className="mc-progress-tick"
              data-active={i === stepIndex}
              data-done={i < stepIndex}
              onClick={() => goto(i)}
              title={s.title}
            />
          ))}
        </div>
        <div className="mc-count">
          {stepIndex + 1} / {total}
        </div>
        {finished && nextModule ? (
          <span className="mc-continue-hint" title={nextModule.title}>
            <span className="mc-continue-hint-label">next lesson</span>
            <span className="mc-continue-hint-title">{nextModule.title}</span>
          </span>
        ) : !finished && script.steps[stepIndex + 1] ? (
          <span className="mc-continue-hint" title={script.steps[stepIndex + 1].title}>
            <span className="mc-continue-hint-label">up next</span>
            <span className="mc-continue-hint-title">{script.steps[stepIndex + 1].title}</span>
          </span>
        ) : null}
        <span className="mc-ctrl-sep mc-ctrl-sep--end" />
        <button className="mc-ctrl mc-ctrl--ghost" onClick={onWriteMath}>
          ✏️ write math
        </button>
      </div>

      {/* Zoom */}
      <div className="mc-zoom" data-no-pan>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.2)}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="mc-zoom-fit"
          onClick={resetView}
          aria-label="Fit board"
          title="Fit"
        >
          {Math.round(view.scale * 100)}%
        </button>
        <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in" title="Zoom in">
          +
        </button>
      </div>
    </div>
  );
}

function revealText(
  full: string,
  charsRevealed: number,
  active: boolean,
): { shown: string; showCaret: boolean } {
  // Completed / inactive beats always show the full string — never leave an
  // odd-length title stuck mid-word (the old +2 typewriter bug).
  if (!active || !Number.isFinite(charsRevealed) || charsRevealed >= full.length) {
    return { shown: full, showCaret: false };
  }
  return { shown: full.slice(0, Math.max(0, charsRevealed)), showCaret: true };
}

function BeatView({
  beat,
  beatIndex,
  charsRevealed,
  active,
  past,
  current,
  picked,
  onPick,
  paraParams,
  onParaChange,
  stepIndex,
  stepTotal,
  visualSceneIndex,
  onVisualSceneChange,
}: {
  beat: Beat;
  beatIndex: number;
  charsRevealed: number;
  active: boolean;
  past?: boolean;
  current?: boolean;
  picked: Record<number, number>;
  onPick: (bi: number, oi: number) => void;
  paraParams: { a: number; b: number; c: number } | null;
  onParaChange: (p: { a: number; b: number; c: number }) => void;
  stepIndex: number;
  stepTotal: number;
  visualSceneIndex: number;
  onVisualSceneChange: (index: number) => void;
}) {
  const base = { position: "absolute" as const, left: beat.x, top: beat.y };
  const stateAttr = { "data-beat-state": past ? "past" : current ? "current" : undefined };
  if (beat.kind === "title") {
    const { shown, showCaret } = revealText(beat.text, charsRevealed, active);
    return (
      <div style={base} className={`mc-title mc-title--${beat.size}`} {...stateAttr}>
        {shown}
        {showCaret && <Caret />}
      </div>
    );
  }
  if (beat.kind === "text") {
    const { shown, showCaret } = revealText(beat.text, charsRevealed, active);
    return (
      <div style={base} className="mc-text" {...stateAttr}>
        <MathText text={shown} />
        {showCaret && <Caret />}
      </div>
    );
  }
  if (beat.kind === "math") {
    const hand = toHandMath(beat.latex);
    const { shown, showCaret } = revealText(hand, charsRevealed, active);
    return (
      <div style={base} className="mc-math" {...stateAttr}>
        {shown ? <Equation>{shown}</Equation> : null}
        {showCaret && <Caret />}
      </div>
    );
  }
  if (beat.kind === "options") {
    const pick = picked[beatIndex];
    const correctIdx = beat.options.findIndex((o) => o === beat.answer);
    return (
      <div
        style={{ ...base, pointerEvents: "auto" }}
        className="mc-options"
        data-no-pan
        {...stateAttr}
      >
        {beat.options.map((o, i) => {
          const state =
            pick == null ? "" : i === correctIdx ? "correct" : i === pick ? "wrong" : "";
          return (
            <button
              key={i}
              className="mc-option"
              data-state={state || undefined}
              onClick={() => onPick(beatIndex, i)}
            >
              <span className="mc-option-key">{String.fromCharCode(65 + i)}</span>
              <Equation>{toHandMath(o)}</Equation>
            </button>
          );
        })}
      </div>
    );
  }
  if (beat.kind === "visual") {
    return (
      <div
        style={{ ...base, width: beat.w, height: beat.h, pointerEvents: "auto" }}
        className="mc-diagram mc-diagram--concept tutor-fade-in"
        data-no-pan
      >
        <ConceptAnimationPlayer
          animation={beat.animation}
          stepIndex={stepIndex}
          stepTotal={stepTotal}
          width={beat.w - 36}
          height={beat.h - 36}
          plotOverride={paraParams}
          sceneIndex={visualSceneIndex}
          onSceneChange={onVisualSceneChange}
          onPlotChange={onParaChange}
        />
      </div>
    );
  }
  if (beat.kind === "diagram") {
    return (
      <div
        style={{ ...base, width: beat.w, height: beat.h, pointerEvents: "auto" }}
        className="mc-diagram tutor-fade-in"
        data-no-pan
      >
        <ParabolaWidget
          width={beat.w}
          height={beat.h}
          initial={beat.params}
          value={paraParams ?? beat.params}
          onChange={onParaChange}
        />
      </div>
    );
  }
  return null;
}

function Caret() {
  return <span aria-hidden className="mc-caret" />;
}

function ToolBtn({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="mc-tool"
      data-active={active ? "true" : undefined}
      onClick={onClick}
      aria-label={label}
      data-tip={label}
    >
      {children}
    </button>
  );
}

const svgProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const HandI = () => (
  <svg {...svgProps}>
    <path d="M7 11V6a1.5 1.5 0 013 0v4M10 10V4.5a1.5 1.5 0 013 0V10M13 10V6a1.5 1.5 0 013 0v6M16 10.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1.5a5 5 0 01-3.5-1.5L4 15" />
  </svg>
);
const PenI = () => (
  <svg {...svgProps}>
    <path d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5z" />
  </svg>
);
const HighI = () => (
  <svg {...svgProps}>
    <path d="M4 20h16M6 16l6-6 6 6-3 3H9l-3-3zM12 10l4-4 2 2-4 4" />
  </svg>
);
const EraseI = () => (
  <svg {...svgProps}>
    <path d="M3 17l7-7 7 7-4 4H7l-4-4z" />
    <path d="M14 6l4 4" />
  </svg>
);
const TextI = () => (
  <svg {...svgProps}>
    <path d="M5 5h14M12 5v14M9 19h6" />
  </svg>
);
const TrashI = () => (
  <svg {...svgProps}>
    <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13h10l1-13" />
  </svg>
);
