import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MathText, normalizeMathNotation, splitMathText } from "@/lib/math-text";

describe("math-aware tutor text", () => {
  it("extracts inline LaTeX without treating the surrounding explanation as math", () => {
    expect(splitMathText("Use $x = \\frac{-b}{2a}$ for the vertex.")).toEqual([
      { kind: "text", value: "Use " },
      { kind: "math", value: "x = \\frac{-b}{2a}" },
      { kind: "text", value: " for the vertex." },
    ]);
  });

  it("recognizes an unwrapped equation emitted by an older agent prompt", () => {
    expect(splitMathText("y = -(2)^2 + 4(2)")).toEqual([
      { kind: "math", value: "y = -(2)^2 + 4(2)" },
    ]);
  });

  it("keeps ordinary transcript prose as prose", () => {
    expect(splitMathText("The vertex is where the curve turns.")).toEqual([
      { kind: "text", value: "The vertex is where the curve turns." },
    ]);
  });

  it("normalizes common spoken-board glyphs for KaTeX", () => {
    expect(normalizeMathNotation("x² − 4 × 2")).toBe("x^{2} - 4 \\times 2");
  });

  it("renders a delimited fraction through KaTeX", () => {
    const html = renderToStaticMarkup(createElement(MathText, { text: "$x = \\frac{-b}{2a}$" }));
    expect(html).toContain('class="katex"');
    expect(html).toContain('class="mfrac"');
  });
});
