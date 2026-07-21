import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (latex: string) => void;
  placeholder?: string;
}

export function MathField({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const elRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await import("mathlive");
      if (!mounted || !ref.current) return;
      const el = document.createElement("math-field") as any;
      el.setAttribute("virtual-keyboard-mode", "manual");
      el.style.fontSize = "22px";
      el.style.padding = "10px 14px";
      el.style.minWidth = "320px";
      el.style.border = "1px solid var(--tutor-line)";
      el.style.borderRadius = "12px";
      el.style.background = "white";
      el.style.outline = "none";
      if (placeholder) el.setAttribute("placeholder", placeholder);
      el.value = value ?? "";
      el.addEventListener("input", () => onChange(el.value ?? ""));
      ref.current.appendChild(el);
      elRef.current = el;
    })();
    return () => {
      mounted = false;
      if (ref.current) ref.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} />;
}

export const MATH_SHORTCUTS: { label: string; latex: string }[] = [
  { label: "x²", latex: "x^2" },
  { label: "xⁿ", latex: "x^{n}" },
  { label: "√", latex: "\\sqrt{}" },
  { label: "∛", latex: "\\sqrt[3]{}" },
  { label: "a⁄b", latex: "\\frac{a}{b}" },
  { label: "π", latex: "\\pi" },
  { label: "±", latex: "\\pm" },
  { label: "≤", latex: "\\le" },
  { label: "≥", latex: "\\ge" },
  { label: "≠", latex: "\\neq" },
  { label: "log", latex: "\\log_{}" },
  { label: "ln", latex: "\\ln" },
  { label: "sin", latex: "\\sin" },
  { label: "cos", latex: "\\cos" },
  { label: "∫", latex: "\\int" },
  { label: "Σ", latex: "\\sum" },
];
