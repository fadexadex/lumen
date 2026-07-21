import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Tool } from "./types";

type Note = { id: string; x: number; y: number; text: string };

export type TextNotesHandle = { clear: () => void };

export function TextNotesOverlay({
  tool,
  width,
  height,
  overlayRef,
}: {
  tool: Tool;
  width: number;
  height: number;
  overlayRef: MutableRefObject<TextNotesHandle | null>;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    overlayRef.current = {
      clear: () => {
        setNotes([]);
        setEditingId(null);
      },
    };
  }, [overlayRef]);

  useEffect(() => {
    if (editingId && inputRef.current) inputRef.current.focus();
  }, [editingId]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== "text") return;
    if (e.target !== e.currentTarget) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const sx = el.offsetWidth / rect.width;
    const sy = el.offsetHeight / rect.height;
    const id = crypto.randomUUID();
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * sy;
    setNotes((n) => [...n, { id, x, y, text: "" }]);
    setEditingId(id);
  };

  const commit = (id: string) => {
    setEditingId(null);
    setNotes((n) => n.filter((note) => note.id !== id || note.text.trim().length > 0));
  };

  return (
    <div
      className="absolute inset-0"
      style={{
        width,
        height,
        pointerEvents: tool === "text" ? "auto" : "none",
        cursor: tool === "text" ? "text" : "default",
      }}
      onClick={onClick}
    >
      {notes.map((n) => (
        <div
          key={n.id}
          className="absolute"
          style={{
            left: n.x,
            top: n.y,
            fontFamily: "var(--font-plot)",
            pointerEvents: "auto",
          }}
        >
          {editingId === n.id ? (
            <textarea
              ref={inputRef}
              value={n.text}
              onChange={(e) =>
                setNotes((all) =>
                  all.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)),
                )
              }
              onBlur={() => commit(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Escape") commit(n.id);
              }}
              className="min-h-[2rem] min-w-[8rem] resize-none border border-dashed border-neutral-400 bg-white/80 p-1 text-xl text-neutral-900 outline-none"
              rows={1}
            />
          ) : (
            <div
              className="whitespace-pre-wrap text-xl text-neutral-900"
              onDoubleClick={() => setEditingId(n.id)}
            >
              {n.text}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}