/** Find a free spot on the board for Lumen write-on-board blocks. */

export type WRect = { x: number; y: number; w: number; h: number };
export type WPoint = { x: number; y: number };
export type Place = "above" | "below" | "left" | "right";

const PAD = 16;
const LINE_H = 40;
const CHAR_W = 11;

export function estimateWriteSize(lines: string[]): { w: number; h: number } {
  const maxLen = Math.max(...lines.map((l) => l.length), 8);
  return {
    w: Math.min(520, 28 + maxLen * CHAR_W),
    h: 16 + Math.max(lines.length, 1) * LINE_H,
  };
}

/** Bounding box for a write block whose top-left text origin is `at` (matches WriteBlockView). */
export function writeBlockRect(at: WPoint, lines: string[]): WRect {
  const size = estimateWriteSize(lines);
  return { x: at.x - 12, y: at.y - 8, w: size.w, h: size.h };
}

export function rectsOverlap(a: WRect, b: WRect, pad = PAD): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

export function offsetPlace(at: WPoint, place: Place): WPoint {
  if (place === "above") return { x: at.x, y: at.y - 56 };
  if (place === "below") return { x: at.x, y: at.y + 44 };
  if (place === "left") return { x: at.x - 240, y: at.y };
  if (place === "right") return { x: at.x + 56, y: at.y };
  return at;
}

function clampPoint(at: WPoint, size: { w: number; h: number }, region: WRect): WPoint {
  const margin = 24;
  const minX = region.x + margin + 12;
  const minY = region.y + margin + 8;
  const maxX = Math.max(minX, region.x + region.w - size.w - margin + 12);
  const maxY = Math.max(minY, region.y + region.h - size.h - margin + 8);
  return {
    x: Math.min(maxX, Math.max(minX, at.x)),
    y: Math.min(maxY, Math.max(minY, at.y)),
  };
}

function isFree(candidate: WRect, occupied: WRect[]): boolean {
  return occupied.every((o) => !rectsOverlap(candidate, o));
}

/**
 * Prefer the requested place near the anchor; if that overlaps lesson/AI content,
 * sit just below the lowest occupied block in the reading column, then scan.
 *
 * `region` is the placement area in WORLD coords — the CURRENT lesson page, not
 * the whole board. The board is a horizontal deck now, so writing must land on
 * the page the learner is looking at; anchoring to the whole board dropped every
 * write back near page 0, invisible to a learner on a later page.
 */
export function findFreeWriteSpot(opts: {
  anchor: WPoint;
  place: Place;
  lines: string[];
  region: WRect;
  occupied: WRect[];
}): WPoint {
  const size = estimateWriteSize(opts.lines);
  const R = opts.region;
  const leftX = R.x + 60;
  const readingX = Math.min(Math.max(leftX, opts.anchor.x), R.x + R.w * 0.35);

  let contentBottom = R.y;
  for (const o of opts.occupied) {
    // Ignore huge spanning rects (e.g. full-board widgets) when computing "below content".
    if (o.w > R.w * 0.7 || o.h > R.h * 0.55) continue;
    // Only content within THIS page's x-band counts — other pages sit far along X.
    if (o.x + o.w < R.x || o.x > R.x + R.w) continue;
    contentBottom = Math.max(contentBottom, o.y + o.h);
  }

  const candidates: WPoint[] = [];

  // 1) Right next to the anchor (the learner's focus) — a write should appear
  //    where they are looking, so they barely have to move to read it.
  const order: Place[] = [opts.place, "below", "right", "left", "above"].filter(
    (p, i, arr) => arr.indexOf(p) === i,
  ) as Place[];
  for (const place of order) {
    candidates.push(offsetPlace(opts.anchor, place));
  }

  // 2) Then a clean spot just below the reading content as a fallback.
  if (contentBottom > R.y + 40) {
    candidates.push({ x: readingX, y: contentBottom + 32 });
    candidates.push({ x: readingX, y: contentBottom + 32 + size.h + 24 });
    candidates.push({ x: Math.min(readingX + 220, R.x + R.w * 0.45), y: contentBottom + 32 });
  }

  for (const raw of candidates) {
    const at = clampPoint(raw, size, R);
    if (isFree(writeBlockRect(at, opts.lines), opts.occupied)) return at;
  }

  // Coarse scan — stay in the left/center reading column of THIS page.
  const stepX = Math.max(72, Math.floor(size.w * 0.5));
  const stepY = Math.max(36, Math.floor(size.h * 0.65));
  const startY = Math.max(contentBottom + 24, opts.anchor.y, R.y + 48);
  for (let y = startY; y < R.y + R.h - size.h; y += stepY) {
    for (let x = leftX; x < R.x + R.w * 0.62; x += stepX) {
      const at = clampPoint({ x, y }, size, R);
      if (isFree(writeBlockRect(at, opts.lines), opts.occupied)) return at;
    }
  }

  // Last resort: full-page scan including the right side.
  for (let y = R.y + 48; y < R.y + R.h - size.h; y += stepY) {
    for (let x = leftX; x < R.x + R.w - size.w; x += stepX) {
      const at = clampPoint({ x, y }, size, R);
      if (isFree(writeBlockRect(at, opts.lines), opts.occupied)) return at;
    }
  }

  return clampPoint(
    { x: readingX, y: Math.max(contentBottom + 32, R.y + R.h - size.h - 40) },
    size,
    R,
  );
}

/**
 * Measure visible lesson DOM children in world coords.
 * `boardEl` is `.mc-board`; children under `.mc-lesson-layer` are beats.
 * `screenToWorld` expects viewport-local pixels (not clientX).
 */
export function measureLessonOccupied(
  boardEl: HTMLElement | null,
  viewportEl: HTMLElement | null,
  screenToWorld: (sx: number, sy: number) => WPoint,
): WRect[] {
  if (!boardEl || typeof boardEl.querySelectorAll !== "function") return [];
  const layer = boardEl.querySelector(".mc-lesson-layer");
  if (!layer) return [];
  const vp = viewportEl?.getBoundingClientRect();
  const ox = vp?.left ?? 0;
  const oy = vp?.top ?? 0;
  const out: WRect[] = [];
  const nodes = layer.querySelectorAll<HTMLElement>(":scope > *");
  const viewH = typeof window !== "undefined" ? window.innerHeight : 2000;
  nodes.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    // Only block space that's currently on screen — prior steps live further up the
    // board and shouldn't push new writing off the bottom of the camera.
    if (r.bottom < 8 || r.top > viewH - 8) return;
    const tl = screenToWorld(r.left - ox, r.top - oy);
    const br = screenToWorld(r.right - ox, r.bottom - oy);
    out.push({
      x: Math.min(tl.x, br.x),
      y: Math.min(tl.y, br.y),
      w: Math.abs(br.x - tl.x),
      h: Math.abs(br.y - tl.y),
    });
  });
  return out;
}
