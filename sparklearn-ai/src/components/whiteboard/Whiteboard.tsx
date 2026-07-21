import { lazy, Suspense, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { setWhiteboardEditor } from "@/lib/whiteboard-bridge";

// Warm the tldraw module chunk as soon as this file is imported so the
// board is ready by the time the user reaches a lesson.
if (typeof window !== "undefined") {
  // fire-and-forget; browsers will cache the chunk
  import("tldraw").catch(() => {});
}

// tldraw ships browser-only code (indexeddb, canvas, ResizeObserver).
// Lazy-load it so SSR / prerender doesn't touch it.
const TldrawInner = lazy(async () => {
  const m = await import("tldraw");
  // Expose createShapeId once so the whiteboard bridge can mint valid ids.
  (globalThis as any).__tldrawCreateShapeId = m.createShapeId;
  (globalThis as any).__tldrawToRichText = m.toRichText;
  return { default: m.Tldraw };
});

// Minimal tool set — we intentionally hide tldraw's dense default UI so kids
// aren't overwhelmed. The editor instance is captured on mount so we can
// (a) drive it from our own tiny toolbar and (b) let Lumen draw on it later.
export type WbTool = "select" | "hand" | "draw" | "eraser" | "text";

const TOOL_MAP: Record<WbTool, string> = {
  select: "select",
  hand: "hand",
  draw: "draw",
  eraser: "eraser",
  text: "text",
};

export function Whiteboard({ persistenceKey }: { persistenceKey?: string }) {
  const editorRef = useRef<any>(null);
  const [tool, setTool] = useState<WbTool>("draw");
  const [ready, setReady] = useState(false);

  const pick = (t: WbTool) => {
    setTool(t);
    editorRef.current?.setCurrentTool?.(TOOL_MAP[t]);
  };

  const undo = () => editorRef.current?.undo?.();
  const clear = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const ids = ed.getCurrentPageShapeIds?.();
    if (ids && ids.size) ed.deleteShapes([...ids]);
  };

  return (
    <div className="wb-surface">
      <ClientOnly fallback={<div className="wb-fallback" />}>
        <Suspense fallback={<div className="wb-fallback" />}>
          <TldrawInner
            persistenceKey={persistenceKey ?? "lumen-wb"}
            hideUi
            onMount={(editor: any) => {
              editorRef.current = editor;
              setWhiteboardEditor(editor);
              try {
                editor.setCurrentTool?.("draw");
                editor.user?.updateUserPreferences?.({ isSnapMode: false });
              } catch {
                /* ignore */
              }
              setReady(true);
            }}
          />
        </Suspense>
      </ClientOnly>

      {ready && (
        <div className="wb-mini-toolbar tutor-fade-in" aria-label="Whiteboard tools">
          <ToolBtn active={tool === "draw"} onClick={() => pick("draw")} label="Draw">
            <PenIcon />
          </ToolBtn>
          <ToolBtn active={tool === "eraser"} onClick={() => pick("eraser")} label="Erase">
            <EraseIcon />
          </ToolBtn>
          <ToolBtn active={tool === "text"} onClick={() => pick("text")} label="Text">
            <TextIcon />
          </ToolBtn>
          <ToolBtn active={tool === "hand"} onClick={() => pick("hand")} label="Pan">
            <HandIcon />
          </ToolBtn>
          <span className="wb-mini-sep" aria-hidden />
          <ToolBtn onClick={undo} label="Undo">
            <UndoIcon />
          </ToolBtn>
          <ToolBtn onClick={clear} label="Clear board">
            <TrashIcon />
          </ToolBtn>
        </div>
      )}
    </div>
  );
}

function ToolBtn({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="wb-mini-btn"
      data-active={active ? "true" : undefined}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

/* Tiny inline icons — kept in-file so the toolbar has no extra deps */
const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const PenIcon = () => (
  <svg {...iconProps}><path d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5z" /></svg>
);
const EraseIcon = () => (
  <svg {...iconProps}><path d="M3 17l7-7 7 7-4 4H7l-4-4z" /><path d="M14 6l4 4" /></svg>
);
const TextIcon = () => (
  <svg {...iconProps}><path d="M5 5h14M12 5v14M9 19h6" /></svg>
);
const HandIcon = () => (
  <svg {...iconProps}><path d="M7 11V6a1.5 1.5 0 013 0v4M10 10V4.5a1.5 1.5 0 013 0V10M13 10V6a1.5 1.5 0 013 0v6M16 10.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1.5a5 5 0 01-3.5-1.5L4 15" /></svg>
);
const UndoIcon = () => (
  <svg {...iconProps}><path d="M9 14l-4-4 4-4" /><path d="M5 10h9a5 5 0 010 10h-2" /></svg>
);
const TrashIcon = () => (
  <svg {...iconProps}><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13h10l1-13" /></svg>
);