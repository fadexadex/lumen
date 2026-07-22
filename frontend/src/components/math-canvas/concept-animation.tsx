import type { ConceptAnimation, ConceptScene } from "@/lib/types";
import { activeConceptScene } from "@/lib/concept-visual";
import { Equation, toHandMath } from "./equation";
import { MathText } from "@/lib/math-text";

export function ConceptAnimationPlayer({
  animation,
  stepIndex,
  stepTotal,
  width,
  height,
  plotOverride,
}: {
  animation: ConceptAnimation;
  stepIndex: number;
  stepTotal: number;
  width: number;
  height: number;
  plotOverride?: { a: number; b: number; c: number } | null;
}) {
  const { scene, index } = activeConceptScene(animation, stepIndex, stepTotal);
  const renderedScene =
    plotOverride && scene.primitive === "plotFunction" && scene.fn === "parabola"
      ? { ...scene, ...plotOverride }
      : scene;

  return (
    <section
      className="mc-concept"
      style={{ width, height }}
      aria-label={`${animation.title}: ${scene.narration}`}
    >
      <header className="mc-concept-head">
        <div>
          <p className="mc-concept-kicker">visual model</p>
          <h3>{animation.title}</h3>
        </div>
        <span
          className="mc-concept-count"
          aria-label={`Scene ${index + 1} of ${animation.scenes.length}`}
        >
          {index + 1} / {animation.scenes.length}
        </span>
      </header>
      <div className="mc-concept-stage" key={`${index}-${scene.primitive}`}>
        <SceneView scene={renderedScene} />
      </div>
      <p className="mc-concept-caption">
        <span aria-hidden className="mc-concept-caption-mark" />
        {scene.narration}
      </p>
    </section>
  );
}

function SceneView({ scene }: { scene: ConceptScene }) {
  const Primitive = VISUAL_PRIMITIVES[scene.primitive];
  return <Primitive scene={scene} />;
}

type SceneOf<P extends ConceptScene["primitive"]> = Extract<ConceptScene, { primitive: P }>;
type PrimitiveProps = { scene: ConceptScene };

/** The model can only select components in this trusted, exhaustive registry. */
const VISUAL_PRIMITIVES: Record<ConceptScene["primitive"], React.FC<PrimitiveProps>> = {
  plotFunction: ({ scene }) => <PlotFunction scene={scene as SceneOf<"plotFunction">} />,
  numberLineWalk: ({ scene }) => <NumberLineWalk scene={scene as SceneOf<"numberLineWalk">} />,
  algebraTiles: ({ scene }) => <AlgebraTiles scene={scene as SceneOf<"algebraTiles">} />,
  balanceScale: ({ scene }) => <BalanceScale scene={scene as SceneOf<"balanceScale">} />,
  partitionGrid: ({ scene }) => <PartitionGrid scene={scene as SceneOf<"partitionGrid">} />,
  fractionBar: ({ scene }) => <FractionBars scene={scene as SceneOf<"fractionBar">} />,
  countObjects: ({ scene }) => <CountObjects scene={scene as SceneOf<"countObjects">} />,
  geometryTransform: ({ scene }) => (
    <GeometryTransform scene={scene as SceneOf<"geometryTransform">} />
  ),
  stepReveal: ({ scene }) => <StepReveal scene={scene as SceneOf<"stepReveal">} />,
};

const W = 560;
const H = 330;

function PlotFunction({ scene }: { scene: SceneOf<"plotFunction"> }) {
  const xMin = -6;
  const xMax = 6;
  const yMin = -6;
  const yMax = 6;
  const pad = 34;
  const sx = (x: number) => pad + ((x - xMin) / (xMax - xMin)) * (W - pad * 2);
  const sy = (y: number) => H - pad - ((y - yMin) / (yMax - yMin)) * (H - pad * 2);
  const fn = (x: number) => {
    if (scene.fn === "line") return scene.a * x + scene.b;
    if (scene.fn === "absolute") return scene.a * Math.abs(x - scene.b) + scene.c;
    if (scene.fn === "cubic") return scene.a * (x - scene.b) ** 3 + scene.c;
    return scene.a * x * x + scene.b * x + scene.c;
  };
  let path = "";
  let drawing = false;
  for (let i = 0; i <= 240; i++) {
    const x = xMin + ((xMax - xMin) * i) / 240;
    const y = fn(x);
    if (y < yMin - 1 || y > yMax + 1) {
      drawing = false;
      continue;
    }
    path += `${drawing ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)} `;
    drawing = true;
  }
  const vertex =
    scene.fn === "parabola" && scene.a !== 0
      ? ([-scene.b / (2 * scene.a), scene.c - scene.b ** 2 / (4 * scene.a)] as const)
      : null;
  const disc = scene.b ** 2 - 4 * scene.a * scene.c;
  const roots =
    scene.fn === "parabola" && disc >= 0 && scene.a !== 0
      ? [(-scene.b + Math.sqrt(disc)) / (2 * scene.a), (-scene.b - Math.sqrt(disc)) / (2 * scene.a)]
      : [];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${scene.fn} function plot`}>
      <g className="mc-vis-grid">
        {Array.from({ length: 13 }, (_, i) => i - 6).map((n) => (
          <g key={n}>
            <line x1={sx(n)} x2={sx(n)} y1={pad} y2={H - pad} />
            <line x1={pad} x2={W - pad} y1={sy(n)} y2={sy(n)} />
          </g>
        ))}
      </g>
      <line className="mc-vis-axis" x1={pad} x2={W - pad} y1={sy(0)} y2={sy(0)} />
      <line className="mc-vis-axis" x1={sx(0)} x2={sx(0)} y1={pad} y2={H - pad} />
      <path className="mc-vis-stroke mc-vis-draw" d={path} />
      {vertex && scene.highlight?.includes("vertex") && inPlot(vertex[0], vertex[1]) ? (
        <g className="mc-vis-pop" style={{ animationDelay: "380ms" }}>
          <circle className="mc-vis-point" cx={sx(vertex[0])} cy={sy(vertex[1])} r="6" />
          <text className="mc-vis-label" x={sx(vertex[0]) + 10} y={sy(vertex[1]) - 10}>
            vertex
          </text>
        </g>
      ) : null}
      {scene.highlight?.includes("roots")
        ? roots
            .filter((root) => inPlot(root, 0))
            .map((root, index) => (
              <circle
                key={`${root}-${index}`}
                className="mc-vis-point mc-vis-pop"
                cx={sx(root)}
                cy={sy(0)}
                r="6"
              />
            ))
        : null}
    </svg>
  );
}

function NumberLineWalk({ scene }: { scene: SceneOf<"numberLineWalk"> }) {
  const [min, max] = scene.range;
  const x = (n: number) => 50 + ((n - min) / (max - min)) * 460;
  const stops = [scene.start, ...scene.hops.map((hop) => hop.to)];
  const integerSpan = Math.floor(max) - Math.ceil(min);
  const ticks =
    integerSpan <= 20
      ? Array.from({ length: integerSpan + 1 }, (_, i) => Math.ceil(min) + i)
      : stops;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Animated number line">
      <line className="mc-vis-axis mc-vis-draw" x1="42" x2="518" y1="210" y2="210" />
      <path className="mc-vis-axis" d="M42 210l12-7v14z M518 210l-12-7v14z" />
      {[...new Set(ticks)].map((tick) => (
        <g key={tick}>
          <line className="mc-vis-tick" x1={x(tick)} x2={x(tick)} y1="201" y2="219" />
          <text className="mc-vis-label" x={x(tick)} y="241" textAnchor="middle">
            {tick}
          </text>
        </g>
      ))}
      {scene.hops.map((hop, index) => {
        const from = stops[index];
        const left = Math.min(x(from), x(hop.to));
        const right = Math.max(x(from), x(hop.to));
        const height = Math.min(100, 34 + Math.abs(hop.to - from) * 5);
        return (
          <g
            key={`${from}-${hop.to}-${index}`}
            className="mc-vis-pop"
            style={{ animationDelay: `${index * 130}ms` }}
          >
            <path
              className="mc-vis-hop"
              d={`M${left},202 Q${(left + right) / 2},${202 - height} ${right},202`}
            />
            {hop.label ? (
              <text
                className="mc-vis-label"
                x={(left + right) / 2}
                y={186 - height}
                textAnchor="middle"
              >
                {hop.label}
              </text>
            ) : null}
          </g>
        );
      })}
      {stops.map((stop, index) => (
        <circle
          key={`${stop}-${index}`}
          className="mc-vis-point mc-vis-pop"
          cx={x(stop)}
          cy="210"
          r={index === stops.length - 1 ? 7 : 4}
        />
      ))}
    </svg>
  );
}

function AlgebraTiles({ scene }: { scene: SceneOf<"algebraTiles"> }) {
  const groups = [
    { key: "x2", count: scene.xSquared, label: "x²", x: 54, w: 78, h: 78 },
    { key: "x", count: scene.x, label: "x", x: 210, w: 34, h: 78 },
    { key: "one", count: scene.unit, label: "1", x: 370, w: 34, h: 34 },
  ];
  return (
    <div className="mc-vis-tiles" role="img" aria-label="Algebra tile model">
      <div className="mc-vis-tile-board">
        {groups.map((group) => (
          <div className="mc-vis-tile-group" key={group.key}>
            <div className="mc-vis-tile-stack">
              {Array.from({ length: Math.min(8, Math.abs(group.count)) }, (_, i) => (
                <span
                  key={i}
                  className="mc-vis-tile mc-vis-pop"
                  data-negative={group.count < 0 || undefined}
                  style={{ width: group.w, height: group.h, animationDelay: `${i * 55}ms` }}
                >
                  {group.label}
                </span>
              ))}
            </div>
            <span className="mc-vis-tile-total">
              {group.count} × {group.label}
            </span>
          </div>
        ))}
      </div>
      {scene.factored ? (
        <div className="mc-vis-factor">
          <Equation>{`(${toHandMath(scene.factored[0])})(${toHandMath(scene.factored[1])})`}</Equation>
        </div>
      ) : null}
    </div>
  );
}

function BalanceScale({ scene }: { scene: SceneOf<"balanceScale"> }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Equation balance scale">
      <line className="mc-vis-stand" x1="280" x2="280" y1="120" y2="278" />
      <path className="mc-vis-stand" d="M235 286h90M260 120h40l-20-28z" />
      <g className="mc-vis-balance" style={{ transformOrigin: "280px 120px" }}>
        <line className="mc-vis-beam" x1="105" x2="455" y1="120" y2="120" />
        <line className="mc-vis-rope" x1="130" x2="130" y1="120" y2="212" />
        <line className="mc-vis-rope" x1="430" x2="430" y1="120" y2="212" />
        <path className="mc-vis-pan" d="M72 212 Q130 250 188 212z" />
        <path className="mc-vis-pan" d="M372 212 Q430 250 488 212z" />
        <text className="mc-vis-balance-label" x="130" y="235" textAnchor="middle">
          {scene.left.map((item) => item.label).join(" + ")}
        </text>
        <text className="mc-vis-balance-label" x="430" y="235" textAnchor="middle">
          {scene.right.map((item) => item.label).join(" + ")}
        </text>
      </g>
      {scene.operation ? (
        <text className="mc-vis-operation" x="280" y="318" textAnchor="middle">
          {scene.operation}
        </text>
      ) : null}
    </svg>
  );
}

function PartitionGrid({ scene }: { scene: SceneOf<"partitionGrid"> }) {
  const cell = Math.min(42, 250 / Math.max(scene.rows, scene.cols));
  const gridW = scene.cols * cell;
  const gridH = scene.rows * cell;
  const startX = (W - gridW) / 2;
  const startY = (H - gridH) / 2;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${scene.rows} by ${scene.cols} partition grid`}
    >
      {Array.from({ length: scene.rows * scene.cols }, (_, index) => {
        const row = Math.floor(index / scene.cols);
        const col = index % scene.cols;
        return (
          <rect
            key={index}
            className={`mc-vis-cell ${index < scene.shaded ? "is-shaded mc-vis-pop" : ""}`}
            x={startX + col * cell}
            y={startY + row * cell}
            width={cell}
            height={cell}
            style={{ animationDelay: `${Math.min(index, 20) * 24}ms` }}
          />
        );
      })}
      {scene.colLabel ? (
        <text className="mc-vis-label" x={W / 2} y={startY - 16} textAnchor="middle">
          {scene.colLabel}
        </text>
      ) : null}
      {scene.rowLabel ? (
        <text
          className="mc-vis-label"
          x={startX - 20}
          y={H / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${startX - 20} ${H / 2})`}
        >
          {scene.rowLabel}
        </text>
      ) : null}
    </svg>
  );
}

function FractionBars({ scene }: { scene: SceneOf<"fractionBar"> }) {
  const bars = [
    { parts: scene.parts, shaded: scene.shaded },
    ...(scene.compareTo ? [scene.compareTo] : []),
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fraction bar comparison">
      {bars.map((bar, barIndex) => {
        const y = bars.length === 1 ? 132 : 78 + barIndex * 120;
        const cellW = 430 / bar.parts;
        return (
          <g key={barIndex}>
            {Array.from({ length: bar.parts }, (_, index) => (
              <rect
                key={index}
                className={`mc-vis-fraction ${index < bar.shaded ? "is-shaded mc-vis-pop" : ""}`}
                x={65 + index * cellW}
                y={y}
                width={cellW}
                height="68"
                style={{ animationDelay: `${index * 45}ms` }}
              />
            ))}
            <text className="mc-vis-fraction-label" x="280" y={y + 100} textAnchor="middle">
              {bar.shaded}/{bar.parts}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function CountObjects({ scene }: { scene: SceneOf<"countObjects"> }) {
  const columns = Math.ceil(scene.total / scene.groups);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${scene.total} objects in ${scene.groups} groups`}
    >
      {Array.from({ length: scene.total }, (_, index) => {
        const group = index % scene.groups;
        const within = Math.floor(index / scene.groups);
        const x = 65 + group * (430 / Math.max(1, scene.groups - 1));
        const y = 92 + within * Math.min(42, 180 / Math.max(1, columns - 1));
        return scene.shape === "square" ? (
          <rect
            key={index}
            className="mc-vis-object mc-vis-pop"
            x={x - 8}
            y={y - 8}
            width="16"
            height="16"
            style={{ animationDelay: `${index * 28}ms` }}
          />
        ) : scene.shape === "star" ? (
          <text
            key={index}
            className="mc-vis-star mc-vis-pop"
            x={x}
            y={y + 7}
            textAnchor="middle"
            style={{ animationDelay: `${index * 28}ms` }}
          >
            ★
          </text>
        ) : (
          <circle
            key={index}
            className="mc-vis-object mc-vis-pop"
            cx={x}
            cy={y}
            r="8"
            style={{ animationDelay: `${index * 28}ms` }}
          />
        );
      })}
      {Array.from({ length: scene.groups }, (_, index) => (
        <text
          key={index}
          className="mc-vis-label"
          x={65 + index * (430 / Math.max(1, scene.groups - 1))}
          y="310"
          textAnchor="middle"
        >
          group {index + 1}
        </text>
      ))}
    </svg>
  );
}

function GeometryTransform({ scene }: { scene: SceneOf<"geometryTransform"> }) {
  const shape =
    scene.shape === "triangle"
      ? "M-55 42L0-58L55 42Z"
      : scene.shape === "rectangle"
        ? "M-70-42H70V42H-70Z"
        : "M-52-52H52V52H-52Z";
  const transformed = transformFor(scene.transform, scene.amount);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${scene.transform} transformation`}>
      <line className="mc-vis-axis" x1="40" x2="520" y1="165" y2="165" />
      <line className="mc-vis-axis" x1="280" x2="280" y1="30" y2="300" />
      <path className="mc-vis-shape-original" d={shape} transform="translate(205 165)" />
      <path
        className="mc-vis-shape mc-vis-pop"
        d={shape}
        transform={`translate(205 165) ${transformed}`}
      />
      <text className="mc-vis-label" x="205" y="302" textAnchor="middle">
        original
      </text>
      <text className="mc-vis-label mc-vis-label--accent" x="405" y="302" textAnchor="middle">
        {scene.transform}
      </text>
    </svg>
  );
}

function StepReveal({ scene }: { scene: SceneOf<"stepReveal"> }) {
  return (
    <div className="mc-vis-steps" role="img" aria-label="Worked solution steps">
      {scene.lines.map((line, index) => (
        <div
          className="mc-vis-step mc-vis-rise"
          key={index}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <span className="mc-vis-step-num">{index + 1}</span>
          <div>
            {line.math ? (
              <Equation>{toHandMath(line.math)}</Equation>
            ) : (
              <MathText text={line.text ?? ""} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function inPlot(x: number, y: number) {
  return x >= -6 && x <= 6 && y >= -6 && y <= 6;
}

function transformFor(transform: SceneOf<"geometryTransform">["transform"], amount: number) {
  if (transform === "translate") return `translate(${Math.max(-40, Math.min(180, amount))} 0)`;
  if (transform === "rotate") return `translate(200 0) rotate(${amount})`;
  if (transform === "reflect") return "translate(200 0) scale(-1 1)";
  return `translate(200 0) scale(${Math.max(0.25, Math.min(2, Math.abs(amount)))})`;
}
