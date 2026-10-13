import { CheckCircle2 } from "lucide-react";
import type { NavProps } from "../App";
import { Badge, Card, CardHeader, Finding, Kpi, Legend, PageHeader } from "../components/ui";
import { C } from "../components/charts";
import { data } from "../lib/data";
import { int, pct, pval } from "../lib/format";

export default function Quality(_: NavProps) {
  const q = data.quality;
  const m = data.meta;
  const cells = m.rows * (m.columns - 1);
  const anomalyCells = q.anomalies.reduce((a, b) => a + b.n, 0);
  const maxMiss = Math.max(...q.missing.map((r) => r.pct));
  const informative = q.missing.filter((r) => r.informative).sort((a, b) => b.churn_missing - a.churn_missing);

  const decisions = [
    {
      t: "Impossible values → missing, not deleted",
      d: "Ages of 5 or 200, negative purchase counts and percentages above 100% are recording errors. Converting them to missing keeps the other 24 attributes of each row instead of discarding the customer.",
    },
    {
      t: "Winsorise extreme order values",
      d: `${q.anomalies.find((a) => a.feature === "Average_Order_Value")?.rule ?? "Extreme order values"} — far from the bulk of the distribution. Capping at the 99.9th percentile protects linear baselines and plots; tree models are insensitive either way.`,
    },
    {
      t: "Keep missingness as information",
      d: `${informative.length} attributes have missingness significantly associated with churn (χ², p < 0.001). LightGBM routes missing values to a learned branch, so 'unknown' becomes a usable signal rather than being blurred by imputation.`,
    },
    {
      t: "Drop City, keep Country (for analysis only)",
      d: "City is nested in Country (40 levels) and adds no signal (Cramér's V ≈ 0.02). Neither was retained in the model after the ablation test.",
    },
    {
      t: "Keep fractional purchase counts",
      d: `${int(q.notes.fractional_purchases)} rows have non-integer Total_Purchases — likely period averages. They are internally consistent with LTV, so they were left as is.`,
    },
    {
      t: "Leakage screen",
      d: "No single feature exceeds a univariate AUC of 0.69, and no attribute is a post-churn artefact (e.g. 'cancellation date'). The model's strength comes from interactions, not leakage.",
    },
  ];

  return (
    <>
      <PageHeader eyebrow="Data quality" title="What was wrong with the data, and what was done about it">
        Real-world-messy: {q.missing.length} columns have missing values, several contain impossible values, and one has extreme outliers. Every treatment below is
        deliberate and documented.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Missing cells" value={int(q.notes.total_missing_cells)} sub={`${pct(q.notes.total_missing_cells / cells, 1)} of all values`} />
        <Kpi label="Complete rows" value={pct(q.notes.rows_complete / m.rows, 0)} sub={`${int(q.notes.rows_complete)} rows have no gaps`} tone="warn" />
        <Kpi label="Anomalous values treated" value={int(anomalyCells)} sub={`across ${q.anomalies.length} columns`} />
        <Kpi label="Duplicate rows" value={int(q.notes.duplicates)} sub="exact duplicates" tone="ok" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Missing values and their relationship to churn"
            subtitle="Bar: share missing · dots: churn rate when missing vs present"
            info="If values were missing completely at random, churn would be the same whether the field is filled or not. Large gaps mean missingness carries information — e.g. customers who never opened an email have no recorded open rate."
            actions={
              <Legend
                items={[
                  { color: C.churn, label: "churn if missing" },
                  { color: C.keep, label: "churn if present" },
                ]}
              />
            }
          />
          <div className="px-5 pb-4">
            <div className="grid grid-cols-[190px_1fr_1.4fr_64px] items-center gap-x-3 border-b border-line pb-1.5 text-[10.5px] font-semibold tracking-wider text-muted uppercase">
              <span>Attribute</span>
              <span>% missing</span>
              <span>Churn rate: missing vs present</span>
              <span className="text-right">χ² p</span>
            </div>
            {q.missing.map((r) => {
              const lo = 0.2;
              const hi = 0.45;
              const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
              return (
                <div key={r.feature} className="grid grid-cols-[190px_1fr_1.4fr_64px] items-center gap-x-3 border-b border-line-2 py-[7px] last:border-0">
                  <span className="flex items-center gap-1.5 truncate text-[12.5px] text-ink">
                    {r.label}
                    {r.informative && <Badge tone="warn">signal</Badge>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 rounded-full bg-line-2">
                      <span className="block h-1.5 rounded-full bg-ink/70" style={{ width: `${(r.pct / maxMiss) * 100}%` }} />
                    </span>
                    <span className="num w-10 text-right text-[11.5px] text-ink-2">{r.pct.toFixed(1)}%</span>
                  </span>
                  <span className="relative h-4">
                    <span className="absolute top-1/2 right-0 left-0 h-px bg-line" />
                    <span className="absolute top-0 bottom-0 w-px bg-slate-300" style={{ left: pos(m.churn_rate) }} />
                    <span
                      className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-slate-300"
                      style={{ left: pos(Math.min(r.churn_missing, r.churn_present)), width: `${(Math.abs(r.churn_missing - r.churn_present) / (hi - lo)) * 100}%` }}
                    />
                    <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-keep shadow-sm" style={{ left: pos(r.churn_present) }} title={`present ${pct(r.churn_present)}`} />
                    <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-churn shadow-sm" style={{ left: pos(r.churn_missing) }} title={`missing ${pct(r.churn_missing)}`} />
                  </span>
                  <span className={`num text-right text-[11.5px] ${r.informative ? "font-semibold text-ink" : "text-muted"}`}>{pval(r.p_value)}</span>
                </div>
              );
            })}
            <div className="mt-1 grid grid-cols-[190px_1fr_1.4fr_64px] gap-x-3 text-[10.5px] text-muted">
              <span />
              <span />
              <span className="flex justify-between">
                <span>20%</span>
                <span>base {pct(m.churn_rate, 0)}</span>
                <span>45%</span>
              </span>
              <span />
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader title="Anomalies detected" subtitle="Values that cannot be true, and their treatment" />
            <div className="px-5 pb-4">
              {q.anomalies.map((a) => (
                <div key={a.feature} className="border-b border-line-2 py-2.5 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold">{a.label}</span>
                    <span className="num text-[12px] text-ink-2">{int(a.n)} rows</span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">{a.rule}</div>
                  <div className="mt-1 text-[11.5px] font-medium text-keep">→ {a.action}</div>
                </div>
              ))}
            </div>
          </Card>
          <Finding title="Implication" tone="warn">
            Customers with a missing session duration or email-open rate churn at ~{pct(informative[0]?.churn_missing ?? 0, 0)}. In production, a broken tracking pipeline
            would silently shift risk scores — monitoring feature completeness is part of monitoring the model.
          </Finding>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="Decision log" subtitle="Each cleaning and scoping choice, with the evidence behind it" />
        <div className="grid gap-px border-t border-line bg-line md:grid-cols-2 xl:grid-cols-3">
          {decisions.map((d) => (
            <div key={d.t} className="bg-white p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" />
                <div>
                  <div className="text-[13px] font-semibold">{d.t}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{d.d}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
