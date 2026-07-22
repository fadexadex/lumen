import { useState } from "react";
import { parabolaViewport } from "./parabola-geometry";

export function ParabolaWidget({
  width,
  height,
  initial,
  value,
  onChange,
}: {
  width: number;
  height: number;
  initial?: { a: number; b: number; c: number };
  /** Controlled params — when set, drives the curve + sliders. */
  value?: { a: number; b: number; c: number };
  onChange?: (p: { a: number; b: number; c: number }) => void;
}) {
  const [local, setLocal] = useState(initial ?? { a: 1, b: -5, c: 6 });
  const controlled = value != null;
  const a = controlled ? value.a : local.a;
  const b = controlled ? value.b : local.b;
  const c = controlled ? value.c : local.c;
  const setParams = (next: { a: number; b: number; c: number }) => {
    if (!controlled) setLocal(next);
    onChange?.(next);
  };
  const setA = (n: number) => setParams({ a: n, b, c });
  const setB = (n: number) => setParams({ a, b: n, c });
  const setC = (n: number) => setParams({ a, b, c: n });

  const plotH = height - 130;
  const plotW = width;
  const { xMin, xMax, yMin, yMax, yTicks } = parabolaViewport(a, b, c);
  const toPx = (x: number, y: number) =>
    [((x - xMin) / (xMax - xMin)) * plotW, plotH - ((y - yMin) / (yMax - yMin)) * plotH] as const;

  const path = (() => {
    const parts: string[] = [];
    const steps = 240;
    let penUp = true;
    for (let i = 0; i <= steps; i++) {
      const x = xMin + ((xMax - xMin) * i) / steps;
      const y = a * x * x + b * x + c;
      if (y < yMin || y > yMax) {
        penUp = true;
        continue;
      }
      const [px, py] = toPx(x, y);
      parts.push(`${penUp ? "M" : "L"} ${px.toFixed(2)} ${py.toFixed(2)}`);
      penUp = false;
    }
    return parts.join(" ");
  })();

  const disc = b * b - 4 * a * c;
  const roots =
    disc >= 0 && a !== 0
      ? [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)]
      : [];
  const vertex = a !== 0 ? ([-b / (2 * a), c - (b * b) / (4 * a)] as const) : null;

  const gridXs = Array.from({ length: xMax - xMin + 1 }, (_, i) => xMin + i);

  return (
    <div className="mc-para">
      <svg
        width={plotW}
        height={plotH}
        className="block"
        role="img"
        aria-label={`Interactive graph of y equals ${fmt(a)} x squared ${sign(b)} ${fmt(Math.abs(b))} x ${sign(c)} ${fmt(Math.abs(c))}`}
      >
        {gridXs.map((x) => {
          const [px] = toPx(x, 0);
          return (
            <line
              key={`gx${x}`}
              x1={px}
              x2={px}
              y1={0}
              y2={plotH}
              stroke={x === 0 ? "oklch(0.2 0 0)" : "oklch(0.92 0 0)"}
              strokeWidth={x === 0 ? 1.4 : 1}
            />
          );
        })}
        {yTicks.map((y) => {
          const [, py] = toPx(0, y);
          return (
            <line
              key={`gy${y}`}
              x1={0}
              x2={plotW}
              y1={py}
              y2={py}
              stroke={y === 0 ? "oklch(0.2 0 0)" : "oklch(0.92 0 0)"}
              strokeWidth={y === 0 ? 1.4 : 1}
            />
          );
        })}
        {gridXs
          .filter((x) => x % 2 === 0 && x !== 0)
          .map((x) => {
            const [px, py] = toPx(x, 0);
            return (
              <text key={`tx${x}`} className="mc-para-tick" x={px} y={py + 15} textAnchor="middle">
                {x}
              </text>
            );
          })}
        {yTicks
          .filter((y) => y !== 0 && y !== yMin && y !== yMax)
          .map((y) => {
            const [px, py] = toPx(0, y);
            return (
              <text key={`ty${y}`} className="mc-para-tick" x={px + 6} y={py - 4}>
                {y}
              </text>
            );
          })}
        <text className="mc-para-axis-label" x={plotW - 10} y={toPx(0, 0)[1] - 7}>
          x
        </text>
        <text className="mc-para-axis-label" x={toPx(0, 0)[0] + 8} y={13}>
          y
        </text>
        <path d={path} fill="none" stroke="oklch(0.55 0.16 55)" strokeWidth={2.8} />
        {roots.map((r, i) => {
          const [px, py] = toPx(r, 0);
          return (
            <g key={i}>
              <circle cx={px} cy={py} r={5.5} fill="oklch(0.55 0.16 55)" />
              <text
                x={px + 8}
                y={py - 8}
                fontSize={14}
                fill="oklch(0.35 0.1 55)"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                x = {r.toFixed(2)}
              </text>
            </g>
          );
        })}
        {vertex && vertex[1] >= yMin && vertex[1] <= yMax
          ? (() => {
              const [vx, vy] = toPx(vertex[0], vertex[1]);
              return (
                <g>
                  <circle
                    cx={vx}
                    cy={vy}
                    r={4.5}
                    fill="none"
                    stroke="oklch(0.2 0 0)"
                    strokeWidth={1.5}
                  />
                  <text
                    x={vx - 8}
                    y={vy + 16}
                    textAnchor="end"
                    fontSize={13}
                    fill="oklch(0.2 0 0)"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    vertex
                  </text>
                </g>
              );
            })()
          : null}
      </svg>
      <div className="mc-para-sliders">
        <Slider label="a" value={a} min={-3} max={3} step={0.1} onChange={setA} />
        <Slider label="b" value={b} min={-10} max={10} step={0.5} onChange={setB} />
        <Slider
          label="c"
          value={c}
          min={Math.min(-10, Math.floor(c - 5))}
          max={Math.max(10, Math.ceil(c + 5))}
          step={0.5}
          onChange={setC}
        />
      </div>
      <p className="mc-para-caption">
        y = {fmt(a)}x² {sign(b)} {fmt(Math.abs(b))}x {sign(c)} {fmt(Math.abs(c))}
        <span className="mc-para-sep">·</span>Δ = {disc.toFixed(2)}{" "}
        {disc > 0 ? "(two roots)" : disc === 0 ? "(one root)" : "(no real roots)"}
      </p>
    </div>
  );
}

const fmt = (n: number) => Number(n.toFixed(2)).toString();
const sign = (n: number) => (n >= 0 ? "+" : "−");

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mc-para-slider">
      <span className="mc-para-slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="mc-para-slider-value">{fmt(value)}</span>
    </label>
  );
}
