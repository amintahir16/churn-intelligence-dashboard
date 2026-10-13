import { Fragment, useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, ErrorBar, Line, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { NavProps } from "../App";
import { Badge, Card, CardHeader, ChartTip, Finding, Legend, PageHeader, Segmented } from "../components/ui";
import { C, ChartBox, axis, pctTick, yAxis } from "../components/charts";
import { data } from "../lib/data";
import { int, num, pct, pval, rateColor } from "../lib/format";

const numericStats = data.stats.filter((s) => s.kind === "numeric");
const catStats = data.stats.filter((s) => s.kind === "categorical");

export default function Drivers(_: NavProps) {
  const [sel, setSel] = useState(numericStats[0].feature);
  const [sort, setSort] = useState<"effect" | "auc" | "name">("effect");
  const rows = useMemo(() => {
    const r = [...numericStats];
    if (sort === "effect") r.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
    if (sort === "auc") r.sort((a, b) => (b.auc ?? 0) - (a.auc ?? 0));
    if (sort === "name") r.sort((a, b) => a.label.localeCompare(b.label));
    return r;
  }, [sort]);
  const maxEff = Math.max(...numericStats.map((s) => Math.abs(s.effect)));
  const nSig = data.stats.filter((s) => s.p_value < 0.001).length;

  return (
    <>
      <PageHeader eyebrow="Driver explorer" title="Which behaviours separate churners from loyal customers">
        Every attribute tested against churn with a non-parametric test and Bonferroni correction. With 50,000 rows almost everything is "significant" ({nSig} of{" "}
        {data.stats.length} at p &lt; 0.001), so features are ranked by <b>effect size</b>, not p-value.
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Effect size ranking"
            subtitle="Rank-biserial correlation with churn · click a row to inspect"
            info="Rank-biserial r = 2·AUC − 1 from the Mann–Whitney U test. +0.38 means a churner has a 69% chance of having a higher value than a retained customer. Red bars: higher value → more churn. Blue bars: lower value → more churn."
            actions={
              <Segmented
                size="xs"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "effect", label: "Effect" },
                  { value: "name", label: "A–Z" },
                ]}
              />
            }
          />
          <div className="px-2 pb-3">
            {rows.map((s) => {
              const active = s.feature === sel;
              const w = (Math.abs(s.effect) / maxEff) * 50;
              return (
                <button
                  key={s.feature}
                  onClick={() => setSel(s.feature)}
                  className={`grid w-full cursor-pointer grid-cols-[140px_1fr_52px] items-center gap-2 rounded-md px-3 py-[5px] text-left transition-colors ${
                    active ? "bg-ink/[0.06]" : "hover:bg-slate-50"
                  }`}
                >
                  <span className={`truncate text-[12.5px] ${active ? "font-semibold text-ink" : "text-ink-2"}`}>{s.label}</span>
                  <span className="relative h-3">
                    <span className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-300" />
                    <span
                      className="absolute top-0.5 bottom-0.5 rounded-sm transition-all"
                      style={
                        s.effect >= 0
                          ? { left: "50%", width: `${w}%`, background: active ? C.churnDark : C.churn }
                          : { right: "50%", width: `${w}%`, background: active ? "#2f4fc4" : C.keep }
                      }
                    />
                  </span>
                  <span className="num text-right text-[12px] text-ink">{s.effect > 0 ? "+" : ""}{s.effect.toFixed(2)}</span>
                </button>
              );
            })}
            <div className="mt-2 flex justify-between px-3 text-[11px] text-muted">
              <span>← lower value = churn</span>
              <span>higher value = churn →</span>
            </div>
          </div>
        </Card>

        <div className="xl:col-span-3">
          <FeatureDetail feature={sel} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {(["Country", "Gender", "Signup_Quarter"] as const).map((c) => (
          <CategoryCard key={c} feature={c} />
        ))}
      </div>
      <div className="mt-3">
        <Finding title="Decision">
          Demographic and geographic attributes are statistically detectable but practically irrelevant (Cramér's V:{" "}
          {catStats.map((c) => `${c.label} ${c.effect.toFixed(3)}`).join(", ")}). Including them in the model changed CV AUC by less than 0.001, so the final model uses
          behavioural features only — simpler, more robust, and less exposed to fairness concerns.
        </Finding>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Correlation structure"
          subtitle="Spearman rank correlation · ordered by correlation with churn"
          info="Most engagement metrics (logins, session length, pages, app usage, email opens, wishlist, reviews, social) are strongly inter-correlated (ρ 0.5–0.76): they measure one latent 'engagement' factor. Tree models handle this collinearity well; it also means SHAP credit is shared among them."
        />
        <div className="scrollbar-thin overflow-x-auto px-5 pb-5">
          <CorrMatrix />
        </div>
      </Card>
    </>
  );
}

function FeatureDetail({ feature }: { feature: string }) {
  const prof = data.features[feature];
  const st = numericStats.find((s) => s.feature === feature)!;
  const [mode, setMode] = useState<"rate" | "dist">("rate");
  const base = data.meta.churn_rate;
  const totalC = prof.bins.reduce((a, b) => a + b.churned, 0);
  const totalR = prof.bins.reduce((a, b) => a + b.retained, 0);
  const rows = prof.bins.map((b) => ({
    x: prof.integer ? Math.round(b.mid) : +b.mid.toFixed(2),
    rate: b.n >= 25 ? b.rate : null,
    band: b.n >= 25 ? [b.ci[0], b.ci[1]] : null,
    n: b.n,
    churnedPct: b.churned / totalC,
    retainedPct: b.retained / totalR,
  }));

  return (
    <Card className="h-full">
      <CardHeader
        title={prof.label}
        subtitle={
          <>
            {st.direction} · AUC {st.auc?.toFixed(3)} · Cohen's d {num(st.cohens_d, 2)} · p<sub>Bonf.</sub> {pval(st.p_value)}
          </>
        }
        info="Churn-rate view: observed churn in each bin with a 95% Wilson confidence band; bars show how many customers fall in the bin. Distribution view: share of churners vs retained customers in each bin — where the two curves diverge, the feature discriminates."
        actions={
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "rate", label: "Churn rate" },
              { value: "dist", label: "Distribution" },
            ]}
          />
        }
      />
      <div className="px-3">
        <ChartBox height={290}>
          {mode === "rate" ? (
            <ComposedChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="x" {...axis} minTickGap={18} />
              <YAxis yAxisId="r" {...yAxis} tickFormatter={pctTick} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} />
              <YAxis yAxisId="n" orientation="right" hide domain={[0, (dataMax: number) => dataMax * 4]} />
              <Bar yAxisId="n" dataKey="n" fill="#e2e8f0" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <Area yAxisId="r" dataKey="band" stroke="none" fill={C.churn} fillOpacity={0.13} isAnimationActive={false} connectNulls />
              <Line yAxisId="r" dataKey="rate" stroke={C.churn} strokeWidth={2.25} dot={false} isAnimationActive={false} connectNulls />
              <ReferenceLine yAxisId="r" y={base} stroke={C.muted} strokeDasharray="3 3" />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return (
                    <ChartTip
                      title={`${prof.label} ≈ ${p.x}`}
                      rows={[
                        { label: "Churn rate", value: pct(p.rate), color: C.churn },
                        { label: "95% CI", value: p.band ? `${pct(p.band[0], 0)}–${pct(p.band[1], 0)}` : "—" },
                        { label: "Customers", value: int(p.n) },
                      ]}
                    />
                  );
                }}
              />
            </ComposedChart>
          ) : (
            <ComposedChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="x" {...axis} minTickGap={18} />
              <YAxis {...yAxis} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
              <Area dataKey="retainedPct" type="monotone" stroke={C.keep} fill={C.keep} fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} />
              <Area dataKey="churnedPct" type="monotone" stroke={C.churn} fill={C.churn} fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return (
                    <ChartTip
                      title={`${prof.label} ≈ ${p.x}`}
                      rows={[
                        { label: "Share of churners", value: pct(p.churnedPct), color: C.churn },
                        { label: "Share of retained", value: pct(p.retainedPct), color: C.keep },
                      ]}
                    />
                  );
                }}
              />
            </ComposedChart>
          )}
        </ChartBox>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-1">
        {mode === "rate" ? (
          <Legend
            items={[
              { color: C.churn, label: "churn rate (95% CI band)" },
              { color: "#cbd5e1", label: "customers in bin" },
              { color: C.muted, label: `base rate ${pct(base)}`, dashed: true },
            ]}
          />
        ) : (
          <Legend
            items={[
              { color: C.churn, label: "churned" },
              { color: C.keep, label: "retained" },
            ]}
          />
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
        <Stat label="Median · churned" value={num(st.median_churned)} tone="text-churn" />
        <Stat label="Median · retained" value={num(st.median_retained)} tone="text-keep" />
        <Stat label="Missing" value={pct(prof.missing_rate)} />
        <Stat label="Churn if missing" value={prof.churn_if_missing === null ? "—" : pct(prof.churn_if_missing)} />
      </div>
    </Card>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-white px-5 py-3">
      <div className={`num text-[16px] font-semibold ${tone}`}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function CategoryCard({ feature }: { feature: "Country" | "Gender" | "Signup_Quarter" }) {
  const levels = data.categoricals[feature];
  const st = catStats.find((s) => s.feature === feature)!;
  const base = data.meta.churn_rate;
  const rows = levels.map((l) => ({ level: l.level, rate: l.rate, err: [l.rate - l.ci[0], l.ci[1] - l.rate], n: l.n }));
  return (
    <Card>
      <CardHeader
        title={feature.replace("_", " ")}
        subtitle={
          <span className="flex items-center gap-2">
            Cramér's V <span className="num">{st.effect.toFixed(3)}</span>
            <Badge tone={st.effect < 0.05 ? "default" : "warn"}>{st.effect < 0.05 ? "negligible" : "weak"}</Badge>
          </span>
        }
        info="Dots show observed churn rate per level with 95% Wilson intervals. Overlapping intervals around the dashed base rate mean the attribute does not meaningfully differentiate churn."
      />
      <div className="px-2 pb-3">
        <ChartBox height={Math.max(140, rows.length * 26 + 30)}>
          <ScatterChart layout="vertical" margin={{ top: 4, right: 18, left: 4, bottom: 0 }} data={rows}>
            <CartesianGrid stroke={C.grid} horizontal={false} />
            <XAxis type="number" dataKey="rate" domain={[0.15, 0.45]} ticks={[0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45]} tickFormatter={pctTick} {...axis} />
            <YAxis type="category" dataKey="level" {...yAxis} width={72} tick={{ fontSize: 11.5, fill: "#334155" }} />
            <ZAxis range={[48, 48]} />
            <ReferenceLine x={base} stroke={C.churn} strokeDasharray="3 3" strokeOpacity={0.7} />
            <Tooltip
              cursor={false}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <ChartTip
                    title={payload[0].payload.level}
                    rows={[
                      { label: "Churn rate", value: pct(payload[0].payload.rate) },
                      { label: "Customers", value: int(payload[0].payload.n) },
                    ]}
                  />
                ) : null
              }
            />
            <Scatter dataKey="rate" fill={C.ink} isAnimationActive={false}>
              <ErrorBar dataKey="err" direction="x" width={4} stroke="#64748b" strokeWidth={1.25} />
            </Scatter>
          </ScatterChart>
        </ChartBox>
      </div>
    </Card>
  );
}

function CorrMatrix() {
  const { labels, matrix } = data.correlation;
  const [hover, setHover] = useState<[number, number] | null>(null);
  const n = labels.length;
  const color = (v: number) => (v >= 0 ? rateColor(0.289 + v * 0.711) : rateColor(0.289 + v * 0.289));
  return (
    <div className="min-w-[760px]">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `150px repeat(${n}, minmax(22px, 1fr))` }}>
        {matrix.map((row, i) => (
          <Fragment key={i}>
            <div className={`truncate pr-2 text-right text-[11px] leading-[22px] ${hover?.[0] === i ? "font-semibold text-ink" : "text-muted"} ${i === n - 1 ? "font-semibold text-churn" : ""}`}>
              {labels[i]}
            </div>
            {row.map((v, j) => (
              <div
                key={j}
                onMouseEnter={() => setHover([i, j])}
                onMouseLeave={() => setHover(null)}
                className={`relative h-[22px] rounded-[3px] ${hover && (hover[0] === i || hover[1] === j) ? "" : hover ? "opacity-60" : ""}`}
                style={{ background: i === j ? "#0b1220" : color(v) }}
              >
                {hover?.[0] === i && hover?.[1] === j && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-white shadow-lg">
                    {labels[i]} × {labels[j]}: <b className="num">ρ = {v.toFixed(2)}</b>
                  </div>
                )}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-muted">
        <span>−1</span>
        <div className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(to right, ${color(-1)}, ${color(0)}, ${color(1)})` }} />
        <span>+1</span>
      </div>
    </div>
  );
}