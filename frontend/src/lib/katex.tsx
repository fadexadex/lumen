import type { ReactNode } from "react";
import katex from "katex";

type KatexProps = {
  math?: string;
  children?: string;
  errorColor?: string;
  renderError?: (error: Error) => ReactNode;
};

export function renderKatexToString(math: string, displayMode = false): string {
  return katex.renderToString(math, { displayMode, throwOnError: true });
}

export function InlineMath(props: KatexProps) {
  return <KatexMath {...props} displayMode={false} />;
}

export function BlockMath(props: KatexProps) {
  return <KatexMath {...props} displayMode />;
}

function KatexMath({
  math,
  children,
  errorColor,
  renderError,
  displayMode,
}: KatexProps & { displayMode: boolean }) {
  const value = math ?? children ?? "";
  try {
    const html = renderKatexToString(value, displayMode);
    const Component = displayMode ? "div" : "span";
    return <Component data-testid="react-katex" dangerouslySetInnerHTML={{ __html: html }} />;
  } catch (error) {
    if (error instanceof Error && renderError) return <>{renderError(error)}</>;
    return <span style={{ color: errorColor }}>{value}</span>;
  }
}
