import type { ReactNode } from "react";

/**
 * Render a math-ish string with `^{...}` / `^x` superscripts and
 * `_{...}` / `_x` subscripts. No LaTeX engine.
 */
export function Equation({ children }: { children: string }) {
  return <span className="whitespace-pre">{parse(children)}</span>;
}

function parse(input: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) {
      nodes.push(buf);
      buf = "";
    }
  };
  while (i < input.length) {
    const ch = input[i];
    if (ch === "^" || ch === "_") {
      flush();
      const isSup = ch === "^";
      i++;
      let token = "";
      if (input[i] === "{") {
        i++;
        while (i < input.length && input[i] !== "}") {
          token += input[i++];
        }
        if (input[i] === "}") i++;
      } else {
        token = input[i] ?? "";
        i++;
      }
      nodes.push(
        isSup ? (
          <sup key={nodes.length} className="text-[0.65em]">
            {token}
          </sup>
        ) : (
          <sub key={nodes.length} className="text-[0.65em]">
            {token}
          </sub>
        ),
      );
    } else {
      buf += ch;
      i++;
    }
  }
  flush();
  return nodes;
}