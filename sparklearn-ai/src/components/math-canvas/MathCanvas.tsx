import { useEffect, useMemo, useRef, useState } from "react";
import { InlineMath } from "react-katex";
import type { LessonScript } from "@/lib/types";
import { InkCanvas, type InkHandle, type MCTool } from "./ink-canvas";
import { TextNotes, type NotesHandle } from "./text-notes";
import { ParabolaWidget } from "./parabola-widget";
import { layoutScript, BOARD_W, type Beat } from "./layout";

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
const CHAR_MS = 18;

export interface MathCanvasProps {
  script: LessonScript;
  stepIndex: number;
  goto: (i: number) => void;
  demoActive: boolean;
  onWriteMath: () => void;
  onOpenLive: () => void;
}

export function MathCanvas(props: MathCanvasProps) {
  const { script, stepIndex, goto, onWriteMath } = props;
  const [tool, setTool] = useState<MCTool>("pan");
  const inkRef = useRef<InkHandle | null>(null);
  const notesRef = useRef<NotesHandle | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const { beats, height: BOARD_H } = useMemo(() => layoutScript(script), [script]);
  // Per-option answer state, keyed by beat index
  const [picked, setPicked] = useState<Record<number, number>>({});

  // Viewport size (for full-screen ink layer)
  const [vp, setVp] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setVp({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Playback state: auto-plays every step; pause/next/restart mimic reference
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Reveal state: which beats are visible for the current stepIndex
  const visibleBeats = useMemo(() => beats.filter((b) => b.step <= stepIndex), [beats, stepIndex]);
  const activeBeats = useMemo(() => beats.filter((b) => b.step === stepIndex), [beats, stepIndex]);

  // typewriter for beats of the newly-revealed step (always on; pausable)
  const [chars, setChars] = useState<Record<number, number>>({});
  const [stepDone, setStepDone] = useState(false);
  useEffect(() => {
    setChars({});
    setStepDone(false);
    const typingBeats = beats
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.step === stepIndex && (b.kind === "title" || b.kind === "text" || b.kind === "math"));
    let cancelled = false;
    (async () => {
      for (const { b, i } of typingBeats) {
        const total = b.kind === "math" ? (b as any).latex.length : (b as any).text.length;
        for (let n = 0; n <= total; n += 2) {
          if (cancelled) return;
          while (!playingRef.current && !cancelled) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 100));
          }
          setChars((c) => ({ ...c, [i]: n }));
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, CHAR_MS));
        }
      }
      if (!cancelled) setStepDone(true);
    })();
    return () => { cancelled = true; };
  }, [stepIndex, beats]);

  // Auto-advance to next step when current step finishes typing (like reference)
  useEffect(() => {
    if (!playing || !stepDone) return;
    if (stepIndex >= script.steps.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => goto(stepIndex + 1), 650);
    return () => clearTimeout(t);
  }, [stepDone, playing, stepIndex, script.steps.length, goto]);

  // Fit to viewport and top-align on mount / script change
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const padTop = 96; // clear the topbar
    const scale = Math.min(1, (el.clientWidth - 160) / BOARD_W);
    setView({ scale, x: (el.clientWidth - BOARD_W * scale) / 2, y: padTop });
  }, [BOARD_H]);

  // Bring active step near the top of the viewport when it changes
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const first = activeBeats[0];
    if (!first) return;
    const v = viewRef.current;
    const targetY = 140 - first.y * v.scale;
    setView({ ...v, y: targetY });
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
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const k = next / v.scale;
        setView({ scale: next, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Pan drag
  const panning = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
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
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * f));
    const k = next / v.scale;
    setView({ scale: next, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
  };
  const resetView = () => {
    const el = viewportRef.current;
    if (!el) return;
    const scale = Math.min(1, (el.clientWidth - 160) / BOARD_W);
    setView({ scale, x: (el.clientWidth - BOARD_W * scale) / 2, y: 96 });
  };

  const total = script.steps.length;

  const onRestart = () => { goto(0); setPlaying(true); };
  const onNext = () => {
    // If typewriter still running, first jump to end of current step
    if (!stepDone) { setStepDone(true); setChars({}); return; }
    if (stepIndex < total - 1) goto(stepIndex + 1);
  };
  const onPrev = () => { if (stepIndex > 0) goto(stepIndex - 1); };

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
            {visibleBeats.map((b, i) => (
              <BeatView
                key={i}
                beat={b}
                beatIndex={beats.indexOf(b)}
                charsRevealed={chars[beats.indexOf(b)] ?? Infinity}
                picked={picked}
                onPick={(bi, oi) => setPicked((p) => ({ ...p, [bi]: oi }))}
              />
            ))}
          </div>
          <TextNotes tool={tool} width={BOARD_W} height={BOARD_H} overlayRef={notesRef} />
        </div>
      </div>

      {/* Full-viewport ink layer — draw anywhere, not just on the board */}
      {vp.w > 0 && (
        <div className="mc-ink-layer" style={{ pointerEvents: tool === "pen" || tool === "highlighter" || tool === "eraser" ? "auto" : "none" }}>
          <InkCanvas ref={inkRef} width={vp.w} height={vp.h} tool={tool} />
        </div>
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

      {/* Bottom lesson controls — restart / play-pause / next like the reference */}
      <div className="mc-controls" data-no-pan>
        <button className="mc-ctrl" onClick={onRestart} aria-label="Restart" title="Restart">↺</button>
        <button className="mc-ctrl" onClick={onPrev} disabled={stepIndex === 0} aria-label="Previous step" title="Previous">‹</button>
        <button
          className="mc-ctrl mc-ctrl--primary"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button className="mc-ctrl" onClick={onNext} disabled={stepIndex >= total - 1 && stepDone} aria-label="Next step" title="Next">›</button>
        <span className="mc-ctrl-sep" />
        <div className="mc-progress">
          {script.steps.map((s, i) => (
            <button key={i} className="mc-progress-tick" data-active={i === stepIndex} data-done={i < stepIndex} onClick={() => goto(i)} title={s.title} />
          ))}
        </div>
        <div className="mc-count">{stepIndex + 1} / {total}</div>
        <span className="mc-ctrl-sep" />
        <button className="mc-ctrl mc-ctrl--ghost" onClick={onWriteMath}>✏️ write math</button>
      </div>

      {/* Zoom */}
      <div className="mc-zoom" data-no-pan>
        <button onClick={() => zoomBy(1 / 1.2)} title="Zoom out">−</button>
        <button onClick={resetView} title="Fit">{Math.round(view.scale * 100)}%</button>
        <button onClick={() => zoomBy(1.2)} title="Zoom in">+</button>
      </div>
    </div>
  );
}

function BeatView({ beat, beatIndex, charsRevealed, picked, onPick }: {
  beat: Beat; beatIndex: number; charsRevealed: number;
  picked: Record<number, number>; onPick: (bi: number, oi: number) => void;
}) {
  const base = { position: "absolute" as const, left: beat.x, top: beat.y };
  if (beat.kind === "title") {
    const shown = beat.text.slice(0, charsRevealed);
    return (
      <div style={base} className={`mc-title mc-title--${beat.size} tutor-serif`}>
        {shown}
        {charsRevealed < beat.text.length && <Caret />}
      </div>
    );
  }
  if (beat.kind === "text") {
    const shown = beat.text.slice(0, charsRevealed);
    return (
      <div style={base} className="mc-text">
        {shown}
        {charsRevealed < beat.text.length && <Caret />}
      </div>
    );
  }
  if (beat.kind === "math") {
    const shown = beat.latex.slice(0, charsRevealed);
    return (
      <div style={base} className="mc-math tutor-fade-in">
        {shown.trim() ? <InlineMath math={shown} /> : null}
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
              <InlineMath math={o} />
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