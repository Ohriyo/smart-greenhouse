/** Chart helpers shared by AreaLineChart, MiniSparkline and the gauges. Pure functions. */

export interface Pt {
  x: number;
  y: number;
}

/** Round a step up to 1, 2, 2.5 or 5 × 10ⁿ so axis labels are readable. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * Y scale with `sections` equal steps covering [lo, hi] (plus extra values that
 * must be visible, e.g. a threshold). `floorZero`: never below 0 (%, lux).
 */
export function niceScale(
  values: readonly number[],
  {
    sections = 2,
    include = [],
    floorZero = false,
  }: { sections?: number; include?: readonly number[]; floorZero?: boolean } = {},
): Scale {
  const all = [...values, ...include].filter(Number.isFinite);
  if (all.length === 0) return { min: 0, max: 1, ticks: [0, 0.5, 1] };
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const pad = (hi - lo) * 0.15 || Math.max(1, Math.abs(hi) * 0.1);
  lo -= pad;
  hi += pad;
  if (floorZero && lo < 0) lo = 0;
  const step = niceStep((hi - lo) / sections);
  const min = Math.floor(lo / step) * step;
  let max = min + step * sections;
  while (max < hi) max += step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { min, max, ticks };
}

/**
 * Smooth path through points (monotone cubic: no overshoot, so a curve never
 * dips below a real minimum). `null` entries break the line (data gaps).
 */
export function smoothPath(points: readonly (Pt | null)[]): string {
  let d = '';
  let run: Pt[] = [];
  const flush = () => {
    if (run.length === 1) {
      const p = run[0];
      if (p) d += `M${p.x},${p.y}h0.01`;
    } else if (run.length > 1) {
      d += monotone(run);
    }
    run = [];
  };
  for (const p of points) {
    if (p) run.push(p);
    else flush();
  }
  flush();
  return d;
}

function monotone(p: Pt[]): string {
  const n = p.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = p[i] as Pt;
    const b = p[i + 1] as Pt;
    dx.push(b.x - a.x || 1e-6);
    slope.push((b.y - a.y) / (b.x - a.x || 1e-6));
  }
  const m: number[] = [slope[0] ?? 0];
  for (let i = 1; i < n - 1; i++) {
    const s0 = slope[i - 1] ?? 0;
    const s1 = slope[i] ?? 0;
    m.push(
      s0 * s1 <= 0
        ? 0
        : (3 * (dx[i - 1]! + dx[i]!)) /
            ((2 * dx[i]! + dx[i - 1]!) / s0 + (dx[i]! + 2 * dx[i - 1]!) / s1),
    );
  }
  m.push(slope[n - 2] ?? 0);
  const first = p[0] as Pt;
  let d = `M${first.x.toFixed(1)},${first.y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const a = p[i] as Pt;
    const b = p[i + 1] as Pt;
    const h = dx[i]! / 3;
    d += `C${(a.x + h).toFixed(1)},${(a.y + m[i]! * h).toFixed(1)} ${(b.x - h).toFixed(1)},${(b.y - m[i + 1]! * h).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  return d;
}

/** Closes each run of a line path down to `baseY`, for an area fill. */
export function areaPath(points: readonly (Pt | null)[], baseY: number): string {
  let d = '';
  let run: Pt[] = [];
  const flush = () => {
    if (run.length > 1) {
      const first = run[0] as Pt;
      const last = run[run.length - 1] as Pt;
      d += `${monotone(run)}L${last.x.toFixed(1)},${baseY}L${first.x.toFixed(1)},${baseY}Z`;
    }
    run = [];
  };
  for (const p of points) {
    if (p) run.push(p);
    else flush();
  }
  flush();
  return d;
}

/** Band between an upper and a lower line (min–max range), one closed shape per run. */
export function bandPath(upper: readonly (Pt | null)[], lower: readonly (Pt | null)[]): string {
  let d = '';
  let up: Pt[] = [];
  let lo: Pt[] = [];
  const flush = () => {
    if (up.length > 1) {
      const back = monotone([...lo].reverse()).replace(/^M/, 'L');
      d += `${monotone(up)}${back}Z`;
    }
    up = [];
    lo = [];
  };
  for (let i = 0; i < upper.length; i++) {
    const a = upper[i];
    const b = lower[i];
    if (a && b) {
      up.push(a);
      lo.push(b);
    } else flush();
  }
  flush();
  return d;
}

/** Simple trend from the last values: compares the newest third with the oldest third. */
export function trendOf(
  values: readonly (number | null)[],
  epsilon: number,
): 'up' | 'down' | 'flat' | null {
  const v = values.filter((x): x is number => x !== null);
  if (v.length < 3) return null;
  const k = Math.max(1, Math.floor(v.length / 3));
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const diff = avg(v.slice(-k)) - avg(v.slice(0, k));
  if (diff > epsilon) return 'up';
  if (diff < -epsilon) return 'down';
  return 'flat';
}
