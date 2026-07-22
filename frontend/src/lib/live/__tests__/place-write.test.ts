import { describe, it, expect } from "vitest";
import {
  estimateWriteSize,
  findFreeWriteSpot,
  rectsOverlap,
  writeBlockRect,
} from "@/lib/live/place-write";

describe("place-write free space", () => {
  const board = { w: 1600, h: 900 };

  it("estimates a sensible box from line lengths", () => {
    const s = estimateWriteSize(["Sample Quadratic Equation:", "y = x^2"]);
    expect(s.w).toBeGreaterThan(200);
    expect(s.h).toBe(16 + 2 * 40);
  });

  it("keeps preferred spot when nothing is occupied", () => {
    const at = findFreeWriteSpot({
      anchor: { x: 100, y: 100 },
      place: "below",
      lines: ["hello"],
      board,
      occupied: [],
    });
    expect(at.y).toBeGreaterThan(100);
    expect(at.x).toBeCloseTo(100, 0);
  });

  it("moves off overlapping lesson content", () => {
    const lines = ["Sample Quadratic Equation:", "y = x^2"];
    const preferred = writeBlockRect({ x: 120, y: 144 }, lines); // below {100,100}
    const occupied = [
      { x: 40, y: 40, w: 700, h: 220 }, // title + body covering preferred
    ];
    expect(rectsOverlap(preferred, occupied[0]!)).toBe(true);

    const at = findFreeWriteSpot({
      anchor: { x: 100, y: 100 },
      place: "below",
      lines,
      board,
      occupied,
    });
    const box = writeBlockRect(at, lines);
    expect(rectsOverlap(box, occupied[0]!)).toBe(false);
    // Should land in free space further down or to the side
    expect(box.y + box.h).toBeLessThanOrEqual(board.h);
  });

  it("avoids stacking on a previous write block", () => {
    const lines = ["factored:", "(x-2)(x-3)"];
    const first = writeBlockRect({ x: 80, y: 400 }, lines);
    const at = findFreeWriteSpot({
      anchor: { x: 80, y: 380 },
      place: "below",
      lines,
      board,
      occupied: [first],
    });
    expect(rectsOverlap(writeBlockRect(at, lines), first)).toBe(false);
  });
});
