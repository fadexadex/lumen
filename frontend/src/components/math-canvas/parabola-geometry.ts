export interface ParabolaViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  yTicks: number[];
}

const DEFAULT_MIN = -10;
const DEFAULT_MAX = 10;

/** Keep the roots, intercept and in-range vertex legible without flattening the curve. */
export function parabolaViewport(a: number, b: number, c: number): ParabolaViewport {
  const vertexX = a !== 0 ? -b / (2 * a) : null;
  const vertexY = vertexX == null ? null : a * vertexX * vertexX + b * vertexX + c;
  const importantY = [0, c];
  if (vertexX != null && vertexY != null && vertexX >= DEFAULT_MIN && vertexX <= DEFAULT_MAX) {
    importantY.push(vertexY);
  }

  const low = Math.min(DEFAULT_MIN, ...importantY);
  const high = Math.max(DEFAULT_MAX, ...importantY);
  if (low === DEFAULT_MIN && high === DEFAULT_MAX) {
    return {
      xMin: DEFAULT_MIN,
      xMax: DEFAULT_MAX,
      yMin: DEFAULT_MIN,
      yMax: DEFAULT_MAX,
      yTicks: integerTicks(DEFAULT_MIN, DEFAULT_MAX, 2),
    };
  }

  const padding = Math.max(2, (high - low) * 0.12);
  const paddedLow = low < DEFAULT_MIN ? low - padding : DEFAULT_MIN;
  const paddedHigh = high > DEFAULT_MAX ? high + padding : DEFAULT_MAX;
  const tickStep = niceStep((paddedHigh - paddedLow) / 8);
  const yMin = Math.floor(paddedLow / tickStep) * tickStep;
  const yMax = Math.ceil(paddedHigh / tickStep) * tickStep;

  return {
    xMin: DEFAULT_MIN,
    xMax: DEFAULT_MAX,
    yMin,
    yMax,
    yTicks: integerTicks(yMin, yMax, tickStep),
  };
}

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(raw, Number.EPSILON)));
  const fraction = raw / power;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * power;
}

function integerTicks(min: number, max: number, step: number): number[] {
  const count = Math.round((max - min) / step);
  return Array.from({ length: count + 1 }, (_, index) => Number((min + index * step).toFixed(8)));
}
