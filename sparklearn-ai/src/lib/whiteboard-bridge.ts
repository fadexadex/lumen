/**
 * Small bridge so non-Whiteboard components (like the math panel) can
 * drop content onto the current tldraw canvas without prop-drilling.
 * The Whiteboard registers its editor on mount; consumers call
 * `insertOnBoard(...)` when they need to write something for the child.
 */
let editor: any = null;

export function setWhiteboardEditor(e: any) {
  editor = e;
}

export function getWhiteboardEditor() {
  return editor;
}

/** Turn a LaTeX-ish string into something readable as plain whiteboard text. */
export function prettifyLatex(input: string): string {
  let s = input;
  s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
  s = s.replace(/\\sqrt\[3\]\{([^{}]*)\}/g, "∛($1)");
  s = s.replace(/\\sqrt/g, "√");
  s = s.replace(/\\pi/g, "π");
  s = s.replace(/\\pm/g, "±");
  s = s.replace(/\\le\b/g, "≤");
  s = s.replace(/\\ge\b/g, "≥");
  s = s.replace(/\\neq/g, "≠");
  s = s.replace(/\\times/g, "×");
  s = s.replace(/\\cdot/g, "·");
  s = s.replace(/\\div/g, "÷");
  s = s.replace(/\\log/g, "log");
  s = s.replace(/\\ln/g, "ln");
  s = s.replace(/\\sin/g, "sin");
  s = s.replace(/\\cos/g, "cos");
  s = s.replace(/\\tan/g, "tan");
  s = s.replace(/\\int/g, "∫");
  s = s.replace(/\\sum/g, "Σ");
  const sup: Record<string, string> = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
    n: "ⁿ",
    x: "ˣ",
    "+": "⁺",
    "-": "⁻",
  };
  s = s.replace(/\^\{([^{}]+)\}/g, (_, g: string) => [...g].map((c) => sup[c] ?? `^${c}`).join(""));
  s = s.replace(/\^([0-9a-zA-Z])/g, (_, c: string) => sup[c] ?? `^${c}`);
  s = s.replace(/\{|\}/g, "");
  return s.trim();
}

/** Drop a piece of math (already prettified) onto the whiteboard as text. */
export function insertMathOnBoard(latex: string): boolean {
  const ed = editor;
  if (!ed || !latex.trim()) return false;
  try {
    const text = prettifyLatex(latex);
    // Pick a nice, visible spot: centre of the current viewport.
    const vp = ed.getViewportPageBounds?.();
    const cx = vp ? vp.x + vp.w / 2 : 0;
    const cy = vp ? vp.y + vp.h / 2 : 0;
    // tldraw exposes createShapeId lazily; use a random id if unavailable.
    const id =
      // @ts-ignore — attached at runtime from the tldraw module
      (globalThis as any).__tldrawCreateShapeId?.() ??
      `shape:math-${Math.random().toString(36).slice(2, 10)}`;
    // tldraw v3+ text shapes use `richText`, not `text`.
    const toRichText = (globalThis as any).__tldrawToRichText;
    const richText = toRichText
      ? toRichText(text)
      : { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
    ed.createShapes([
      {
        id,
        type: "text",
        x: cx - 120,
        y: cy - 20,
        props: { richText, size: "l", color: "black", font: "draw" },
      },
    ]);
    ed.select?.(id);
    return true;
  } catch (e) {
    console.error("insertMathOnBoard failed", e);
    return false;
  }
}
