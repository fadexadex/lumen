import { describe, expect, it } from "vitest";
import { consumeSseBuffer } from "../client";
import type { CourseStreamEvent } from "../types";

describe("course SSE parser", () => {
  it("handles CRLF frames and preserves an incomplete trailing frame", () => {
    const events: CourseStreamEvent[] = [];
    const remainder = consumeSseBuffer(
      'event: course\r\ndata: {"type":"course","id":"c_1","topic":"Algebra"}\r\n\r\nevent: done\r\ndata:',
      (event) => events.push(event),
    );

    expect(events).toEqual([{ type: "course", id: "c_1", topic: "Algebra" }]);
    expect(remainder).toBe("event: done\ndata:");
  });
});
