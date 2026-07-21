import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlockMath, InlineMath } from "react-katex";
import type { LessonDiagram, LessonScript, LessonStep } from "./types";
import { getHints } from "./mock-live-hints";
import { MathCanvas } from "@/components/math-canvas/MathCanvas";

// Re-declared locally to avoid a circular import with lesson-concepts.tsx.
export interface ConceptProps {
  script: LessonScript;
  stepIndex: number;
  goto: (i: number) => void;
  demoTick: number;
  demoActive: boolean;
  onWriteMath: () => void;
  onOpenLive: () => void;
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

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

function fallbackDiagram(script: LessonScript): LessonDiagram {
  return (
    script.diagram ?? {
      parabola: { a: 1, b: 0, c: 0 },
      captions: script.steps.map((s) => s.title),
    }
  );
}

function BoardChrome({ script, stepIndex, goto, onWriteMath, onOpenLive }: ConceptProps) {
  const total = script.steps.length;
  return (
    <div className="bc-chrome">
      <div className="bc-progress">
        {script.steps.map((s, i) => (
          <button
            key={i}
            className="bc-tick"
            data-active={i === stepIndex}
            data-done={i < stepIndex}
            onClick={() => goto(i)}
          >
            <span className="bc-tick-num">{i + 1}</span>
            <span className="bc-tick-label">{s.title}</span>
          </button>
        ))}
      </div>
      <div className="bc-actions">
        <button
          className="bc-btn"
          onClick={() => goto(Math.max(0, stepIndex - 1))}
          disabled={stepIndex === 0}
        >
          ‹ back
        </button>
        <button className="bc-btn bc-btn--ghost" onClick={onWriteMath}>
          ✏️ write math
        </button>
        <button className="bc-btn bc-btn--ghost" onClick={onOpenLive}>
          🔊 ask Lumen
        </button>
        <button
          className="bc-btn bc-btn--primary"
          onClick={() => goto(Math.min(total - 1, stepIndex + 1))}
          disabled={stepIndex >= total - 1}
        >
          next ›
        </button>
      </div>
    </div>
  );
}

function CaptionBubble({ text, kind }: { text: string; kind?: string }) {
  return (
    <div className="bc-bubble tutor-fade-in">
      {kind && <span className="bc-bubble-kind">{kind}</span>}
      <p className="bc-bubble-text">{text}</p>
    </div>
  );
}

/* ========================================================================== */
/*  A · Grapher — live parabola plot with staged reveals                      */
/* ========================================================================== */

const Grapher: React.FC<ConceptProps> = (p) => {
  const d = fallbackDiagram(p.script);
  const step = p.script.steps[p.stepIndex];
  const { a, b, c, roots = [], vertex } = d.parabola ?? { a: 1, b: 0, c: 0 };

  // build path
  const w = 900,
    h = 520,
    pad = 40;
  const xMin = -2,
    xMax = 6;
  const yMin = -4,
    yMax = 8;
  const sx = (x: number) => pad + ((x - xMin) / (xMax - xMin)) * (w - 2 * pad);
  const sy = (y: number) => h - pad - ((y - yMin) / (yMax - yMin)) * (h - 2 * pad);
  const pts: string[] = [];
  for (let i = 0; i <= 200; i++) {
    const x = xMin + ((xMax - xMin) * i) / 200;
    const y = a * x * x + b * x + c;
    pts.push(`${i === 0 ? "M" : "L"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
  }
  const pathD = pts.join(" ");

  // reveal amounts by step
  const showCurve = p.stepIndex >= 0;
  const showVertex = p.stepIndex >= 1 && vertex;
  const showRoots = p.stepIndex >= 2;
  const showCallout = p.stepIndex >= 0;

  const eqStr = `y = ${a}x² ${b >= 0 ? "+" : "−"} ${Math.abs(b)}x ${c >= 0 ? "+" : "−"} ${Math.abs(c)}`;

  return (
    <div className="bc-stage bc-stage--grapher">
      <div className="bc-header">
        <span className="bc-eyebrow">graph · {p.script.title}</span>
        <h2 className="tutor-serif bc-title">{step.title}</h2>
        <p className="bc-equation">
          <InlineMath
            math={`y = ${a}x^2 ${b >= 0 ? "+" : "-"} ${Math.abs(b)}x ${c >= 0 ? "+" : "-"} ${Math.abs(c)}`}
          />
        </p>
      </div>

      <div className="bc-plot-wrap">
        <svg viewBox={`0 0 ${w} ${h}`} className="bc-plot" preserveAspectRatio="xMidYMid meet">
          {/* grid */}
          <g className="bc-grid">
            {Array.from({ length: xMax - xMin + 1 }, (_, i) => xMin + i).map((x) => (
              <line key={`vx${x}`} x1={sx(x)} y1={pad} x2={sx(x)} y2={h - pad} />
            ))}
            {Array.from({ length: yMax - yMin + 1 }, (_, i) => yMin + i).map((y) => (
              <line key={`hy${y}`} x1={pad} y1={sy(y)} x2={w - pad} y2={sy(y)} />
            ))}
          </g>
          {/* axes */}
          <line className="bc-axis" x1={pad} y1={sy(0)} x2={w - pad} y2={sy(0)} />
          <line className="bc-axis" x1={sx(0)} y1={pad} x2={sx(0)} y2={h - pad} />
          {/* x-labels */}
          {Array.from({ length: xMax - xMin + 1 }, (_, i) => xMin + i)
            .filter((x) => x !== 0)
            .map((x) => (
              <text
                key={`xl${x}`}
                className="bc-axis-label"
                x={sx(x)}
                y={sy(0) + 18}
                textAnchor="middle"
              >
                {x}
              </text>
            ))}
          {/* curve */}
          {showCurve && (
            <path
              key={`curve-${p.stepIndex}`}
              d={pathD}
              className="bc-curve"
              style={{
                strokeDasharray: 2000,
                strokeDashoffset: 2000,
                animation: "bc-draw 1.4s ease-out forwards",
              }}
            />
          )}
          {/* vertex */}
          {showVertex && vertex && (
            <g className="tutor-fade-in">
              <circle cx={sx(vertex[0])} cy={sy(vertex[1])} r="6" className="bc-vertex" />
              <text x={sx(vertex[0]) + 12} y={sy(vertex[1]) - 8} className="bc-annot">
                vertex ({vertex[0]}, {vertex[1]})
              </text>
            </g>
          )}
          {/* roots */}
          {showRoots &&
            roots.map((r, i) => (
              <g
                key={`root-${r}`}
                className="tutor-fade-in"
                style={{ animationDelay: `${i * 250}ms` }}
              >
                <circle cx={sx(r)} cy={sy(0)} r="8" className="bc-root" />
                <text
                  x={sx(r)}
                  y={sy(0) + 32}
                  className="bc-annot bc-annot--accent"
                  textAnchor="middle"
                >
                  x = {r}
                </text>
              </g>
            ))}
        </svg>
      </div>

      {showCallout && d.captions?.[p.stepIndex] && (
        <CaptionBubble text={d.captions[p.stepIndex]} kind={step.kind} />
      )}

      <BoardChrome {...p} />
    </div>
  );
};

/* ========================================================================== */
/*  B · Algebra Tiles — visual factoring                                      */
/* ========================================================================== */

const Tiles: React.FC<ConceptProps> = (p) => {
  const d = fallbackDiagram(p.script);
  const step = p.script.steps[p.stepIndex];
  const tiles = d.tiles ?? { xSquared: 1, x: 0, unit: 0 };

  // rearranged into a rectangle only from step 2+
  const rearranged = p.stepIndex >= 2;

  const xTiles = Math.abs(tiles.x);
  const uTiles = Math.abs(tiles.unit);
  const xSign = tiles.x < 0 ? "−" : "+";
  const uSign = tiles.unit < 0 ? "−" : "+";

  return (
    <div className="bc-stage bc-stage--tiles">
      <div className="bc-header">
        <span className="bc-eyebrow">tiles · {p.script.title}</span>
        <h2 className="tutor-serif bc-title">{step.title}</h2>
        <p className="bc-equation">
          <InlineMath math={`${tiles.xSquared}x^2 ${xSign} ${xTiles}x ${uSign} ${uTiles}`} />
        </p>
      </div>

      <div className={`bc-tiles ${rearranged ? "is-rearranged" : ""}`}>
        <div className="bc-tile-group">
          <span className="bc-tile-label">x²</span>
          {Array.from({ length: tiles.xSquared }).map((_, i) => (
            <div key={`sq-${i}`} className="bc-tile bc-tile--sq" />
          ))}
        </div>
        <div className="bc-tile-group">
          <span className="bc-tile-label">
            {xSign} x · {xTiles}
          </span>
          {Array.from({ length: xTiles }).map((_, i) => (
            <div
              key={`x-${i}`}
              className="bc-tile bc-tile--x"
              data-neg={tiles.x < 0}
              style={{ transitionDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
        <div className="bc-tile-group">
          <span className="bc-tile-label">
            {uSign} {uTiles}
          </span>
          {Array.from({ length: uTiles }).map((_, i) => (
            <div
              key={`u-${i}`}
              className="bc-tile bc-tile--u"
              data-neg={tiles.unit < 0}
              style={{ transitionDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      </div>

      {rearranged && tiles.factored && (
        <div className="bc-tiles-caption tutor-fade-in">
          rearranges into a rectangle · sides
          <strong> ({tiles.factored[0]}) </strong>
          and
          <strong> ({tiles.factored[1]}) </strong>— that's the factored form.
        </div>
      )}

      {d.captions?.[p.stepIndex] && (
        <CaptionBubble text={d.captions[p.stepIndex]} kind={step.kind} />
      )}
      <BoardChrome {...p} />
    </div>
  );
};

/* ========================================================================== */
/*  C · Number Line — roots as animated points                                */
/* ========================================================================== */

const NumberLine: React.FC<ConceptProps> = (p) => {
  const d = fallbackDiagram(p.script);
  const step = p.script.steps[p.stepIndex];
  const nl = d.numberLine ?? { points: [], range: [-5, 5] as [number, number] };
  const [min, max] = nl.range;
  const w = 900,
    h = 220,
    pad = 60;
  const sx = (x: number) => pad + ((x - min) / (max - min)) * (w - 2 * pad);

  const ticks = [] as number[];
  for (let i = Math.ceil(min); i <= Math.floor(max); i++) ticks.push(i);

  const revealCount = Math.min(nl.points.length, p.stepIndex + 1);

  return (
    <div className="bc-stage bc-stage--line">
      <div className="bc-header">
        <span className="bc-eyebrow">number line · {p.script.title}</span>
        <h2 className="tutor-serif bc-title">{step.title}</h2>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="bc-numline" preserveAspectRatio="xMidYMid meet">
        <line className="bc-nl-axis" x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} />
        {ticks.map((t) => (
          <g key={t}>
            <line className="bc-nl-tick" x1={sx(t)} y1={h / 2 - 8} x2={sx(t)} y2={h / 2 + 8} />
            <text className="bc-nl-num" x={sx(t)} y={h / 2 + 32} textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        {/* interval shading between two points, once both revealed */}
        {revealCount >= 2 && (
          <rect
            className="bc-nl-band tutor-fade-in"
            x={Math.min(sx(nl.points[0].x), sx(nl.points[1].x))}
            y={h / 2 - 20}
            width={Math.abs(sx(nl.points[1].x) - sx(nl.points[0].x))}
            height={40}
            rx={6}
          />
        )}
        {nl.points.slice(0, revealCount).map((pt, i) => (
          <g key={pt.x} className="tutor-fade-in" style={{ animationDelay: `${i * 250}ms` }}>
            <circle cx={sx(pt.x)} cy={h / 2} r="12" className="bc-nl-dot" />
            <text className="bc-nl-label" x={sx(pt.x)} y={h / 2 - 22} textAnchor="middle">
              {pt.label ?? pt.x}
            </text>
          </g>
        ))}
      </svg>

      {d.captions?.[p.stepIndex] && (
        <CaptionBubble text={d.captions[p.stepIndex]} kind={step.kind} />
      )}
      <BoardChrome {...p} />
    </div>
  );
};

/* ========================================================================== */
/*  D · Storyboard — animated scene per step, arrows + big math               */
/* ========================================================================== */

const Storyboard: React.FC<ConceptProps> = (p) => {
  const step = p.script.steps[p.stepIndex];
  const bigMath = useMemo(() => {
    if (step.kind === "explanation") return step.math;
    if (step.kind === "example") return step.lines.find((l) => l.math)?.math;
    if (step.kind === "practice") return step.math;
    return undefined;
  }, [step]);
  const captions = fallbackDiagram(p.script).captions ?? [];

  return (
    <div className="bc-stage bc-stage--story">
      <div className="bc-story-scene tutor-fade-in" key={p.stepIndex}>
        <div className="bc-story-frame">
          <span className="bc-story-corner bc-story-corner--tl" />
          <span className="bc-story-corner bc-story-corner--tr" />
          <span className="bc-story-corner bc-story-corner--bl" />
          <span className="bc-story-corner bc-story-corner--br" />

          <p className="bc-eyebrow">
            scene {p.stepIndex + 1} of {p.script.steps.length} · {step.kind}
          </p>
          <h2 className="tutor-serif bc-story-title">{step.title}</h2>

          {bigMath && (
            <div className="bc-story-math tutor-fade-in">
              <BlockMath math={bigMath} />
            </div>
          )}

          {step.kind === "explanation" && <p className="bc-story-body">{step.body}</p>}
          {step.kind === "example" && (
            <ul className="bc-story-list">
              {step.lines
                .filter((l) => l.text)
                .map((l, i) => (
                  <li key={i} className="tutor-fade-in" style={{ animationDelay: `${i * 200}ms` }}>
                    {l.text}
                  </li>
                ))}
            </ul>
          )}
          {step.kind === "practice" && step.options && (
            <div className="bc-story-options">
              {step.options.map((opt, i) => (
                <button key={i} className="bc-story-option">
                  <span>{String.fromCharCode(65 + i)}</span>
                  <InlineMath math={opt} />
                </button>
              ))}
            </div>
          )}

          {captions[p.stepIndex] && <p className="bc-story-caption">→ {captions[p.stepIndex]}</p>}
        </div>
      </div>

      <BoardChrome {...p} />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Registry                                                                  */
/* -------------------------------------------------------------------------- */

/* ========================================================================== */
/*  E · Ruled Board — Lumen writes line by line on a lined whiteboard         */
/* ========================================================================== */

type BoardLine = {
  key: string;
  stepIndex: number;
  kind: "eyebrow" | "title" | "body" | "math" | "note" | "option";
  text?: string;
  math?: string;
};

function flattenScript(script: LessonScript): BoardLine[] {
  const out: BoardLine[] = [];
  script.steps.forEach((step, si) => {
    out.push({
      key: `${si}-eyebrow`,
      stepIndex: si,
      kind: "eyebrow",
      text: `${step.kind} · step ${si + 1}`,
    });
    out.push({ key: `${si}-title`, stepIndex: si, kind: "title", text: step.title });
    if (step.kind === "explanation") {
      splitSentences(step.body).forEach((s, i) =>
        out.push({ key: `${si}-b-${i}`, stepIndex: si, kind: "body", text: s }),
      );
      if (step.math) out.push({ key: `${si}-m`, stepIndex: si, kind: "math", math: step.math });
    } else if (step.kind === "example") {
      step.lines.forEach((l, i) => {
        if (l.math) out.push({ key: `${si}-l-${i}`, stepIndex: si, kind: "math", math: l.math });
        else if (l.text)
          out.push({ key: `${si}-l-${i}`, stepIndex: si, kind: "body", text: l.text });
      });
    } else {
      out.push({ key: `${si}-p`, stepIndex: si, kind: "body", text: step.prompt });
      if (step.math) out.push({ key: `${si}-pm`, stepIndex: si, kind: "math", math: step.math });
      (step.options ?? []).forEach((o, i) =>
        out.push({ key: `${si}-o-${i}`, stepIndex: si, kind: "option", math: o }),
      );
      if (step.hint)
        out.push({ key: `${si}-h`, stepIndex: si, kind: "note", text: `hint · ${step.hint}` });
    }
  });
  return out;
}

function splitSentences(s: string): string[] {
  return s
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function useTypewriter(text: string, active: boolean, speed = 22) {
  const [n, setN] = useState(active ? 0 : text.length);
  useEffect(() => {
    if (!active) {
      setN(text.length);
      return;
    }
    setN(0);
    const id = window.setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          window.clearInterval(id);
          return v;
        }
        return Math.min(text.length, v + 2);
      });
    }, speed);
    return () => window.clearInterval(id);
  }, [text, active, speed]);
  return text.slice(0, n);
}

function RuledLine({
  line,
  active,
  revealing,
  onSelect,
  isSelected,
  doodle,
}: {
  line: BoardLine;
  active: boolean;
  revealing: boolean;
  onSelect: () => void;
  isSelected: boolean;
  doodle?: string;
}) {
  const t = useTypewriter(line.text ?? "", revealing);
  const shown = revealing ? t : (line.text ?? "");
  const done = !revealing || shown.length === (line.text?.length ?? 0);

  return (
    <button
      className={`rb-line rb-line--${line.kind}`}
      data-active={active}
      data-selected={isSelected}
      onClick={onSelect}
      title="Tap to talk this line through with Lumen"
    >
      <span className="rb-line-glow" aria-hidden />
      {line.kind === "math" || line.kind === "option" ? (
        <span className="rb-line-math tutor-fade-in">
          {line.kind === "option" && <em className="rb-line-optkey">◆</em>}
          <BlockMath math={line.math ?? ""} />
        </span>
      ) : (
        <span className="rb-line-text">
          {shown}
          {!done && <span className="rb-caret" aria-hidden />}
        </span>
      )}
      {doodle && (
        <span className="rb-line-doodle" aria-hidden dangerouslySetInnerHTML={{ __html: doodle }} />
      )}
    </button>
  );
}

type Turn = { from: "tutor" | "you"; text: string };

function seedTurns(line: BoardLine, step: LessonStep, moduleId: string): Turn[] {
  const scripted = getHints(moduleId);
  const opener: Turn = { from: "tutor", text: openerFor(line, step) };
  return [opener, ...scripted.slice(0, 2)];
}

function openerFor(line: BoardLine, step: LessonStep): string {
  if (line.kind === "math") return "Want me to walk through this line, or picture it another way?";
  if (line.kind === "option")
    return "Not sure which one? Tell me what you're thinking and we'll test it.";
  if (line.kind === "title") return `We're on “${step.title}”. What part feels fuzzy?`;
  if (line.kind === "note") return "That hint is a nudge — want to try it, or hear why it works?";
  return "Say more — where does this feel tricky?";
}

const RuledBoard: React.FC<ConceptProps> = (p) => {
  const lines = useMemo(() => flattenScript(p.script), [p.script]);
  const visibleUpTo = p.stepIndex;
  const visible = useMemo(
    () => lines.filter((l) => l.stepIndex <= visibleUpTo),
    [lines, visibleUpTo],
  );
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [doodles, setDoodles] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track the newest line so we can play the write-in animation only there.
  useEffect(() => {
    const last = visible[visible.length - 1];
    if (!last) return;
    setRevealedKey(last.key);
  }, [visible.length]);

  // Auto-scroll to the newest line.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [visible.length]);

  const openLineChat = useCallback(
    (line: BoardLine) => {
      setSelected(line.key);
      const step = p.script.steps[line.stepIndex];
      setTurns(seedTurns(line, step, p.script.moduleId));
    },
    [p.script],
  );

  const closeChat = () => setSelected(null);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const you: Turn = { from: "you", text };
    const reply: Turn = { from: "tutor", text: mockReply(text) };
    setTurns((prev) => [...prev, you, reply]);
    setDraft("");
  };

  const askForDoodle = () => {
    if (!selected) return;
    const kind = lines.find((l) => l.key === selected)?.kind ?? "body";
    const svg = analogyDoodle(kind);
    setDoodles((d) => ({ ...d, [selected]: svg }));
    setTurns((prev) => [
      ...prev,
      { from: "you", text: "Draw it for me?" },
      { from: "tutor", text: "Sketching it beside that line — take a look ✍️" },
    ]);
  };

  const total = p.script.steps.length;

  return (
    <div className="rb-stage">
      {/* The lined whiteboard */}
      <div className={`rb-board ${selected ? "is-shifted" : ""}`}>
        <div className="rb-board-head">
          <span className="rb-eyebrow">whiteboard · {p.script.title}</span>
          <span className="rb-progress">
            step {p.stepIndex + 1} of {total}
          </span>
        </div>
        <div className="rb-scroll" ref={scrollRef}>
          <div className="rb-rules" aria-hidden />
          <div className="rb-lines">
            {visible.map((line) => (
              <RuledLine
                key={line.key}
                line={line}
                active={line.stepIndex === p.stepIndex}
                revealing={line.key === revealedKey}
                onSelect={() => openLineChat(line)}
                isSelected={selected === line.key}
                doodle={doodles[line.key]}
              />
            ))}
            <div className="rb-tail" aria-hidden>
              <span className="rb-tail-nib" />
            </div>
          </div>
        </div>
        <div className="rb-chrome">
          <button
            className="rb-btn"
            onClick={() => p.goto(Math.max(0, p.stepIndex - 1))}
            disabled={p.stepIndex === 0}
          >
            ‹ back
          </button>
          <button className="rb-btn rb-btn--ghost" onClick={p.onWriteMath}>
            ✏️ write math
          </button>
          <button className="rb-btn rb-btn--ghost" onClick={p.onOpenLive}>
            🔊 full live
          </button>
          <button
            className="rb-btn rb-btn--primary"
            onClick={() => p.goto(Math.min(total - 1, p.stepIndex + 1))}
            disabled={p.stepIndex >= total - 1}
          >
            write next line ›
          </button>
        </div>
      </div>

      {/* Glassy transcript */}
      <aside className={`rb-glass ${selected ? "is-open" : ""}`} aria-hidden={!selected}>
        <div className="rb-glass-head">
          <div className="rb-glass-orb" aria-hidden />
          <div className="rb-glass-title">
            <p className="rb-glass-name">Lumen · live</p>
            <p className="rb-glass-sub">talking about this line</p>
          </div>
          <button className="rb-glass-close" onClick={closeChat} aria-label="Close transcript">
            ✕
          </button>
        </div>
        <div className="rb-glass-transcript">
          {turns.map((t, i) => (
            <div key={i} className={`rb-turn rb-turn--${t.from} tutor-fade-in`}>
              {t.text}
            </div>
          ))}
        </div>
        <div className="rb-glass-actions">
          <button className="rb-glass-chip" onClick={askForDoodle}>
            ✎ draw it on the board
          </button>
        </div>
        <form
          className="rb-glass-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type or just keep listening…"
            aria-label="Message Lumen"
          />
          <button type="submit" disabled={!draft.trim()}>
            send
          </button>
        </form>
        <p className="rb-glass-hint">
          You can close this and keep chatting — Lumen stays live in the corner.
        </p>
      </aside>

      {/* Floating live pip when panel is closed */}
      {!selected && turns.length > 0 && (
        <button className="rb-live-pip tutor-fade-in" onClick={() => setSelected(selected)}>
          <span className="rb-live-pip-orb" /> Lumen · still here
        </button>
      )}
    </div>
  );
};

function mockReply(input: string): string {
  const lower = input.toLowerCase();
  if (/why/.test(lower))
    return "Great 'why'. Think about what happens on each side of the equation when we do the same move — nothing changes, right?";
  if (/stuck|help|confus/.test(lower))
    return "Totally okay. Let's slow down — what's the very last part that still made sense to you?";
  if (/\?$/.test(input))
    return "Good question. Try it out loud first — I'll follow along and jump in if you drift.";
  return "Yes — say more. What made you notice that?";
}

function analogyDoodle(kind: BoardLine["kind"]): string {
  if (kind === "math") {
    return `<svg viewBox="0 0 140 90"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 70 Q 40 10, 70 70 T 130 70"/><circle cx="45" cy="70" r="3" fill="currentColor"/><circle cx="95" cy="70" r="3" fill="currentColor"/><text x="70" y="86" text-anchor="middle" font-size="10" fill="currentColor" stroke="none">roots</text></g></svg>`;
  }
  if (kind === "option") {
    return `<svg viewBox="0 0 140 60"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="8" y="16" width="52" height="28" rx="6"/><rect x="80" y="16" width="52" height="28" rx="6"/><path d="M65 30 h 10" /></g></svg>`;
  }
  return `<svg viewBox="0 0 140 80"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 60 C 30 20, 60 20, 78 60"/><path d="M78 60 l 12 -8 M78 60 l -4 -12"/><circle cx="110" cy="30" r="10"/></g></svg>`;
}

/* -------------------------------------------------------------------------- */
/*  Registry                                                                  */
/* -------------------------------------------------------------------------- */

export const BOARD_CONCEPTS: ConceptDef[] = [
  {
    id: "math-canvas",
    name: "Math Canvas",
    tagline:
      "An infinite whiteboard: Lumen writes, sketches and drops interactive diagrams beat by beat.",
    mood: "Signature",
    boardTone: "hidden",
    Component: (p) => (
      <MathCanvas
        script={p.script}
        stepIndex={p.stepIndex}
        goto={p.goto}
        demoActive={p.demoActive}
        onWriteMath={p.onWriteMath}
        onOpenLive={p.onOpenLive}
        nextModule={p.nextModule}
        onNextModule={p.onNextModule}
      />
    ),
  },
  {
    id: "ruled",
    name: "Live Whiteboard",
    tagline: "Lumen writes on a plain whiteboard — tap any line to talk it through.",
    mood: "Immersive",
    boardTone: "light",
    Component: RuledBoard,
  },
  {
    id: "grapher",
    name: "Grapher",
    tagline: "Live parabola with roots landing on the axis.",
    mood: "Visual",
    boardTone: "hidden",
    Component: Grapher,
  },
  {
    id: "tiles",
    name: "Algebra Tiles",
    tagline: "Blocks that rearrange into the factored rectangle.",
    mood: "Hands-on",
    boardTone: "hidden",
    Component: Tiles,
  },
  {
    id: "numline",
    name: "Number Line",
    tagline: "Roots snap onto a line, interval shades in.",
    mood: "Spatial",
    boardTone: "hidden",
    Component: NumberLine,
  },
  {
    id: "storyboard",
    name: "Storyboard",
    tagline: "Each step is a framed scene with big math.",
    mood: "Cinematic",
    boardTone: "hidden",
    Component: Storyboard,
  },
];
