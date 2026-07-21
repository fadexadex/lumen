import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/lessons/types";
import { DiagramLayer } from "./diagram-layer";
import { InkCanvas, type InkCanvasHandle } from "./ink-canvas";
import { LessonControls } from "./lesson-controls";
import { LessonLayer } from "./lesson-layer";
import { TextNotesOverlay, type TextNotesHandle } from "./text-notes-overlay";
import { Toolbar } from "./toolbar";
import type { Tool } from "./types";
import { useLessonPlayer } from "./use-lesson-player";

const BOARD_W = 1500;
const BOARD_H = 980;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;

export function Whiteboard({ lesson }: { lesson: Lesson }) {
  const [tool, setTool] = useState<Tool>("pan");
  const inkRef = useRef<InkCanvasHandle | null>(null);
  const textRef = useRef<TextNotesHandle | null>(null);
  const { state, play, pause, restart, next } = useLessonPlayer(lesson.steps);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  // Center the board on mount.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const scale = Math.min(
      1,
      Math.min(el.clientWidth / BOARD_W, el.clientHeight / BOARD_H),
    );
    const x = (el.clientWidth - BOARD_W * scale) / 2;
    const y = (el.clientHeight - BOARD_H * scale) / 2;
    setView({ x, y, scale });
  }, []);

  // Non-passive wheel: pinch-zoom (ctrl/meta) or two-finger pan.
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
        setView({
          scale: next,
          x: cx - (cx - v.x) * k,
          y: cy - (cy - v.y) * k,
        });
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Pan drag (hand tool, middle mouse, or space-held).
  const panning = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const [spaceDown, setSpaceDown] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const panActive = tool === "pan" || spaceDown;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(panActive || e.button === 1)) return;
    const target = e.target as Element | null;
    if (
      target &&
      target.closest("input, button, textarea, select, label, a, [data-no-pan]")
    ) {
      return;
    }
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    panning.current = {
      x: e.clientX,
      y: e.clientY,
      ox: viewRef.current.x,
      oy: viewRef.current.y,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panning.current) return;
    const p = panning.current;
    setView({ ...viewRef.current, x: p.ox + (e.clientX - p.x), y: p.oy + (e.clientY - p.y) });
  };
  const onPointerUp = () => {
    panning.current = null;
  };

  const resetView = () => {
    const el = viewportRef.current;
    if (!el) return;
    const scale = Math.min(
      1,
      Math.min(el.clientWidth / BOARD_W, el.clientHeight / BOARD_H),
    );
    setView({
      scale,
      x: (el.clientWidth - BOARD_W * scale) / 2,
      y: (el.clientHeight - BOARD_H * scale) / 2,
    });
  };

  const zoomBy = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    const v = viewRef.current;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
    const k = next / v.scale;
    setView({ scale: next, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
  };

  // Ink layer intercepts only for drawing/erasing tools. Diagrams stay interactive
  // whenever the user isn't drawing so sliders keep working.
  const drawing = tool === "pen" || tool === "highlighter" || tool === "eraser";

  return (
    <div
      ref={viewportRef}
      className="fixed inset-0 overflow-hidden bg-white"
      style={{
        touchAction: "none",
        cursor: panning.current
          ? "grabbing"
          : panActive
            ? "grab"
            : "default",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: "0 0",
        }}
      >
        <div
          className="relative bg-white shadow-[0_0_0_1px_#eee]"
          style={{ width: BOARD_W, height: BOARD_H }}
        >
          <LessonLayer steps={lesson.steps} state={state} />
          <InkCanvas ref={inkRef} width={BOARD_W} height={BOARD_H} tool={tool} />
          <DiagramLayer steps={lesson.steps} state={state} interactive={!drawing} />
          <TextNotesOverlay
            tool={tool}
            width={BOARD_W}
            height={BOARD_H}
            overlayRef={textRef}
          />
        </div>
      </div>

      <Toolbar
        tool={tool}
        onTool={setTool}
        onClear={() => {
          inkRef.current?.clear();
          textRef.current?.clear();
        }}
      />
      <LessonControls
        playing={state.playing}
        finished={state.finished}
        stepIndex={state.stepIndex}
        totalSteps={lesson.steps.length}
        onPlay={play}
        onPause={pause}
        onRestart={restart}
        onNext={next}
      />

      <div className="pointer-events-auto fixed bottom-6 right-6 z-30 flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1 shadow-sm">
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.2)}
          className="h-8 w-8 rounded-full text-neutral-700 hover:bg-neutral-100"
          title="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          className="h-8 min-w-14 rounded-full px-2 text-xs tabular-nums text-neutral-700 hover:bg-neutral-100"
          title="Reset view"
        >
          {Math.round(view.scale * 100)}%
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1.2)}
          className="h-8 w-8 rounded-full text-neutral-700 hover:bg-neutral-100"
          title="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
}