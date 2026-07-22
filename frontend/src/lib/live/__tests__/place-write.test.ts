import { describe, it, expect } from "vitest";
import {
  estimateWriteSize,
  findFreeWriteSpot,
  rectsOverlap,
  writeBlockRect,
} from "@/lib/live/place-write";

describe("place-write free space", () => {
  const region = { x: 0, y: 0, w: 1600, h: 900 };

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
      region,
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
      region,
      occupied,
    });
    const box = writeBlockRect(at, lines);
    expect(rectsOverlap(box, occupied[0]!)).toBe(false);
    // Should land in free space further down or to the side
    expect(box.y + box.h).toBeLessThanOrEqual(region.h);
  });

  it("writes onto the CURRENT page, not back at board origin", () => {
    // Deck page 3 lives at world x ∈ [4800, 6400]. A write here must stay there,
    // otherwise it lands off-screen for a learner who advanced past page 0.
    const page3 = { x: 4800, y: 0, w: 1600, h: 820 };
    const at = findFreeWriteSpot({
      anchor: { x: page3.x + 120, y: 160 },
      place: "below",
      lines: ["a = 2, b = 4, c = -5"],
      region: page3,
      occupied: [],
    });
    const box = writeBlockRect(at, ["a = 2, b = 4, c = -5"]);
    expect(box.x).toBeGreaterThanOrEqual(page3.x);
    expect(box.x + box.w).toBeLessThanOrEqual(page3.x + page3.w);
  });

  it("avoids stacking on a previous write block", () => {
    const lines = ["factored:", "(x-2)(x-3)"];
    const first = writeBlockRect({ x: 80, y: 400 }, lines);
    const at = findFreeWriteSpot({
      anchor: { x: 80, y: 380 },
      place: "below",
      lines,
      region,
      occupied: [first],
    });
    expect(rectsOverlap(writeBlockRect(at, lines), first)).toBe(false);
  });
});
