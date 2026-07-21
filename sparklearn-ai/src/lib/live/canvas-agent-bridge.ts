import type { LumenCanvasController } from "@/components/math-canvas/annotation-layer";
import type { ResolvedTargets } from "./board-targets";

export type View = { x: number; y: number; scale: number };
export type WPoint = { x: number; y: number };

export interface CanvasControllerHandle {
  anno: () => LumenCanvasController | null;
  targets: ResolvedTargets;
  getView: () => View;
  setView: (v: View) => void;
  viewportEl: () => HTMLElement | null;
  screenToWorld: (sx: number, sy: number) => WPoint;
  worldToScreen: (wx: number, wy: number) => WPoint;
  boardSize: { w: number; h: number };
}

let handle: CanvasControllerHandle | null = null;
export function setCanvasController(h: CanvasControllerHandle | null) {
  handle = h;
}
export function getCanvasController(): CanvasControllerHandle | null {
  return handle;
}
