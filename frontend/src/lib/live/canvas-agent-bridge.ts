import type { LumenCanvasController } from "@/components/math-canvas/annotation-layer";
import type { ResolvedTargets } from "./board-targets";
import type { WRect } from "./place-write";

export type View = { x: number; y: number; scale: number };
export type WPoint = { x: number; y: number };

export interface CanvasControllerHandle {
  anno: () => LumenCanvasController | null;
  targets: ResolvedTargets;
  getView: () => View;
  setView: (v: View) => void;
  viewportEl: () => HTMLElement | null;
  /** `.mc-board` element — used to measure lesson content for free-space writes. */
  boardEl?: () => HTMLElement | null;
  /** Stable world-space bounds for every lesson beat, including beats outside the camera. */
  lessonRects?: WRect[];
  /** Keep lesson playback from taking the camera back while an AI write animates. */
  suspendLessonFollow?: (ms: number) => void;
  screenToWorld: (sx: number, sy: number) => WPoint;
  worldToScreen: (wx: number, wy: number) => WPoint;
  boardSize: { w: number; h: number };
  /** Drive the live parabola widget (sliders + curve), not just an overlay stroke. */
  setParabola?: (a: number, b: number, c: number) => void;
  /** Select the same generated visual scene the learner can choose from the tabs. */
  setVisualScene?: (index: number) => void;
}

let handle: CanvasControllerHandle | null = null;
export function setCanvasController(h: CanvasControllerHandle | null) {
  handle = h;
}
export function getCanvasController(): CanvasControllerHandle | null {
  return handle;
}
