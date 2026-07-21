import { useEffect, useMemo, useState } from "react";
import { CONCEPTS, CONCEPT_GROUPS } from "@/lib/lesson-concepts";

/**
 * Board / variant switcher. Lives as one quiet control in the lesson topbar so
 * the reading area stays clear — the full picker only appears when opened.
 * Keyboard: [ / ] flip boards without opening anything.
 */
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
  useEffect(() => {
    setGroupTab(currentGroup);
  }, [currentGroup]);
  const groupList = useMemo(
    () => CONCEPTS.filter((c) => (c.group ?? "panels") === currentGroup),
    [currentGroup],
  );
  const idx = groupList.findIndex((c) => c.id === current.id);
  const sheetList = useMemo(
    () => CONCEPTS.filter((c) => (c.group ?? "panels") === groupTab),
    [groupTab],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (open) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "[") onChange(groupList[(idx - 1 + groupList.length) % groupList.length].id);
      if (e.key === "]") onChange(groupList[(idx + 1) % groupList.length].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, open, onChange, groupList]);

  return (
    <>
      <button
        type="button"
        className="cs-trigger"
        aria-label="Change how this lesson is taught"
        aria-expanded={open}
        data-state={open ? "open" : "closed"}
        onClick={() => setOpen(true)}
        title="Ways to teach this lesson ( [ / ] to flip )"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
          <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
            <rect x="2" y="2" width="5" height="5" rx="1" />
            <rect x="9" y="2" width="5" height="5" rx="1" />
            <rect x="2" y="9" width="5" height="5" rx="1" />
            <rect x="9" y="9" width="5" height="5" rx="1" />
          </g>
        </svg>
        <span className="cs-trigger-label">{current.name}</span>
        {demoActive && <span className="cs-trigger-demo" aria-label="Demo running" />}
      </button>

      {open && (
        <div className="cs-scrim" onClick={() => setOpen(false)}>
          <div className="cs-sheet" onClick={(e) => e.stopPropagation()}>
            <header className="cs-sheet-head">
              <div>
                <p className="cs-sheet-eyebrow">Lesson boards · pick a group, then a variant</p>
                <h2 className="tutor-serif cs-sheet-title">Ways to teach this lesson</h2>
              </div>
              <button className="cs-close" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
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
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <span className="cs-tile-num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="cs-tile-name tutor-serif">{c.name}</span>
                  <span className="cs-tile-tag">{c.tagline}</span>
                  <span className="cs-tile-mood">{c.mood}</span>
                </button>
              ))}
            </div>
            <footer className="cs-sheet-foot">
              <p className="cs-hint">
                Tip · use <kbd>[</kbd> / <kbd>]</kbd> to flip boards without opening this.
              </p>
              <button
                type="button"
                className={`cs-demo-btn ${demoActive ? "is-live" : ""}`}
                onClick={() => {
                  onToggleDemo();
                  setOpen(false);
                }}
              >
                {demoActive ? "◼ stop demo" : "▶ run demo"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
