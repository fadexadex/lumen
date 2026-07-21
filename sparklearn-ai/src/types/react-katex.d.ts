declare module "react-katex" {
  import type { FC } from "react";
  interface KatexProps {
    math: string;
    errorColor?: string;
    renderError?: (e: Error) => JSX.Element;
  }
  export const InlineMath: FC<KatexProps>;
  export const BlockMath: FC<KatexProps>;
}
