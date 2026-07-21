import { useMemo, useState } from "react";

const X_MIN = -10, X_MAX = 10, Y_MIN = -10, Y_MAX = 10;

export function ParabolaWidget({
  width,
  height,
  initial,
}: {
  width: number;
  height: number;
  initial?: { a: number; b: number; c: number };
}) {
  const [a, setA] = useState(initial?.a ?? 1);
  const [b, setB] = useState(initial?.b ?? -5);
  const [c, setC] = useState(initial?.c ?? 6);

  const plotH = height - 130;
  const plotW = width;
  const toPx = (x: number, y: number) => [
    ((x - X_MIN) / (X_MAX - X_MIN)) * plotW,
    plotH - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * plotH,
  ] as const;

  const path = useMemo(() => {
    const parts: string[] = [];
    const steps = 240;
    let penUp = true;
    for (let i = 0; i <= steps; i++) {
      const x = X_MIN + ((X_MAX - X_MIN) * i) / steps;
      const y = a * x * x + b * x + c;
      if (y < Y_MIN - 5 || y > Y_MAX + 5) { penUp = true; continue; }
      const [px, py] = toPx(x, y);
      parts.push(`${penUp ? "M" : "L"} ${px.toFixed(2)} ${py.toFixed(2)}`);
      penUp = false;
    }
    return parts.join(" ");
  }, [a, b, c, plotH, plotW]);

  const disc = b * b - 4 * a * c;
  const roots = disc >= 0 && a !== 0
    ? [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)]
    : [];
  const vertex = a !== 0 ? ([-b / (2 * a), c - (b * b) / (4 * a)] as const) : null;

  const gridXs = Array.from({ length: X_MAX - X_MIN + 1 }, (_, i) => X_MIN + i);
  const gridYs = Array.from({ length: Y_MAX - Y_MIN + 1 }, (_, i) => Y_MIN + i);

  return (
    <div className="mc-para">
      <svg width={plotW} height={plotH} className="block">
        {gridXs.map((x) => {
          const [px] = toPx(x, 0);
          return <line key={`gx${x}`} x1={px} x2={px} y1={0} y2={plotH}
            stroke={x === 0 ? "oklch(0.2 0 0)" : "oklch(0.92 0 0)"}
            strokeWidth={x === 0 ? 1.4 : 1} />;
        })}
        {gridYs.map((y) => {
          const [, py] = toPx(0, y);
          return <line key={`gy${y}`} x1={0} x2={plotW} y1={py} y2={py}
            stroke={y === 0 ? "oklch(0.2 0 0)" : "oklch(0.92 0 0)"}
            strokeWidth={y === 0 ? 1.4 : 1} />;
        })}
        <path d={path} fill="none" stroke="oklch(0.55 0.16 55)" strokeWidth={2.8} />
        {roots.map((r, i) => {
          const [px, py] = toPx(r, 0);
          return (
            <g key={i}>
              <circle cx={px} cy={py} r={5.5} fill="oklch(0.55 0.16 55)" />
              <text x={px + 8} y={py - 8} fontSize={14} fill="oklch(0.35 0.1 55)"
                style={{ fontFamily: "var(--font-serif)" }}>x = {r.toFixed(2)}</text>
            </g>
          );
        })}
        {vertex && vertex[1] >= Y_MIN && vertex[1] <= Y_MAX ? (() => {
          const [vx, vy] = toPx(vertex[0], vertex[1]);
          return (
            <g>
              <circle cx={vx} cy={vy} r={4.5} fill="none" stroke="oklch(0.2 0 0)" strokeWidth={1.5} />
              <text x={vx + 8} y={vy + 16} fontSize={13} fill="oklch(0.2 0 0)"
                style={{ fontFamily: "var(--font-serif)" }}>vertex</text>
            </g>
          );
        })() : null}
      </svg>
      <div className="mc-para-sliders">
        <Slider label="a" value={a} min={-3} max={3} step={0.1} onChange={setA} />
        <Slider label="b" value={b} min={-10} max={10} step={0.5} onChange={setB} />
        <Slider label="c" value={c} min={-10} max={10} step={0.5} onChange={setC} />
      </div>
      <p className="mc-para-caption">
        y = {fmt(a)}x² {sign(b)} {fmt(Math.abs(b))}x {sign(c)} {fmt(Math.abs(c))}
        <span className="mc-para-sep">·</span>
        Δ = {disc.toFixed(2)}{" "}
        {disc > 0 ? "(two roots)" : disc === 0 ? "(one root)" : "(no real roots)"}
      </p>
    </div>
  );
}

const fmt = (n: number) => Number(n.toFixed(2)).toString();
const sign = (n: number) => (n >= 0 ? "+" : "−");

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <label className="mc-para-slider">
      <span className="mc-para-slider-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="mc-para-slider-value">{fmt(value)}</span>
    </label>
  );
}