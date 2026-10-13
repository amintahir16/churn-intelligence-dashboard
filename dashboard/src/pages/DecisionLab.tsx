import { useMemo, useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { Crosshair } from "lucide-react";
import type { NavProps } from "../App";
import { Card, CardHeader, ChartTip, Finding, Legend, PageHeader } from "../components/ui";
import { C, ChartBox, axis, yAxis } from "../components/charts";
import { data } from "../lib/data";
import { int, money, pct } from "../lib/format";

const ts = data.test_scores;
const N = ts.p.length;
const SCALE = data.meta.rows / N;
const GRID = Array.from({ length: 91 }, (_, i) => +(0.05 + i * 0.01).toFixed(2));

function evaluate(t: number, cost: number, uplift: number, valueFrac: number) {
  let tp = 0, fp = 0, fn = 0, tn = 0, gain = 0;
  for (let i = 0; i < N; i++) {
    const flag = ts.p[i] >= t;
    const y = ts.y[i];
    if (flag && y) {
      tp++;
      gain += uplift * valueFrac * ts.ltv[i];
    } else if (flag) fp++;
    else if (y) fn++;
    else tn++;
  }
  const contacted = tp + fp;
  return { tp, fp, fn, tn, contacted, profit: gain - contacted * cost, gain, spend: contacted * cost };
}

export default function DecisionLab(_: NavProps) {
  const [t, setT] = useState(0.5);
  const [cost, setCost] = useState(50);
  const [uplift, setUplift] = useState(0.25);
  const [valueFrac, setValueFrac] = useState(0.4);

  const curve = useMemo(() => {
    return GRID.map((g) => {
      const e = evaluate(g, cost, uplift, valueFrac);
      return { t: g, profit: e.profit * SCALE, contacted: e.contacted * SCALE, precision: e.contacted ? e.tp / e.contacted : 0, recall: e.tp / (e.tp + e.fn) };
    });
  }, [cost, uplift, valueFrac]);
  const best = curve.reduce((a, b) => (b.profit > a.profit ? b : a));
  const cur = useMemo(() => evaluate(t, cost, uplift, valueFrac), [t, cost, uplift, valueFrac]);
  const precision = cur.contacted ? cur.tp / cur.contacted : 0;
  const recall = cur.tp / (cur.tp + cur.fn);
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  const hist = useMemo(() => {
    const bins = Array.from({ length: 25 }, (_, i) => ({ x: i * 0.04 + 0.02, churned: 0, retained: 0 }));
    for (let i = 0; i < N; i++) {
      const b = Math.min(24, Math.floor(ts.p[i] / 0.04));
      if (ts.y[i]) bins[b].churned++;
      else bins[b].retained++;
    }
    return bins;
  }, []);

  const scen = data.scenarios;
  const maxAvoid = Math.max(...scen.map((s) => s.churners_avoided));

  return (
    <>
      <PageHeader eyebrow="Decision lab" title="Turning scores into a retention budget">
        A risk score is only useful once someone decides who to contact. Set the economics of your retention offer; the threshold that maximises net value is
        recomputed live on the {int(N)}-customer hold-out set (scaled to the full base).
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader title="Assumptions" subtitle="Adjust to your business" />
          <div className="flex flex-col gap-5 px-5 pb-5">
            <Slider label="Cost per contacted customer" value={cost} min={1} max={150} step={1} fmt={(v) => `$${v}`} onChange={setCost} hint="Offer + channel + staff time" />
            <Slider label="Offer success rate" value={uplift} min={0.05} max={0.8} step={0.01} fmt={(v) => pct(v, 0)} onChange={setUplift} hint="Share of would-be churners the offer actually saves" />
            <Slider label="Value recovered per save" value={valueFrac} min={0.1} max={1} step={0.05} fmt={(v) => `${pct(v, 0)} of LTV`} onChange={setValueFrac} hint="Margin on future revenue, as share of historical LTV" />
            <div className="h-px bg-line" />
            <Slider label="Decision threshold" value={t} min={0.05} max={0.95} step={0.01} fmt={(v) => pct(v, 0)} onChange={setT} hint="Contact everyone scored at or above this risk" />
            <button
              onClick={() => setT(best.t)}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-keep"
            >
              <Crosshair size={14} /> Use optimal threshold ({pct(best.t, 0)})
            </button>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Net value (full base)" value={money(cur.profit * SCALE)} tone={cur.profit >= 0 ? "text-ok" : "text-churn"} sub={`max ${money(best.profit)} at ${pct(best.t, 0)}`} />
            <Metric label="Customers contacted" value={int(cur.contacted * SCALE)} sub={`${pct(cur.contacted / N, 1)} of base · spend ${money(cur.spend * SCALE)}`} />
            <Metric label="Precision" value={pct(precision, 1)} sub="of contacted are real churners" />
            <Metric label="Recall" value={pct(recall, 1)} sub={`of churners reached · F1 ${f1.toFixed(3)}`} />
          </div>

          <Card>
            <CardHeader
              title="Net value by threshold"
              subtitle="Expected value saved minus outreach cost, scaled to 50,000 customers"
              info="Low thresholds contact many customers who would have stayed anyway (wasted cost); high thresholds miss savable churners. The peak is the profit-maximising operating point — usually different from the F1-optimal one."
              actions={
                <Legend
                  items={[
                    { color: C.ok, label: "net value" },
                    { color: C.ink, label: "current" },
                  ]}
                />
              }
            />
            <div className="px-3 pb-3">
              <ChartBox height={240}>
                <ComposedChart data={curve} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="t" type="number" domain={[0.05, 0.95]} {...axis} tickFormatter={(v) => `${Math.round(v * 100)}%`} ticks={[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]} />
                  <YAxis {...yAxis} width={56} domain={["auto", "auto"]} tickFormatter={(v) => money(v)} />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Area dataKey="profit" stroke={C.ok} strokeWidth={2.25} fill={C.ok} fillOpacity={0.08} isAnimationActive={false} />
                  <ReferenceLine x={t} stroke={C.ink} strokeDasharray="3 3" />
                  <ReferenceDot x={best.t} y={best.profit} r={4.5} fill={C.ok} stroke="white" strokeWidth={2} />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <ChartTip
                          title={`Threshold ${pct(payload[0].payload.t, 0)}`}
                          rows={[
                            { label: "Net value", value: money(payload[0].payload.profit), color: C.ok },
                            { label: "Contacted", value: int(payload[0].payload.contacted) },
                            { label: "Precision", value: pct(payload[0].payload.precision) },
                            { label: "Recall", value: pct(payload[0].payload.recall) },
                          ]}
                        />
                      ) : null
                    }
                  />
                </ComposedChart>
              </ChartBox>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Confusion matrix" subtitle={`Hold-out set (${int(N)}) at threshold ${pct(t, 0)}`} />
          <div className="px-5 pb-5">
            <div className="grid grid-cols-[80px_1fr_1fr] gap-1.5 text-[12px]">
              <div />
              <div className="text-center text-[11px] font-semibold text-muted">Predicted churn</div>
              <div className="text-center text-[11px] font-semibold text-muted">Predicted stay</div>
              <div className="flex items-center text-[11px] font-semibold text-muted">Churned</div>
              <Cell2 v={cur.tp} label="True positive" sub="saved if offer works" bg="#e8f7f0" />
              <Cell2 v={cur.fn} label="False negative" sub="missed churners" bg="#fdecec" />
              <div className="flex items-center text-[11px] font-semibold text-muted">Stayed</div>
              <Cell2 v={cur.fp} label="False positive" sub="wasted outreach" bg="#fef5e7" />
              <Cell2 v={cur.tn} label="True negative" sub="correctly ignored" bg="#f1f5f9" />
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title="Score distribution"
            subtitle="Hold-out customers by predicted risk, coloured by actual outcome"
            info="A well-separated, bimodal distribution means most decisions are easy. The threshold mainly matters for the thin middle band where churners and stayers overlap."
            actions={
              <Legend
                items={[
                  { color: C.churn, label: "churned" },
                  { color: C.keep, label: "retained" },
                ]}
              />
            }
          />
          <div className="px-3 pb-3">
            <ChartBox height={200}>
              <BarChart data={hist} margin={{ top: 18, right: 16, left: 0, bottom: 0 }} barCategoryGap={1}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="x" type="number" domain={[0, 1]} {...axis} tickFormatter={(v) => `${Math.round(v * 100)}%`} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} />
                <YAxis {...yAxis} scale="sqrt" tickFormatter={(v) => int(v)} />
                <ReferenceLine x={t} stroke={C.ink} strokeDasharray="3 3" label={{ value: "threshold", fontSize: 10, position: "top", fill: "#334155" }} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} content={({ active, payload }) => (active && payload?.length ? <ChartTip title={`Risk ≈ ${pct(payload[0].payload.x, 0)}`} rows={[{ label: "Churned", value: int(payload[0].payload.churned), color: C.churn }, { label: "Retained", value: int(payload[0].payload.retained), color: C.keep }]} /> : null)} />
                <Bar dataKey="retained" stackId="a" fill={C.keep} fillOpacity={0.75} isAnimationActive={false} />
                <Bar dataKey="churned" stackId="a" fill={C.churn} fillOpacity={0.85} isAnimationActive={false} />
              </BarChart>
            </ChartBox>
            <div className="px-2 text-[11px] text-muted">y-axis on square-root scale so the middle band is visible</div>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Intervention scenarios"
          subtitle={`Counterfactual re-scoring of the ${int(data.meta.active_at_risk)} active customers with risk ≥ 50%`}
          info="For each lever, eligible customers' features are modified (e.g. service calls capped at 5) and re-scored by the final model. Differences estimate how much risk the model attributes to that lever. This is associational — use it to prioritise experiments, not to promise outcomes."
        />
        <div className="px-5 pb-5">
          <div className="grid grid-cols-[minmax(180px,1.4fr)_70px_120px_2fr_90px] items-center gap-x-4 border-b border-line pb-2 text-[10.5px] font-semibold tracking-wider text-muted uppercase">
            <span>Lever</span>
            <span className="text-right">Eligible</span>
            <span>Avg. risk</span>
            <span>Churners avoided</span>
            <span className="text-right">LTV</span>
          </div>
          {scen.map((s) => (
            <div key={s.name} className={`grid grid-cols-[minmax(180px,1.4fr)_70px_120px_2fr_90px] items-center gap-x-4 border-b border-line-2 py-2.5 last:border-0 ${s.lever === "all" ? "bg-canvas/80 font-semibold" : ""}`}>
              <div>
                <div className="text-[12.5px] font-semibold">{s.name}</div>
                <div className="text-[11.5px] font-normal text-muted">{s.description}</div>
              </div>
              <span className="num text-right text-[12px]">{int(s.eligible)}</span>
              <span className="num text-[12px]">
                {pct(s.base_risk, 0)} <span className="text-muted">→</span> <span className="text-ok">{pct(s.new_risk, 0)}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 flex-1 rounded-full bg-line-2">
                  <span className="block h-2 rounded-full" style={{ width: `${(s.churners_avoided / maxAvoid) * 100}%`, background: s.lever === "all" ? C.ink : C.ok }} />
                </span>
                <span className="num w-10 text-right text-[12px]">{int(s.churners_avoided)}</span>
              </span>
              <span className="num text-right text-[12px]">{money(s.ltv_protected)}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4">
        <Finding title="Recommendation" tone="ok">
          With the default assumptions the profit-maximising threshold is <b className="num">{pct(best.t, 0)}</b> — contacting {int(best.contacted)} customers for a net{" "}
          <b className="num">{money(best.profit)}</b>. Cart recovery is the single largest model-estimated lever for currently active at-risk customers; service-quality
          fixes matter most for protecting the high-value base before they enter the at-risk list.
        </Finding>
      </div>
    </>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange, hint }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void; hint?: string }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        <span className="num text-[13px] font-semibold">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="mt-2 w-full" style={{ ["--fill" as string]: `${fill}%` }} />
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
    </label>
  );
}

function Metric({ label, value, sub, tone = "text-ink" }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-[11.5px] font-medium text-muted">{label}</div>
      <div className={`num mt-1 text-[22px] leading-none font-semibold ${tone}`}>{value}</div>
      <div className="mt-1.5 text-[11px] leading-snug text-muted">{sub}</div>
    </Card>
  );
}

function Cell2({ v, label, sub, bg }: { v: number; label: string; sub: string; bg: string }) {
  return (
    <div className="rounded-lg px-3 py-3" style={{ background: bg }}>
      <div className="num text-[20px] font-semibold">{int(v)}</div>
      <div className="text-[11.5px] font-medium text-ink-2">{label}</div>
      <div className="text-[10.5px] text-muted">{sub}</div>
    </div>
  );
}