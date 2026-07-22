import type { ReactNode } from "react";

/**
 * Render a math-ish string with `^{...}` / `^x` superscripts and
 * `_{...}` / `_x` subscripts. No LaTeX engine — so partial strings
 * type out cleanly during the lesson player reveal.
 *
 * Typography matches board titles (Instrument Serif) — one continuous
 * voice, not typeset-math token styling.
 */
export function Equation({ children }: { children: string }) {
  return <span className="mc-equation">{parse(children)}</span>;
}

/** Soften common KaTeX into hand-writable form the Equation parser can type. */
export function toHandMath(latex: string): string {
  return (
    latex
      // Strip math delimiters ($…$, $$…$$, \(…\), \[…\]) — this is already a
      // math-only context, so the wrappers must never render as literal glyphs.
      .replace(/\${1,2}/g, "")
      .replace(/\\[()[\]]/g, "")
      .replace(/\\;/g, " ")
      .replace(/\\,/g, " ")
      .replace(/\\quad/g, "  ")
      .replace(/\\qquad/g, "   ")
      .replace(/\\Rightarrow/g, " ⇒ ")
      .replace(/\\rightarrow/g, " → ")
      .replace(/\\pm/g, " ± ")
      .replace(/\\mp/g, " ∓ ")
      .replace(/\\times/g, " × ")
      .replace(/\\cdot/g, " · ")
      .replace(/\\div/g, " ÷ ")
      .replace(/\\leq/g, " ≤ ")
      .replace(/\\geq/g, " ≥ ")
      .replace(/\\neq/g, " ≠ ")
      .replace(/\\approx/g, " ≈ ")
      .replace(/\\infty/g, "∞")
      .replace(/\\sqrt\{([^}]*)\}/g, "√($1)")
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
      .replace(/\\tfrac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
      .replace(/\\text\{([^}]*)\}/g, " $1 ")
      .replace(/\\mathrm\{([^}]*)\}/g, "$1")
      .replace(/\\left|\\right/g, "")
      .replace(/[{}]/g, "")
      .replace(/\\\\/g, "")
      .replace(/\\/g, "")
      .replace(/-/g, "−")
      .replace(/\s*([+−=×÷±∓·≤≥≠≈⇒→])\s*/g, " $1 ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function parse(input: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < input.length) {
    const ch = input[i];
    if (ch === "^" || ch === "_") {
      const isSup = ch === "^";
      i++;
      let token = "";
      if (input[i] === "{") {
        i++;
        while (i < input.length && input[i] !== "}") token += input[i++];
        if (input[i] === "}") i++;
      } else {
        token = input[i] ?? "";
        i++;
      }
      nodes.push(
        isSup ? (
          <sup key={key++} className="mc-equation-sup">
            {token}
          </sup>
        ) : (
          <sub key={key++} className="mc-equation-sub">
            {token}
          </sub>
        ),
      );
      continue;
    }

    let run = "";
    while (i < input.length && input[i] !== "^" && input[i] !== "_") {
      run += input[i++];
    }
    if (run) nodes.push(<span key={key++}>{run}</span>);
  }

  return nodes;
}
