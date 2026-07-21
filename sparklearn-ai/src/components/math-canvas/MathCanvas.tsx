import { useEffect, useMemo, useRef, useState } from "react";
import type { LessonScript } from "@/lib/types";
import { InkCanvas, type InkHandle, type MCTool } from "./ink-canvas";
import { TextNotes, type NotesHandle } from "./text-notes";
import { ParabolaWidget } from "./parabola-widget";
import { layoutScript, BOARD_W, type Beat } from "./layout";
import { Equation, toHandMath } from "./equation";
import { useBeatPlayer } from "./use-beat-player";

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

function estimateBeatBox(beat: Beat): Bounds {
  if (beat.kind === "title") {
    return { x: beat.x, y: beat.y, w: beat.size === "h1" ? 900 : 640, h: beat.size === "h1" ? 72 : 44 };
  }
  if (beat.kind === "text") {
    const lines = Math.max(1, Math.ceil(beat.text.length / 62));
    return { x: beat.x, y: beat.y, w: 640, h: 34 * lines };
  }
  if (beat.kind === "math") return { x: beat.x, y: beat.y, w: 520, h: 56 };
  if (beat.kind === "options") return { x: beat.x, y: beat.y, w: 620, h: 100 };
  return { x: beat.x, y: beat.y, w: beat.w, h: beat.h };
}

function unionBounds(beats: Beat[], boardH: number): Bounds {
  if (beats.length === 0) return { x: 0, y: 0, w: BOARD_W, h: boardH };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const beat of beats) {
    const b = estimateBeatBox(beat);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const margin = 48;
  return {
    x: Math.max(0, minX - margin),
    y: Math.max(0, minY - margin),
    w: Math.min(BOARD_W, maxX + margin) - Math.max(0, minX - margin),
    h: Math.min(boardH, maxY + margin) - Math.max(0, minY - margin),
  };
}

/** Fit + center bounds. On narrow screens, prioritize readable width and let the user pan vertically. */
function fitOverview(el: HTMLElement, bounds: Bounds): View {
  const pad = chromePad(el);
  const availW = Math.max(120, el.clientWidth - pad.left - pad.right);
  const availH = Math.max(120, el.clientHeight - pad.top - pad.bottom);
  const narrow = el.clientWidth < 720;

  let scale: number;
  if (narrow) {
    // Width-first: keep handwriting readable; vertical overflow is pannable
    scale = Math.min(1.05, availW / Math.max(bounds.w, 1));
  } else {
    scale = Math.min(1, availW / bounds.w, availH / bounds.h);
  }

  const x = pad.left + (availW - bounds.w * scale) / 2 - bounds.x * scale;
  const y = narrow
    ? pad.top - bounds.y * scale + 8
    : pad.top + (availH - bounds.h * scale) / 2 - bounds.y * scale;
  return { x, y, scale };
}

/** Soft follow: only nudge if the active beat sits outside a safe inset. */
function ensureInView(el: HTMLElement, view: View, beat: Beat): View {
  const pad = chromePad(el);
  const box = estimateBeatBox(beat);
  const left = view.x + box.x * view.scale;
  const top = view.y + box.y * view.scale;
  const right = left + box.w * view.scale;
  const bottom = top + box.h * view.scale;
  const inset = {
    l: pad.left + 16,
    r: el.clientWidth - pad.right - 16,
    t: pad.top + 16,
    b: el.clientHeight - pad.bottom - 16,
  };

  let dx = 0;
  let dy = 0;
  if (left < inset.l) dx = inset.l - left;
  else if (right > inset.r) dx = inset.r - right;
  if (top < inset.t) dy = inset.t - top;
  else if (bottom > inset.b) dy = inset.b - bottom;

  if (dx === 0 && dy === 0) return view;
  return { ...view, x: view.x + dx, y: view.y + dy };
}

export interface MathCanvasProps {
  script: LessonScript;
  stepIndex: number;
  goto: (i: number) => void;
  demoActive: boolean;
  onWriteMath: () => void;
  onOpenLive: () => void;
  nextModule?: { id: string; title: string } | null;
  onNextModule?: () => void;
}

export function MathCanvas(props: MathCanvasProps) {
  const { script, stepIndex, goto, onWriteMath, nextModule, onNextModule } = props;
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
  const panning = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const { beats, height: BOARD_H } = useMemo(() => layoutScript(script), [script]);

  // Viewport size (for full-screen ink layer)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setVp({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Playback — timer-based +1 char typewriter (same model as math-canvas-ai)
  const player = useBeatPlayer({
    beats,
    stepIndex,
    totalSteps: script.steps.length,
    lessonKey: script.moduleId,
    onAdvanceStep: () => goto(stepIndex + 1),
  });
  const { state: playerState, play, pause, restart, next, charsFor } = player;

  const activeBeats = useMemo(() => beats.filter((b) => b.step === stepIndex), [beats, stepIndex]);
  const visibleBeats = useMemo(
    () =>
      beats.filter((b, i) => {
        if (b.step > stepIndex) return false;
        if (b.step < stepIndex) return true;
        if (b.kind === "options" || b.kind === "diagram") return playerState.stepDone;
        if (i === playerState.activeBeatIndex) return true;
        return charsFor(i) > 0;
      }),
    [beats, stepIndex, playerState.stepDone, playerState.activeBeatIndex, charsFor],
  );

  // Full-lesson overview: fit all content into view.
  // Re-fits on script change and significant viewport changes (orientation / resize).
  const applyOverview = () => {
    const el = viewportRef.current;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
    setView(fitOverview(el, unionBounds(beats, BOARD_H)));
  };

  useEffect(() => {
    if (vp.w === 0 || vp.h === 0) return;
    const scriptKey = `${script.title}:${BOARD_H}:${beats.length}`;
    const last = lastFitVpRef.current;
    const scriptChanged = fittedKeyRef.current !== scriptKey;
    const sizeChanged =
      last.w === 0 ||
      Math.abs(vp.w - last.w) > 64 ||
      Math.abs(vp.h - last.h) > 64;
    if (!scriptChanged && !sizeChanged) return;
    fittedKeyRef.current = scriptKey;
    lastFitVpRef.current = { w: vp.w, h: vp.h };
    applyOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [BOARD_H, beats, script.title, vp.w, vp.h]);

  // Soft-follow the active step — only nudge if it would leave the safe inset
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const first = activeBeats[0];
    if (!first) return;
    // Skip until the initial overview has been applied
    if (!fittedKeyRef.current) return;
    setView((v) => ensureInView(el, v, first));
  }, [stepIndex, activeBeats]);

  // Wheel: pinch-zoom or pan
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
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
    const d = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat) setSpaceDown(true); };
    const u = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => { window.removeEventListener("keydown", d); window.removeEventListener("keyup", u); };
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
    const p = panning.current;
    setView({ ...viewRef.current, x: p.ox + (e.clientX - p.x), y: p.oy + (e.clientY - p.y) });
  };
  const onUp = () => { panning.current = null; };

  const zoomBy = (f: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
    const v = viewRef.current;
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * f));
    const k = nextScale / v.scale;
    setView({ scale: nextScale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
  };
  const resetView = () => {
    applyOverview();
  };

  const total = script.steps.length;

  const onRestart = () => {
    // Step change resets the playhead; only call restart when already on step 0
    if (stepIndex !== 0) {
      goto(0);
      return;
    }
    restart();
  };
  const onNext = () => next();
  const onPrev = () => {
    if (stepIndex > 0) goto(stepIndex - 1);
  };
  const onTogglePlay = () => {
    if (playerState.finished) {
      // Full replay from the start so pause/play works again
      if (stepIndex !== 0) goto(0);
      else play();
      return;
    }
    if (playerState.playing) pause();
    else play();
  };

  return (
    <div
      ref={viewportRef}
      className="mc-viewport"
      style={{ cursor: panning.current ? "grabbing" : panActive ? "grab" : "default" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div
        className="mc-world"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <div className="mc-board" style={{ width: BOARD_W, height: BOARD_H }}>
          <div className="mc-lesson-layer" style={{ pointerEvents: "none" }}>
            {visibleBeats.map((b) => {
              const beatIndex = beats.indexOf(b);
              return (
                <BeatView
                  key={beatIndex}
                  beat={b}
                  beatIndex={beatIndex}
                  charsRevealed={charsFor(beatIndex)}
                  active={beatIndex === playerState.activeBeatIndex && !playerState.stepDone && !playerState.finished}
                  picked={picked}
                  onPick={(bi, oi) => setPicked((p) => ({ ...p, [bi]: oi }))}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Full-viewport ink + text — annotate anywhere, not just the board */}
      {vp.w > 0 && (
        <>
          <div
            className="mc-ink-layer"
            style={{ pointerEvents: tool === "pen" || tool === "highlighter" || tool === "eraser" ? "auto" : "none" }}
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
        <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} label="Pan"><HandI /></ToolBtn>
        <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} label="Pen"><PenI /></ToolBtn>
        <ToolBtn active={tool === "highlighter"} onClick={() => setTool("highlighter")} label="Highlighter"><HighI /></ToolBtn>
        <ToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")} label="Eraser"><EraseI /></ToolBtn>
        <ToolBtn active={tool === "text"} onClick={() => setTool("text")} label="Text note"><TextI /></ToolBtn>
        <div className="mc-toolrail-sep" />
        <ToolBtn onClick={() => { inkRef.current?.clear(); notesRef.current?.clear(); }} label="Clear notes"><TrashI /></ToolBtn>
      </div>

      {/* Bottom lesson controls — next topic lives here (thumb reach), not as a floating banner */}
      <div className="mc-controls" data-no-pan data-finished={playerState.finished || undefined}>
        <button className="mc-ctrl" onClick={onRestart} aria-label="Restart" title="Restart lesson">↺</button>
        <button className="mc-ctrl" onClick={onPrev} disabled={stepIndex === 0} aria-label="Previous step" title="Previous">‹</button>
        {playerState.finished ? (
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
            className="mc-ctrl mc-ctrl--primary"
            onClick={onTogglePlay}
            aria-label={playerState.playing ? "Pause" : "Play"}
            title={playerState.playing ? "Pause" : "Play"}
          >
            {playerState.playing ? "❚❚" : "▶"}
          </button>
        )}
        <button
          className="mc-ctrl"
          onClick={() => {
            // › is step control only while learning; module jump only after the lesson ends
            if (playerState.finished) onNextModule?.();
            else onNext();
          }}
          aria-label={playerState.finished ? (nextModule ? "Next topic" : "Back to path") : "Next step"}
          title={playerState.finished ? (nextModule ? `Next: ${nextModule.title}` : "Back to path") : "Next step"}
        >
          ›
        </button>
        <span className="mc-ctrl-sep" />
        <div className="mc-progress">
          {script.steps.map((s, i) => (
            <button key={i} className="mc-progress-tick" data-active={i === stepIndex} data-done={i < stepIndex} onClick={() => goto(i)} title={s.title} />
          ))}
        </div>
        <div className="mc-count">{stepIndex + 1} / {total}</div>
        {playerState.finished && nextModule ? (
          <span className="mc-continue-hint" title={nextModule.title}>
            <span className="mc-continue-hint-label">up next</span>
            <span className="mc-continue-hint-title">{nextModule.title}</span>
          </span>
        ) : null}
        <span className="mc-ctrl-sep mc-ctrl-sep--end" />
        <button className="mc-ctrl mc-ctrl--ghost" onClick={onWriteMath}>✏️ write math</button>
      </div>

      {/* Zoom */}
      <div className="mc-zoom" data-no-pan>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out" title="Zoom out">−</button>
        <button type="button" className="mc-zoom-fit" onClick={resetView} aria-label="Fit board" title="Fit">
          {Math.round(view.scale * 100)}%
        </button>
        <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in" title="Zoom in">+</button>
      </div>
    </div>
  );
}

function revealText(full: string, charsRevealed: number, active: boolean): { shown: string; showCaret: boolean } {
  // Completed / inactive beats always show the full string — never leave an
  // odd-length title stuck mid-word (the old +2 typewriter bug).
  if (!active || !Number.isFinite(charsRevealed) || charsRevealed >= full.length) {
    return { shown: full, showCaret: false };
  }
  return { shown: full.slice(0, Math.max(0, charsRevealed)), showCaret: true };
}

function BeatView({ beat, beatIndex, charsRevealed, active, picked, onPick }: {
  beat: Beat; beatIndex: number; charsRevealed: number; active: boolean;
  picked: Record<number, number>; onPick: (bi: number, oi: number) => void;
}) {
  const base = { position: "absolute" as const, left: beat.x, top: beat.y };
  if (beat.kind === "title") {
    const { shown, showCaret } = revealText(beat.text, charsRevealed, active);
    return (
      <div
        style={base}
        className={`mc-title mc-title--${beat.size}`}
      >
        {shown}
        {showCaret && <Caret />}
      </div>
    );
  }
  if (beat.kind === "text") {
    const { shown, showCaret } = revealText(beat.text, charsRevealed, active);
    return (
      <div style={base} className="mc-text">
        {shown}
        {showCaret && <Caret />}
      </div>
    );
  }
  if (beat.kind === "math") {
    const hand = toHandMath(beat.latex);
    const { shown, showCaret } = revealText(hand, charsRevealed, active);
    return (
      <div style={base} className="mc-math">
        {shown ? <Equation>{shown}</Equation> : null}
        {showCaret && <Caret />}
      </div>
    );
  }
  if (beat.kind === "options") {
    const pick = picked[beatIndex];
    const correctIdx = beat.options.findIndex((o) => o === beat.answer);
    return (
      <div style={{ ...base, pointerEvents: "auto" }} className="mc-options" data-no-pan>
        {beat.options.map((o, i) => {
          const state = pick == null ? "" : i === correctIdx ? "correct" : i === pick ? "wrong" : "";
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
  if (beat.kind === "diagram") {
    return (
      <div
        style={{ ...base, width: beat.w, height: beat.h, pointerEvents: "auto" }}
        className="mc-diagram tutor-fade-in"
        data-no-pan
      >
        <ParabolaWidget width={beat.w} height={beat.h} initial={beat.params} />
      </div>
    );
  }
  return null;
}

function Caret() {
  return <span aria-hidden className="mc-caret" />;
}

function ToolBtn({ children, active, onClick, label }: { children: React.ReactNode; active?: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className="mc-tool" data-active={active ? "true" : undefined} onClick={onClick} aria-label={label} data-tip={label}>
      {children}
    </button>
  );
}

const svgProps = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const HandI = () => (<svg {...svgProps}><path d="M7 11V6a1.5 1.5 0 013 0v4M10 10V4.5a1.5 1.5 0 013 0V10M13 10V6a1.5 1.5 0 013 0v6M16 10.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1.5a5 5 0 01-3.5-1.5L4 15" /></svg>);
const PenI = () => (<svg {...svgProps}><path d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5z" /></svg>);
const HighI = () => (<svg {...svgProps}><path d="M4 20h16M6 16l6-6 6 6-3 3H9l-3-3zM12 10l4-4 2 2-4 4" /></svg>);
const EraseI = () => (<svg {...svgProps}><path d="M3 17l7-7 7 7-4 4H7l-4-4z" /><path d="M14 6l4 4" /></svg>);
const TextI = () => (<svg {...svgProps}><path d="M5 5h14M12 5v14M9 19h6" /></svg>);
const TrashI = () => (<svg {...svgProps}><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13h10l1-13" /></svg>);