import { useMemo, useState } from "react";

const X_MIN = -10;
const X_MAX = 10;
const Y_MIN = -10;
const Y_MAX = 10;

export function ParabolaWidget({ width, height }: { width: number; height: number }) {
  const [a, setA] = useState(1);
  const [b, setB] = useState(-5);
  const [c, setC] = useState(6);

  const plotH = height - 130;
  const plotW = width;

  const toPx = (x: number, y: number) => {
    const px = ((x - X_MIN) / (X_MAX - X_MIN)) * plotW;
    const py = plotH - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * plotH;
    return [px, py] as const;
  };

  const path = useMemo(() => {
    const parts: string[] = [];
    const steps = 240;
    let penUp = true;
    for (let i = 0; i <= steps; i++) {
      const x = X_MIN + ((X_MAX - X_MIN) * i) / steps;
      const y = a * x * x + b * x + c;
      if (y < Y_MIN - 5 || y > Y_MAX + 5) {
        penUp = true;
        continue;
      }
      const [px, py] = toPx(x, y);
      parts.push(`${penUp ? "M" : "L"} ${px.toFixed(2)} ${py.toFixed(2)}`);
      penUp = false;
    }
    return parts.join(" ");
  }, [a, b, c, plotH, plotW]);

  const discriminant = b * b - 4 * a * c;
  const roots =
    discriminant >= 0 && a !== 0
      ? [
          (-b + Math.sqrt(discriminant)) / (2 * a),
          (-b - Math.sqrt(discriminant)) / (2 * a),
        ]
      : [];
  const vertex = a !== 0 ? ([-b / (2 * a), c - (b * b) / (4 * a)] as const) : null;

  const gridXs = Array.from({ length: X_MAX - X_MIN + 1 }, (_, i) => X_MIN + i);
  const gridYs = Array.from({ length: Y_MAX - Y_MIN + 1 }, (_, i) => Y_MIN + i);

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <svg width={plotW} height={plotH} className="block">
        {gridXs.map((x) => {
          const [px] = toPx(x, 0);
          return (
            <line
              key={`gx${x}`}
              x1={px}
              x2={px}
              y1={0}
              y2={plotH}
              stroke={x === 0 ? "#111" : "#e5e5e5"}
              strokeWidth={x === 0 ? 1.5 : 1}
            />
          );
        })}
        {gridYs.map((y) => {
          const [, py] = toPx(0, y);
          return (
            <line
              key={`gy${y}`}
              x1={0}
              x2={plotW}
              y1={py}
              y2={py}
              stroke={y === 0 ? "#111" : "#e5e5e5"}
              strokeWidth={y === 0 ? 1.5 : 1}
            />
          );
        })}
        <path d={path} fill="none" stroke="#4338ca" strokeWidth={2.5} />
        {roots.map((r, i) => {
          const [px, py] = toPx(r, 0);
          return (
            <g key={i}>
              <circle cx={px} cy={py} r={5} fill="#4338ca" />
              <text
                x={px + 8}
                y={py - 8}
                fontSize={14}
                fill="#4338ca"
                style={{ fontFamily: "var(--font-plot)" }}
              >
                x = {r.toFixed(2)}
              </text>
            </g>
          );
        })}
        {vertex && vertex[1] >= Y_MIN && vertex[1] <= Y_MAX
          ? (() => {
              const [vx, vy] = toPx(vertex[0], vertex[1]);
              return (
                <g>
                  <circle
                    cx={vx}
                    cy={vy}
                    r={4}
                    fill="none"
                    stroke="#111"
                    strokeWidth={1.5}
                  />
                  <text
                    x={vx + 8}
                    y={vy + 16}
                    fontSize={13}
                    fill="#111"
                    style={{ fontFamily: "var(--font-plot)" }}
                  >
                    vertex
                  </text>
                </g>
              );
            })()
          : null}
      </svg>

      <div
        className="mt-2 grid grid-cols-3 gap-3 px-3 text-sm text-neutral-800"
        style={{ fontFamily: "var(--font-plot)" }}
      >
        <SliderRow label="a" value={a} min={-3} max={3} step={0.1} onChange={setA} />
        <SliderRow label="b" value={b} min={-10} max={10} step={0.5} onChange={setB} />
        <SliderRow label="c" value={c} min={-10} max={10} step={0.5} onChange={setC} />
      </div>
      <div
        className="mt-1 px-3 text-base text-neutral-700"
        style={{ fontFamily: "var(--font-plot)" }}
      >
        y = {fmt(a)}x² {sign(b)} {fmt(Math.abs(b))}x {sign(c)} {fmt(Math.abs(c))}
        {"   ·   "}
        Δ = {discriminant.toFixed(2)}{" "}
        {discriminant > 0
          ? "(two real roots)"
          : discriminant === 0
            ? "(one real root)"
            : "(no real roots)"}
      </div>
    </div>
  );
}

function fmt(n: number) {
  return Number(n.toFixed(2)).toString();
}
function sign(n: number) {
  return n >= 0 ? "+" : "−";
}

function SliderRow({
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
    <label className="flex items-center gap-2">
      <span className="w-4 font-bold">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-indigo-700"
      />
      <span className="w-10 text-right tabular-nums">{fmt(value)}</span>
    </label>
  );
}