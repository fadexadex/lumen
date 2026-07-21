import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { MCTool } from "./ink-canvas";

type Note = { id: string; x: number; y: number; text: string };
export type NotesHandle = { clear: () => void };

export function TextNotes({
  tool, width, height, overlayRef,
}: {
  tool: MCTool; width: number; height: number; overlayRef: MutableRefObject<NotesHandle | null>;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    overlayRef.current = { clear: () => { setNotes([]); setEditing(null); } };
  }, [overlayRef]);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== "text" || e.target !== e.currentTarget) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const id = crypto.randomUUID();
    setNotes((n) => [...n, {
      id,
      x: ((e.clientX - r.left) / r.width) * el.offsetWidth,
      y: ((e.clientY - r.top) / r.height) * el.offsetHeight,
      text: "",
    }]);
    setEditing(id);
  };

  const commit = (id: string) => {
    setEditing(null);
    setNotes((n) => n.filter((x) => x.id !== id || x.text.trim().length > 0));
  };

  return (
    <div
      className="mc-notes"
      style={{ width, height, pointerEvents: tool === "text" ? "auto" : "none", cursor: tool === "text" ? "text" : "default" }}
      onClick={onClick}
    >
      {notes.map((n) => (
        <div key={n.id} className="mc-note" style={{ left: n.x, top: n.y }}>
          {editing === n.id ? (
            <textarea
              ref={inputRef}
              value={n.text}
              onChange={(e) => setNotes((all) => all.map((x) => x.id === n.id ? { ...x, text: e.target.value } : x))}
              onBlur={() => commit(n.id)}
              onKeyDown={(e) => { if (e.key === "Escape") commit(n.id); }}
              className="mc-note-input"
              rows={1}
            />
          ) : (
            <div className="mc-note-text" onDoubleClick={() => setEditing(n.id)}>{n.text}</div>
          )}
        </div>
      ))}
    </div>
  );
}