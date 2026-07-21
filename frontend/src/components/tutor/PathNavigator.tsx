import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { RoadmapModule } from "@/lib/types";

export type PathNavigatorProps = {
  topic: string;
  modules: RoadmapModule[];
  currentId: string;
  onSelect: (moduleId: string) => void;
  /** Modules the learner has finished — drives checks + progress bar. */
  completedIds?: Record<string, boolean>;
  /** Optional: full roadmap route */
  roadmapHref?: string;
  className?: string;
};

/**
 * Module navigation cluster for the lesson topbar: a prev / path / next stepper
 * plus a jump panel listing every module. Prev/next let learners walk the path
 * without opening anything; the panel is for skipping around and seeing progress.
 */
export function PathNavigator({
  topic,
  modules,
  currentId,
  onSelect,
  completedIds = {},
  roadmapHref = "/roadmap",
  className,
}: PathNavigatorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const currentIndex = modules.findIndex((m) => m.id === currentId);
  const prev = currentIndex > 0 ? modules[currentIndex - 1] : null;
  const next =
    currentIndex >= 0 && currentIndex < modules.length - 1 ? modules[currentIndex + 1] : null;
  const doneCount = modules.filter((m) => completedIds[m.id]).length;
  const pct = modules.length ? Math.round((doneCount / modules.length) * 100) : 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  // Alt/Option + ← / → walks between modules from anywhere in the lesson,
  // staying clear of the concept switcher ( [ / ] ) and the whiteboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "ArrowLeft" && prev) {
        e.preventDefault();
        onSelect(prev.id);
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        onSelect(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onSelect]);

  return (
    <div ref={rootRef} className={`path-nav-root${className ? ` ${className}` : ""}`}>
      <div className="path-stepper" role="group" aria-label="Module navigation">
        <button
          type="button"
          className="path-step-arrow"
          aria-label={prev ? `Previous module: ${prev.title}` : "No previous module"}
          title={prev ? `Previous · ${prev.title}  (⌥←)` : "Start of path"}
          disabled={!prev}
          onClick={() => prev && onSelect(prev.id)}
        >
          ‹
        </button>

        <button
          type="button"
          className="path-step-pill"
          aria-label="Open learning path"
          aria-expanded={open}
          aria-controls={panelId}
          data-state={open ? "open" : "closed"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="path-step-map" aria-hidden>
            ⌘
          </span>
          <span className="path-step-count">
            {currentIndex >= 0 ? currentIndex + 1 : "–"}
            <span className="path-step-sep">/</span>
            {modules.length}
          </span>
          <span className="path-step-bar" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </span>
        </button>

        <button
          type="button"
          className="path-step-arrow"
          aria-label={next ? `Next module: ${next.title}` : "No next module"}
          title={next ? `Next · ${next.title}  (⌥→)` : "End of path"}
          disabled={!next}
          onClick={() => next && onSelect(next.id)}
        >
          ›
        </button>
      </div>

      {open ? (
        <div id={panelId} className="path-nav" role="dialog" aria-label={`${topic} learning path`}>
          <header className="path-nav-head">
            <p className="path-nav-eyebrow">Your path</p>
            <h2 className="path-nav-topic tutor-serif">{topic}</h2>
            <p className="path-nav-meta">
              {doneCount} of {modules.length} done
              {next ? ` · next: ${next.title}` : " · you're at the finish"}
            </p>
            <div className="path-nav-progress" aria-hidden>
              <span style={{ width: `${pct}%` }} />
            </div>
          </header>

          <ul className="path-nav-list" role="list">
            {modules.map((m, i) => {
              const active = m.id === currentId;
              const done = !!completedIds[m.id];
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className="path-nav-item"
                    data-active={active || undefined}
                    data-done={done || undefined}
                    onClick={() => {
                      setOpen(false);
                      if (!active) onSelect(m.id);
                    }}
                  >
                    <span className="path-nav-num" aria-hidden>
                      {done ? "✓" : String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="path-nav-body">
                      <span className="path-nav-title">{m.title}</span>
                      <span className="path-nav-blurb">{m.blurb}</span>
                    </span>
                    {active ? (
                      <span className="path-nav-here">here</span>
                    ) : (
                      <span className="path-nav-go" aria-hidden>
                        →
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <footer className="path-nav-foot">
            <Link to={roadmapHref} className="path-nav-map" onClick={() => setOpen(false)}>
              Open full path map
            </Link>
            <span className="path-nav-kbd" aria-hidden>
              <kbd>⌥</kbd>
              <kbd>←</kbd> <kbd>⌥</kbd>
              <kbd>→</kbd> to move
            </span>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
