import { Eraser, Hand, Highlighter, Pen, Trash2, Type } from "lucide-react";
import type { Tool } from "./types";

export function Toolbar({
  tool,
  onTool,
  onClear,
}: {
  tool: Tool;
  onTool: (t: Tool) => void;
  onClear: () => void;
}) {
  return (
    <div className="pointer-events-auto fixed left-4 top-1/2 z-30 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm">
      <div className="flex flex-col gap-1">
        <ToolButton
          active={tool === "pan"}
          onClick={() => onTool("pan")}
          label="Pan / interact (drag to move, scroll to pan, ⌘/Ctrl+scroll to zoom)"
        >
          <Hand className="h-5 w-5" />
        </ToolButton>
        <ToolButton active={tool === "pen"} onClick={() => onTool("pen")} label="Pen">
          <Pen className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          active={tool === "highlighter"}
          onClick={() => onTool("highlighter")}
          label="Highlighter"
        >
          <Highlighter className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          active={tool === "eraser"}
          onClick={() => onTool("eraser")}
          label="Eraser"
        >
          <Eraser className="h-5 w-5" />
        </ToolButton>
        <ToolButton
          active={tool === "text"}
          onClick={() => onTool("text")}
          label="Text note"
        >
          <Type className="h-5 w-5" />
        </ToolButton>
        <div className="my-1 h-px bg-neutral-200" />
        <ToolButton
          active={false}
          onClick={() => {
            if (confirm("Clear all annotations?")) onClear();
          }}
          label="Clear annotations"
        >
          <Trash2 className="h-5 w-5" />
        </ToolButton>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-neutral-900 text-white"
          : "text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}