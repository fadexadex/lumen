import { useEffect, useMemo, useRef, useState } from "react";
import { CONCEPTS, CONCEPT_GROUPS } from "@/lib/lesson-concepts";

type Pos = { x: number; y: number } | null;

export function ConceptSwitcher({
  active,
  onChange,
  demoActive,
  onToggleDemo,
}: {
  active: string;
  onChange: (id: string) => void;
  demoActive: boolean;
  onToggleDemo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = CONCEPTS.find((c) => c.id === active) ?? CONCEPTS[0];
  const currentGroup = current.group ?? "panels";
  const [groupTab, setGroupTab] = useState<"panels" | "board">(currentGroup);
  useEffect(() => { setGroupTab(currentGroup); }, [currentGroup]);
  const groupList = useMemo(() => CONCEPTS.filter((c) => (c.group ?? "panels") === currentGroup), [currentGroup]);
  const idx = groupList.findIndex((c) => c.id === current.id);
  const sheetList = useMemo(() => CONCEPTS.filter((c) => (c.group ?? "panels") === groupTab), [groupTab]);

  const dockRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("lumen.cs-dock-pos");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (open) return;
      if (e.key === "[") onChange(groupList[(idx - 1 + groupList.length) % groupList.length].id);
      if (e.key === "]") onChange(groupList[(idx + 1) % groupList.length].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, open, onChange, groupList]);

  const clamp = (x: number, y: number) => {
    const el = dockRef.current;
    const w = el?.offsetWidth ?? 320;
    const h = el?.offsetHeight ?? 52;
    const pad = 8;
    return {
      x: Math.max(pad, Math.min(window.innerWidth - w - pad, x)),
      y: Math.max(pad, Math.min(window.innerHeight - h - pad, y)),
    };
  };

  const onGripPointerDown = (e: React.PointerEvent) => {
    const el = dockRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };

    const onMove = (ev: PointerEvent) => {
      const s = dragRef.current;
      if (!s) return;
      setPos(clamp(ev.clientX - s.dx, ev.clientY - s.dy));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  useEffect(() => {
    if (!pos) return;
    try { localStorage.setItem("lumen.cs-dock-pos", JSON.stringify(pos)); } catch { /* ignore */ }
  }, [pos]);

  useEffect(() => {
    const onResize = () => { if (pos) setPos(clamp(pos.x, pos.y)); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  const resetPos = () => {
    setPos(null);
    try { localStorage.removeItem("lumen.cs-dock-pos"); } catch { /* ignore */ }
  };

  const dockStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, bottom: "auto", transform: "none" }
    : {};

  return (
    <>
      <div ref={dockRef} className="cs-dock" style={dockStyle}>
        <button
          className="cs-grip"
          onPointerDown={onGripPointerDown}
          onDoubleClick={resetPos}
          aria-label="Drag concept switcher (double-click to reset)"
          title="Drag to move · double-click to reset"
        >
          <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden>
            <g fill="currentColor">
              <circle cx="3" cy="3" r="1.3" /><circle cx="9" cy="3" r="1.3" />
              <circle cx="3" cy="8" r="1.3" /><circle cx="9" cy="8" r="1.3" />
              <circle cx="3" cy="13" r="1.3" /><circle cx="9" cy="13" r="1.3" />
            </g>
          </svg>
        </button>
        <button
          className="cs-pill"
          onClick={() => onChange(groupList[(idx - 1 + groupList.length) % groupList.length].id)}
          aria-label="Previous concept"
          title="Previous concept ( [ )"
        >‹</button>
        <button className="cs-pill cs-pill--main" onClick={() => setOpen(true)}>
          <span className="cs-pill-num">{idx + 1}/{groupList.length}</span>
          <span className="cs-pill-name">{current.name}</span>
          <span className="cs-pill-mood">{CONCEPT_GROUPS.find((g) => g.id === currentGroup)?.name}</span>
        </button>
        <button
          className="cs-pill"
          onClick={() => onChange(groupList[(idx + 1) % groupList.length].id)}
          aria-label="Next concept"
          title="Next concept ( ] )"
        >›</button>
        <button
          className={`cs-pill cs-pill--demo ${demoActive ? "is-live" : ""}`}
          onClick={onToggleDemo}
          title="Auto-advance through the lesson"
        >
          {demoActive ? "◼ stop demo" : "▶ run demo"}
        </button>
      </div>

      {open && (
        <div className="cs-scrim" onClick={() => setOpen(false)}>
          <div className="cs-sheet" onClick={(e) => e.stopPropagation()}>
            <header className="cs-sheet-head">
              <div>
                <p className="cs-sheet-eyebrow">Lesson concepts · pick a group, then a variant</p>
                <h2 className="tutor-serif cs-sheet-title">Ways to teach this lesson</h2>
              </div>
              <button className="cs-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </header>
            <div className="cs-tabs">
              {CONCEPT_GROUPS.map((g) => (
                <button
                  key={g.id}
                  className="cs-tab"
                  data-active={groupTab === g.id}
                  onClick={() => setGroupTab(g.id)}
                >
                  <span className="cs-tab-name">{g.name}</span>
                  <span className="cs-tab-tag">{g.tagline}</span>
                </button>
              ))}
            </div>
            <div className="cs-grid">
              {sheetList.map((c, i) => (
                <button
                  key={c.id}
                  className="cs-tile"
                  data-active={c.id === current.id}
                  onClick={() => { onChange(c.id); setOpen(false); }}
                >
                  <span className="cs-tile-num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="cs-tile-name tutor-serif">{c.name}</span>
                  <span className="cs-tile-tag">{c.tagline}</span>
                  <span className="cs-tile-mood">{c.mood}</span>
                </button>
              ))}
            </div>
            <p className="cs-hint">
              Tip · use <kbd>[</kbd> / <kbd>]</kbd> to flip concepts, drag the ⋮⋮ handle to move this dock
              (double-click it to reset), then hit <em> ▶ run demo </em> to watch it come alive.
            </p>
          </div>
        </div>
      )}
    </>
  );
}