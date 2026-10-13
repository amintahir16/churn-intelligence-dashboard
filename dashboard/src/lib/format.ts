export const pct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? "—" : `${(v * 100).toFixed(d)}%`;

export const int = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : Math.round(v).toLocaleString("en-US");

export const money = (v: number | null | undefined, compact = true) => {
  if (v === null || v === undefined) return "—";
  if (!compact) return `$${Math.round(v).toLocaleString("en-US")}`;
  const a = Math.abs(v);
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return `$${Math.round(v)}`;
};

export const num = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });

export const pval = (p: number) => (p < 1e-300 ? "< 1e-300" : p < 1e-4 ? p.toExponential(1) : p.toFixed(4));

export const signed = (v: number, d = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;

/** Diverging colour for churn rates around the 28.9% base rate. */
export function rateColor(rate: number | null, base = 0.289): string {
  if (rate === null) return "#f1f5f9";
  if (rate >= base) {
    const t = Math.min(1, (rate - base) / (1 - base));
    return mix("#fdf2f2", "#c92a2f", Math.pow(t, 0.75));
  }
  const t = Math.min(1, (base - rate) / base);
  return mix("#f4f6fd", "#2f4fc4", Math.pow(t, 0.9) * 0.85);
}

export function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function hex(h: string): number[] {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

export function textOn(rate: number | null, base = 0.289) {
  if (rate === null) return "#94a3b8";
  return rate > base + 0.3 || rate < base * 0.25 ? "#ffffff" : "#0b1220";
}
