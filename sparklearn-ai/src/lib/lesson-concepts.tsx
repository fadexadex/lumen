import { useEffect, useMemo, useRef, useState } from "react";
import { BlockMath, InlineMath } from "react-katex";
import type { LessonScript, LessonStep } from "@/lib/types";
import { insertMathOnBoard } from "@/lib/whiteboard-bridge";

/* -------------------------------------------------------------------------- */
/*  Shared props + demo hook                                                  */
/* -------------------------------------------------------------------------- */

export interface ConceptProps {
  script: LessonScript;
  stepIndex: number;
  goto: (i: number) => void;
  demoTick: number;
  demoActive: boolean;
  onWriteMath: () => void;
  onOpenLive: () => void;
  /** Next roadmap module, if any — used for end-of-lesson navigation. */
  nextModule?: { id: string; title: string } | null;
  onNextModule?: () => void;
}

export interface ConceptDef {
  id: string;
  name: string;
  tagline: string;
  mood: string;
  boardTone: "light" | "dim" | "hidden" | "chalk" | "paper";
  Component: React.FC<ConceptProps>;
  group?: "panels" | "board";
}

/** Auto-advance stepIndex every `interval` ms while active. */
export function useDemoPlayer(opts: {
  active: boolean;
  stepIndex: number;
  total: number;
  goto: (i: number) => void;
  interval?: number;
  onFinish?: () => void;
}) {
  const { active, stepIndex, total, goto, interval = 4200, onFinish } = opts;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 90);
    return () => window.clearInterval(id);
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => {
      if (stepIndex < total - 1) goto(stepIndex + 1);
      else onFinish?.();
    }, interval);
    return () => window.clearTimeout(id);
  }, [active, stepIndex, total, goto, interval, onFinish]);
  return tick;
}

/* -------------------------------------------------------------------------- */
/*  Reveal helpers                                                            */
/* -------------------------------------------------------------------------- */

function useReveal(text: string, active: boolean, speed = 22) {
  const [n, setN] = useState(active ? 0 : text.length);
  useEffect(() => {
    if (!active) { setN(text.length); return; }
    setN(0);
    const id = setInterval(() => {
      setN((v) => (v >= text.length ? (clearInterval(id), v) : v + 1));
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);
  return text.slice(0, n);
}

function StepPill({ i, total, active }: { i: number; total: number; active: boolean }) {
  return (
    <span className="concept-pill">
      <span className="concept-pill-dot" data-live={active} /> step {i + 1} of {total}
    </span>
  );
}

function StepChrome({
  script, stepIndex, goto, onWriteMath, onOpenLive,
  variant = "line",
}: ConceptProps & { variant?: "line" | "dots" }) {
  const total = script.steps.length;
  return (
    <div className="concept-chrome">
      <div className={`concept-progress concept-progress--${variant}`}>
        {script.steps.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to step ${i + 1}`}
            className="concept-progress-tick"
            data-active={i === stepIndex}
            data-done={i < stepIndex}
            onClick={() => goto(i)}
          />
        ))}
      </div>
      <div className="concept-actions">
        <button
          className="concept-btn"
          onClick={() => goto(Math.max(0, stepIndex - 1))}
          disabled={stepIndex === 0}
        >←</button>
        <button className="concept-btn concept-btn--ghost" onClick={onWriteMath}>
          ✏️ write math
        </button>
        <button className="concept-btn concept-btn--ghost" onClick={onOpenLive}>
          🔊 ask Lumen
        </button>
        <button
          className="concept-btn concept-btn--primary"
          onClick={() => goto(Math.min(total - 1, stepIndex + 1))}
          disabled={stepIndex >= total - 1}
        >→</button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Renderers for a single step (used in a few concepts)                      */
/* -------------------------------------------------------------------------- */

function StepBody({ step, demo }: { step: LessonStep; demo: boolean }) {
  if (step.kind === "explanation") {
    const t = useReveal(step.body, demo);
    return (
      <>
        <p className="concept-body">{t}</p>
        {step.math && <div className="concept-math"><BlockMath math={step.math} /></div>}
      </>
    );
  }
  if (step.kind === "example") {
    return (
      <div className="concept-example">
        {step.lines.map((l, i) => (
          <div key={i} className="concept-example-line tutor-fade-in" style={{ animationDelay: `${i * 220}ms` }}>
            {l.math ? <BlockMath math={l.math} /> : <p className="concept-body">{l.text}</p>}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      <p className="concept-body">{step.prompt}</p>
      {step.math && !step.options && (
        <div className="concept-math"><InlineMath math={step.math} /></div>
      )}
      {step.options && (
        <div className="concept-options">
          {step.options.map((opt, i) => (
            <button key={i} className="concept-option">
              <span className="concept-option-key">{String.fromCharCode(65 + i)}</span>
              <InlineMath math={opt} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  01 · Focus panel (baseline, refined)                                      */
/* ========================================================================== */

const FocusPanel: React.FC<ConceptProps> = (p) => {
  const step = p.script.steps[p.stepIndex];
  return (
    <aside className="c-focus tutor-fade-in">
      <div className="c-focus-eyebrow">
        <StepPill i={p.stepIndex} total={p.script.steps.length} active={p.demoActive} />
        <span className="c-focus-kind">{step.kind}</span>
      </div>
      <h2 className="tutor-serif c-focus-title">{step.title}</h2>
      <StepBody step={step} demo={p.demoActive} />
      <div className="c-focus-foot"><StepChrome {...p} /></div>
    </aside>
  );
};

/* ========================================================================== */
/*  02 · Storyteller — centered, cinematic, one line at a time                */
/* ========================================================================== */

const Storyteller: React.FC<ConceptProps> = (p) => {
  const step = p.script.steps[p.stepIndex];
  const title = useReveal(step.title, true, 26);
  return (
    <div className="c-story">
      <div className="c-story-stage tutor-fade-in" key={p.stepIndex}>
        <p className="c-story-eyebrow">
          {p.script.title} · <em>step {p.stepIndex + 1}</em>
        </p>
        <h2 className="tutor-serif c-story-title">{title}</h2>
        <div className="c-story-body"><StepBody step={step} demo={p.demoActive} /></div>
      </div>
      <div className="c-story-chrome"><StepChrome {...p} variant="dots" /></div>
    </div>
  );
};

/* ========================================================================== */
/*  03 · Chalkboard — dark green board, chalk-style reveal                    */
/* ========================================================================== */

const Chalkboard: React.FC<ConceptProps> = (p) => {
  const step = p.script.steps[p.stepIndex];
  return (
    <div className="c-chalk">
      <div className="c-chalk-frame">
        <div className="c-chalk-inner tutor-fade-in" key={p.stepIndex}>
          <p className="c-chalk-eyebrow">Lesson · Ms. Lumen writes:</p>
          <h2 className="c-chalk-title">{step.title}</h2>
          <div className="c-chalk-body">
            <StepBody step={step} demo={p.demoActive} />
          </div>
        </div>
      </div>
      <div className="c-chalk-chrome"><StepChrome {...p} /></div>
    </div>
  );
};

/* ========================================================================== */
/*  04 · Comic strip — 3 panels + Lumen speech bubbles                        */
/* ========================================================================== */

const Comic: React.FC<ConceptProps> = (p) => {
  const step = p.script.steps[p.stepIndex];
  const bits = useMemo(() => {
    if (step.kind === "explanation") return [step.title, step.body, step.math ?? "…"];
    if (step.kind === "example")
      return step.lines.slice(0, 3).map((l) => l.math ?? l.text ?? "");
    return [step.title, step.prompt, step.options?.join("  or  ") ?? step.math ?? ""];
  }, [step]);
  return (
    <div className="c-comic">
      <div className="c-comic-strip">
        {bits.map((b, i) => (
          <div key={i} className="c-comic-panel tutor-fade-in" style={{ animationDelay: `${i * 180}ms` }}>
            <span className="c-comic-num">{i + 1}</span>
            {b.startsWith("\\") || /[=+\-^]/.test(b) ? (
              <div className="c-comic-math"><BlockMath math={b} /></div>
            ) : (
              <p className="c-comic-text tutor-serif">{b}</p>
            )}
            <span className="c-comic-tail" />
          </div>
        ))}
      </div>
      <div className="c-comic-chrome"><StepChrome {...p} /></div>
    </div>
  );
};

/* ========================================================================== */
/*  05 · Notebook — lined paper, handwriting fade                             */
/* ========================================================================== */

const Notebook: React.FC<ConceptProps> = (p) => {
  const step = p.script.steps[p.stepIndex];
  return (
    <div className="c-notebook">
      <div className="c-notebook-page tutor-fade-in" key={p.stepIndex}>
        <div className="c-notebook-hole" />
        <div className="c-notebook-hole" />
        <div className="c-notebook-hole" />
        <p className="c-notebook-date">{p.script.title} · page {p.stepIndex + 1}</p>
        <h2 className="c-notebook-title tutor-serif">{step.title}</h2>
        <div className="c-notebook-body"><StepBody step={step} demo={p.demoActive} /></div>
      </div>
      <div className="c-notebook-chrome"><StepChrome {...p} /></div>
    </div>
  );
};

/* ========================================================================== */
/*  06 · Split Studio — left teaches, right is your board                     */
/* ========================================================================== */

const SplitStudio: React.FC<ConceptProps> = (p) => {
  const step = p.script.steps[p.stepIndex];
  return (
    <div className="c-split">
      <div className="c-split-left tutor-fade-in" key={p.stepIndex}>
        <p className="c-split-eyebrow">
          <span className="c-split-avatar" /> Lumen · teaching
        </p>
        <h2 className="tutor-serif c-split-title">{step.title}</h2>
        <div className="c-split-body"><StepBody step={step} demo={p.demoActive} /></div>
        <div className="c-split-chrome"><StepChrome {...p} /></div>
      </div>
      <div className="c-split-right">
        <p className="c-split-label">your workspace →</p>
      </div>
    </div>
  );
};

/* ========================================================================== */
/*  07 · Spotlight — dim overlay, spot follows the lesson                     */
/* ========================================================================== */

const Spotlight: React.FC<ConceptProps> = (p) => {
  const step = p.script.steps[p.stepIndex];
  return (
    <div className="c-spot">
      <div className="c-spot-veil" />
      <div className="c-spot-card tutor-fade-in" key={p.stepIndex}>
        <p className="c-spot-eyebrow">focus · step {p.stepIndex + 1}</p>
        <h2 className="tutor-serif c-spot-title">{step.title}</h2>
        <StepBody step={step} demo={p.demoActive} />
        <div className="c-spot-chrome"><StepChrome {...p} /></div>
      </div>
    </div>
  );
};

/* ========================================================================== */
/*  08 · Deck — swipeable cards centered                                      */
/* ========================================================================== */

const Deck: React.FC<ConceptProps> = (p) => {
  const step = p.script.steps[p.stepIndex];
  return (
    <div className="c-deck">
      <div className="c-deck-stack">
        {p.script.steps.map((s, i) => {
          const offset = i - p.stepIndex;
          if (offset < 0 || offset > 2) return null;
          return (
            <article
              key={i}
              className="c-deck-card"
              style={{
                transform: `translateY(${offset * 12}px) scale(${1 - offset * 0.04})`,
                opacity: offset === 0 ? 1 : 0.5 - offset * 0.15,
                zIndex: 10 - offset,
              }}
            >
              <p className="c-deck-eyebrow">{s.kind} · {i + 1} / {p.script.steps.length}</p>
              <h2 className="tutor-serif c-deck-title">{s.title}</h2>
              {offset === 0 && <StepBody step={s} demo={p.demoActive} />}
            </article>
          );
        })}
      </div>
      <div className="c-deck-chrome"><StepChrome {...p} variant="dots" /></div>
    </div>
  );
};

/* ========================================================================== */
/*  09 · Whisper rail — thin bottom strip, board owns the screen              */
/* ========================================================================== */

const Whisper: React.FC<ConceptProps> = (p) => {
  const step = p.script.steps[p.stepIndex];
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`c-whisper ${expanded ? "is-open" : ""}`}>
      <button className="c-whisper-handle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "▾" : "▴"} {step.title}
      </button>
      <div className="c-whisper-body">
        <StepBody step={step} demo={p.demoActive} />
        <StepChrome {...p} />
      </div>
    </div>
  );
};

/* ========================================================================== */
/*  10 · Board-ink — Lumen writes on the tldraw board                         */
/* ========================================================================== */

const BoardInk: React.FC<ConceptProps> = (p) => {
  const step = p.script.steps[p.stepIndex];
  const lastDrop = useRef<number>(-1);
  useEffect(() => {
    if (!p.demoActive) return;
    if (lastDrop.current === p.stepIndex) return;
    lastDrop.current = p.stepIndex;
    if (step.kind === "explanation" && step.math) insertMathOnBoard(step.math);
    if (step.kind === "example") {
      step.lines.forEach((l, i) => {
        if (l.math) setTimeout(() => insertMathOnBoard(l.math!), i * 700);
      });
    }
  }, [p.demoActive, p.stepIndex, step]);

  return (
    <div className="c-ink">
      <div className="c-ink-header tutor-fade-in" key={p.stepIndex}>
        <span className="c-ink-avatar" />
        <div>
          <p className="c-ink-name">Lumen · writing on your board</p>
          <p className="c-ink-title tutor-serif">{step.title}</p>
        </div>
      </div>
      <div className="c-ink-caption tutor-fade-in">
        <StepBody step={step} demo={p.demoActive} />
      </div>
      <div className="c-ink-chrome"><StepChrome {...p} /></div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Registry                                                                  */
/* -------------------------------------------------------------------------- */

import { BOARD_CONCEPTS } from "./board-concepts";

const PANEL_CONCEPTS: ConceptDef[] = [
  { id: "focus",   name: "Focus Panel",     tagline: "Calm side card, board stays hero.",          mood: "Minimal", boardTone: "light",  Component: FocusPanel, group: "panels" },
  { id: "story",   name: "Storyteller",     tagline: "Cinematic one-line-at-a-time narration.",     mood: "Cinematic", boardTone: "dim",  Component: Storyteller, group: "panels" },
  { id: "chalk",   name: "Chalkboard",      tagline: "Classroom vibes, chalk on green.",            mood: "Classroom", boardTone: "chalk", Component: Chalkboard, group: "panels" },
  { id: "comic",   name: "Comic Strip",     tagline: "Three panels, playful speech bubbles.",       mood: "Playful",  boardTone: "light",  Component: Comic, group: "panels" },
  { id: "notebook",name: "Notebook",        tagline: "Handwritten pages on lined paper.",           mood: "Cozy",     boardTone: "paper",  Component: Notebook, group: "panels" },
  { id: "split",   name: "Split Studio",    tagline: "Lumen teaches left, you work right.",         mood: "Studious", boardTone: "light",  Component: SplitStudio, group: "panels" },
  { id: "spot",    name: "Spotlight",       tagline: "Dim the room, focus on the beat.",            mood: "Focus",    boardTone: "dim",    Component: Spotlight, group: "panels" },
  { id: "deck",    name: "Card Deck",       tagline: "Swipe through steps like flashcards.",        mood: "Bite-size",boardTone: "light",  Component: Deck, group: "panels" },
  { id: "whisper", name: "Whisper Rail",    tagline: "Board owns the screen; note whispers below.", mood: "Board-first", boardTone: "light", Component: Whisper, group: "panels" },
  { id: "ink",     name: "Board Ink",       tagline: "Lumen writes math directly on your board.",   mood: "Live",     boardTone: "light",  Component: BoardInk, group: "panels" },
];

export const CONCEPTS: ConceptDef[] = [
  ...PANEL_CONCEPTS,
  ...BOARD_CONCEPTS.map((c) => ({ ...c, group: "board" as const })),
];

export const CONCEPT_GROUPS: { id: "panels" | "board"; name: string; tagline: string }[] = [
  { id: "board",  name: "Board Native", tagline: "The whiteboard teaches — diagrams, graphs, tiles." },
  { id: "panels", name: "Panels & Pages", tagline: "Lumen speaks through cards, notes and scenes." },
];

export function getConcept(id: string | undefined): ConceptDef {
  return CONCEPTS.find((c) => c.id === id) ?? CONCEPTS[0];
}