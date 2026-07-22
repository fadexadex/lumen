import { describe, it, expect } from "vitest";
import { toHandMath } from "../equation";

describe("toHandMath — math delimiters never render as glyphs", () => {
  it("strips $…$ wrappers from option / equation strings", () => {
    expect(toHandMath("$3x^2 - 5x + 2 = 0$")).not.toContain("$");
    expect(toHandMath("$x^2 + 7 = 0$")).toBe("x^2 + 7 = 0");
  });

  it("strips $$…$$ and \\(…\\) / \\[…\\] delimiters", () => {
    expect(toHandMath("$$x^2$$")).toBe("x^2");
    expect(toHandMath("\\(4x - 9 = 0\\)")).not.toMatch(/[\\()]/);
    expect(toHandMath("\\[-x^2 + 6x = 0\\]")).not.toContain("$");
  });
});
