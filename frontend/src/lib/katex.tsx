/**
 * react-katex is CJS — named ESM imports break Vite SSR ("Named export not found").
 * Re-export via default interop so lesson routes stay SSR-safe.
 */
import type { ComponentType } from "react";
import Katex from "react-katex";

type KatexComponents = {
  BlockMath: ComponentType<{ math: string; children?: string }>;
  InlineMath: ComponentType<{ math: string; children?: string }>;
};

const k = Katex as unknown as KatexComponents;
export const BlockMath = k.BlockMath;
export const InlineMath = k.InlineMath;
