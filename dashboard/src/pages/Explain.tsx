import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import type { NavProps } from "../App";
import { Card, CardHeader, ChartTip, Finding, PageHeader, Select } from "../components/ui";
import { C, ChartBox, axis, yAxis } from "../components/charts";
import { data } from "../lib/data";
import { mix, num, pct } from "../lib/format";

export default function Explain(_: NavProps) {
  const g = data.shap.global;
  const max = g[0].mean_abs;
  const depKeys = Object.keys(data.shap.dependence);
  const [dep, setDep] = useState(depKeys[0]);
  const top3 = g.slice(0, 3).reduce((a, b) => a + b.share, 0);

  return (
    <>
      <PageHeader eyebrow="Explainability" title="What the model learned, in its own terms">
        SHAP values decompose each prediction into additive contributions per feature (in log-odds). Computed with exact TreeSHAP on out-of-fold predictions for all{" "}
        {data.meta.rows.toLocaleString()} customers.
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Global feature importance"
            subtitle="Mean |SHAP| — average impact on the log-odds of churn"
            info="How much each feature moves predictions on average, regardless of direction. Unlike split-count importance, SHAP importance is consistent and comparable across features."
          />
          <div className="px-5 pb-4">
            {g.map((f, i) => (
              <div key={f.feature} className="grid grid-cols-[140px_1fr_44px] items-center gap-2 py-[4px]">
                <span className={`truncate text-[12.5px] ${i < 3 ? "font-semibold text-ink" : "text-ink-2"}`}>{f.label}</span>
                <span className="h-3 rounded-sm bg-line-2">
                  <span className="block h-3 rounded-sm" style={{ width: `${(f.mean_abs / max) * 100}%`, background: i < 3 ? C.ink : "#94a3b8" }} />
                </span>
                <span className="num text-right text-[11.5px] text-ink-2">{pct(f.share, 0)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-muted">
            Top three features carry <b className="text-ink">{pct(top3, 0)}</b> of total attribution. Lifetime value ranks #2 despite a univariate AUC of just 0.54 — its effect
            exists only in combination with service calls.
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title="SHAP summary (beeswarm)"
            subtitle="Each dot is a customer · position = impact on churn risk · colour = feature value"
            info="Dots right of zero push towards churn; left of zero push towards retention. Colour shows whether that customer's value is high (red) or low (blue) for that feature. E.g. red dots far right for service calls: many calls → much higher risk."
          />
          <div className="px-5 pb-4">
            <Beeswarm />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Dependence: how one feature shifts risk across its range"
          subtitle="Mean SHAP value per quantile bin, with 10th–90th percentile band"
          info="The line is the model's learned response curve for this feature, averaged over everyone else's context. A wide band means the effect depends strongly on other features (interaction) — note how wide it is for lifetime value."
          actions={<Select label="Feature" value={dep} onChange={setDep} options={depKeys.map((k) => ({ value: k, label: data.shap.dependence[k].label }))} />}
        />
        <div className="grid gap-4 px-3 pb-4 lg:grid-cols-[1fr_260px]">
          <Dependence feature={dep} />
          <DepNotes feature={dep} />
        </div>
      </Card>

      <div className="mt-4">
        <Finding title="Reading the model">
          The model reproduces the analyst-discovered structure without being told about it: a step in service calls at 6, a cliff in cart abandonment above ~70%, a
          threshold at age 24 and a wide-banded lifetime value effect that only fires alongside service problems. When an ML model and direct data analysis agree, both
          become more credible.
        </Finding>
      </div>
    </>
  );
}

function Beeswarm() {
  const rows = data.shap.beeswarm;
  const W = 640;
  const rowH = 30;
  const left = 140;
  const right = 16;
  const all = rows.flatMap((r) => r.points.map((p) => p[0]));
  const lo = Math.max(-6, Math.min(...all));
  const hi = Math.min(6, Math.max(...all));
  const sx = (v: number) => left + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (W - left - right);
  const [hover, setHover] = useState<number | null>(null);

  const layout = useMemo(
    () =>
      rows.map((r) => {
        const pts = r.points.map(([s, v]) => ({ x: sx(s), s, v }));
        pts.sort((a, b) => a.x - b.x);
        const buckets = new Map<number, number>();
        return pts.map((p) => {
          const b = Math.round(p.x / 2.2);
          const k = buckets.get(b) ?? 0;
          buckets.set(b, k + 1);
          const off = ((k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 1.6) % (rowH / 2 - 3);
          return { ...p, y: off };
        });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const ticks = [-4, -2, 0, 2, 4].filter((t) => t >= lo && t <= hi);
  const H = rows.length * rowH + 28;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="SHAP beeswarm plot">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={sx(t)} x2={sx(t)} y1={0} y2={H - 22} stroke={t === 0 ? "#94a3b8" : "#eef0f3"} strokeDasharray={t === 0 ? "" : "2 3"} />
            <text x={sx(t)} y={H - 8} textAnchor="middle" fontSize={10.5} fill="#64748b">
              {t > 0 ? `+${t}` : t}
            </text>
          </g>
        ))}
        {layout.map((pts, i) => (
          <g key={rows[i].feature} transform={`translate(0, ${i * rowH + rowH / 2})`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} opacity={hover === null || hover === i ? 1 : 0.35}>
            <rect x={0} y={-rowH / 2} width={W} height={rowH} fill={hover === i ? "#f8fafc" : "transparent"} />
            <text x={left - 10} y={4} textAnchor="end" fontSize={11.5} fill="#334155" fontWeight={hover === i ? 600 : 400}>
              {rows[i].label}
            </text>
            {pts.map((p, j) => (
              <circle key={j} cx={p.x} cy={p.y} r={1.9} fill={p.v === null ? "#cbd5e1" : mix("#3e63dd", "#e5484d", p.v)} fillOpacity={0.8} />
            ))}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 pl-[22%] text-[11px] text-muted">
        <span>← lowers churn risk · SHAP (log-odds) · raises churn risk →</span>
        <span className="inline-flex items-center gap-1.5">
          low
          <span className="h-1.5 w-16 rounded-full" style={{ background: "linear-gradient(to right, #3e63dd, #e5484d)" }} />
          high feature value
          <span className="ml-2 inline-block h-2 w-2 rounded-full bg-slate-300" /> missing
        </span>
      </div>
    </div>
  );
}

function Dependence({ feature }: { feature: string }) {
  const d = data.shap.dependence[feature];
  const rows = d.points.map((p) => ({ x: p.x, mean: p.mean, band: [p.p10, p.p90], n: p.n }));
  return (
    <ChartBox height={280}>
      <ComposedChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 6 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} {...axis} label={{ value: d.label, position: "insideBottom", offset: -4, fontSize: 11, fill: "#64748b" }} height={36} tickFormatter={(v) => num(v, 1)} />
        <YAxis {...yAxis} tickFormatter={(v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1))} />
        <ReferenceLine y={0} stroke="#94a3b8" />
        <Area dataKey="band" stroke="none" fill={C.keep} fillOpacity={0.12} isAnimationActive={false} />
        <Line dataKey="mean" stroke={C.ink} strokeWidth={2.25} dot={{ r: 2.5, fill: C.ink }} isAnimationActive={false} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <ChartTip
                title={`${d.label} ≈ ${num(payload[0].payload.x, 2)}`}
                rows={[
                  { label: "Mean SHAP", value: num(payload[0].payload.mean, 3) },
                  { label: "P10 – P90", value: `${num(payload[0].payload.band[0], 2)} … ${num(payload[0].payload.band[1], 2)}` },
                  { label: "Customers", value: payload[0].payload.n.toLocaleString() },
                ]}
              />
            ) : null
          }
        />
      </ComposedChart>
    </ChartBox>
  );
}

function DepNotes({ feature }: { feature: string }) {
  const d = data.shap.dependence[feature];
  const pts = d.points;
  const minP = pts.reduce((a, b) => (b.mean < a.mean ? b : a));
  const maxP = pts.reduce((a, b) => (b.mean > a.mean ? b : a));
  const spread = pts.reduce((a, b) => a + (b.p90 - b.p10), 0) / pts.length;
  const range = maxP.mean - minP.mean;
  const odds = Math.exp(range);
  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-canvas p-4 text-[12.5px]">
      <div>
        <div className="text-[11px] text-muted">Lowest-risk region</div>
        <div className="num font-semibold">
          ≈ {num(minP.x, 1)} <span className="font-normal text-muted">({num(minP.mean, 2)})</span>
        </div>
      </div>
      <div>
        <div className="text-[11px] text-muted">Highest-risk region</div>
        <div className="num font-semibold">
          ≈ {num(maxP.x, 1)} <span className="font-normal text-muted">(+{num(maxP.mean, 2)})</span>
        </div>
      </div>
      <div>
        <div className="text-[11px] text-muted">Effect range</div>
        <div className="num font-semibold">{odds > 50 ? "> 50" : odds.toFixed(1)}× odds of churn</div>
      </div>
      <div>
        <div className="text-[11px] text-muted">Avg. P10–P90 spread</div>
        <div className="num font-semibold">
          {num(spread, 2)} <span className="font-normal text-muted">{spread > range * 0.6 ? "· strong interactions" : "· mostly direct effect"}</span>
        </div>
      </div>
      {d.missing_shap !== null && (
        <div>
          <div className="text-[11px] text-muted">When value is missing</div>
          <div className="num font-semibold">{d.missing_shap > 0 ? "+" : ""}{num(d.missing_shap, 3)}</div>
        </div>
      )}
    </div>
  );
}
