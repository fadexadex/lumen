import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { RoadmapModule } from "@/lib/types";

export type PathNavigatorProps = {
  topic: string;
  modules: RoadmapModule[];
  currentId: string;
  onSelect: (moduleId: string) => void;
  /** Optional: full roadmap route */
  roadmapHref?: string;
  className?: string;
};

/**
 * Reusable path jump panel — floating overlay, not a sidebar.
 * Lists every module so learners can skip ahead without resizing the board.
 */
export function PathNavigator({
  topic,
  modules,
  currentId,
  onSelect,
  roadmapHref = "/roadmap",
  className,
}: PathNavigatorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const currentIndex = modules.findIndex((m) => m.id === currentId);
  const next =
    currentIndex >= 0 && currentIndex < modules.length - 1
      ? modules[currentIndex + 1]
      : null;

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

  return (
    <div ref={rootRef} className={`path-nav-root${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className="lesson-crumb"
        aria-label="Open learning path"
        aria-expanded={open}
        aria-controls={panelId}
        data-state={open ? "open" : "closed"}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>←</span> path
      </button>

      {open ? (
        <div
          id={panelId}
          className="path-nav"
          role="dialog"
          aria-label={`${topic} learning path`}
        >
          <header className="path-nav-head">
            <p className="path-nav-eyebrow">Your path</p>
            <h2 className="path-nav-topic tutor-serif">{topic}</h2>
            <p className="path-nav-meta">
              {currentIndex >= 0 ? `${currentIndex + 1} of ${modules.length}` : modules.length} modules
              {next ? ` · next: ${next.title}` : ""}
            </p>
          </header>

          <ul className="path-nav-list" role="list">
            {modules.map((m, i) => {
              const active = m.id === currentId;
              const done = currentIndex >= 0 && i < currentIndex;
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
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="path-nav-body">
                      <span className="path-nav-title">{m.title}</span>
                      <span className="path-nav-blurb">{m.blurb}</span>
                    </span>
                    {active ? (
                      <span className="path-nav-here">here</span>
                    ) : (
                      <span className="path-nav-go" aria-hidden>→</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <footer className="path-nav-foot">
            <Link
              to={roadmapHref}
              className="path-nav-map"
              onClick={() => setOpen(false)}
            >
              Open full path map
            </Link>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
