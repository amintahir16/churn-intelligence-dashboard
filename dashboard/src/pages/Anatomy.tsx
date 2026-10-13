import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis, BarChart, Bar, Cell, LabelList } from "recharts";
import type { NavProps } from "../App";
import { Card, CardHeader, ChartTip, Finding, Legend, PageHeader } from "../components/ui";
import { C, ChartBox, axis, pctTick, yAxis } from "../components/charts";
import { AnatomyBar } from "./Overview";
import { data } from "../lib/data";
import { int, money, pct, rateColor, textOn } from "../lib/format";
import type { SurrogateNode } from "../lib/types";

export default function Anatomy(_: NavProps) {
  const a = data.anatomy;
  const [ra, rb] = a.rules;
  const base = data.meta.churn_rate;
  const ladder = a.ladder;
  const lin = ladder[0].auc;
  const add = ladder[1].auc;
  const full = ladder[ladder.length - 1].auc;

  return (
    <>
      <PageHeader eyebrow="Churn anatomy" title="Three mechanisms behind churn">
        A plain linear model reaches only AUC {lin.toFixed(2)} while gradient boosting reaches {full.toFixed(2)}. That gap is the clue: churn here is driven by thresholds and
        interactions between features. Decomposing it reveals two deterministic rules and one gradual pattern.
      </PageHeader>

      <Card>
        <CardHeader title="Where the churners come from" subtitle="Attribution of every churned customer to a mechanism" />
        <div className="px-5 pb-5">
          <AnatomyBar />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <RuleCard
          rule={ra}
          tag="Mechanism 1"
          chartTitle="Churn rate by lifetime value, split by service calls"
          info="Below the top-quartile LTV line, more service calls raise churn moderately. Above it, ≥6 calls means certain churn. This is why lifetime value is the #2 model feature despite having almost no univariate signal."
          chart={
            <ChartBox height={230}>
              <LineChart data={a.curves.ltv_by_calls} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="bin" {...axis} interval={0} tick={{ fontSize: 10.5, fill: "#64748b" }} />
                <YAxis {...yAxis} tickFormatter={pctTick} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} />
                <ReferenceLine y={base} stroke={C.muted} strokeDasharray="3 3" />
                <ReferenceArea x1="1.87k–2.5k" x2="3k+" fill={C.churn} fillOpacity={0.06} label={{ value: "top LTV quartile", fontSize: 10, fill: "#b4232a", position: "insideTop" }} />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <ChartTip
                        title={`LTV ${label}`}
                        rows={[
                          { label: "≥ 6 calls", value: pct(payload[1]?.value as number), color: C.churn },
                          { label: "≤ 5 calls", value: pct(payload[0]?.value as number), color: C.keep },
                        ]}
                      />
                    ) : null
                  }
                />
                <Line dataKey="low_calls" stroke={C.keep} strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                <Line dataKey="high_calls" stroke={C.churn} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ChartBox>
          }
          legend={[
            { color: C.churn, label: "≥ 6 service calls" },
            { color: C.keep, label: "≤ 5 service calls" },
            { color: C.muted, label: "base rate", dashed: true },
          ]}
          interpretation={
            <>
              Repeated contact with support is tolerated by low-value customers, but the most valuable quartile leaves without exception once a problem needs a 6th call.
              These are the customers with the highest expectations and the most alternatives.
            </>
          }
        />
        <RuleCard
          rule={rb}
          tag="Mechanism 2"
          chartTitle="Churn rate by discount usage, split by age"
          info="For customers over 24, discount usage has no effect on churn at all (flat line). For under-25s there is a hard step at ~30% usage: below it, everyone churns."
          chart={
            <ChartBox height={230}>
              <LineChart data={a.curves.discount_by_age} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="bin" {...axis} interval={0} tick={{ fontSize: 10.5, fill: "#64748b" }} />
                <YAxis {...yAxis} tickFormatter={pctTick} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} />
                <ReferenceLine y={base} stroke={C.muted} strokeDasharray="3 3" />
                <ReferenceLine x="30–35" stroke={C.ink} strokeOpacity={0.15} strokeWidth={1} label={{ value: "30%", fontSize: 10, fill: "#64748b", position: "top" }} />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <ChartTip
                        title={`Discount usage ${label}%`}
                        rows={[
                          { label: "Age ≤ 24", value: pct(payload[0]?.value as number), color: C.churn },
                          { label: "Age > 24", value: pct(payload[1]?.value as number), color: C.keep },
                        ]}
                      />
                    ) : null
                  }
                />
                <Line dataKey="young" stroke={C.churn} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                <Line dataKey="older" stroke={C.keep} strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
              </LineChart>
            </ChartBox>
          }
          legend={[
            { color: C.churn, label: "Age ≤ 24" },
            { color: C.keep, label: "Age > 24" },
            { color: C.muted, label: "base rate", dashed: true },
          ]}
          interpretation={
            <>
              Young customers stay only while promotions keep them engaged. Price-sensitive cohorts with no discount habit have no reason to stay — this is a targeting
              gap, not a product gap: a personalised offer is the obvious lever.
            </>
          }
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader
            title="How much of the signal is non-linear?"
            subtitle="Cross-validated ROC-AUC as model flexibility increases"
            info="Each step adds one capability: depth-1 boosting can model any per-feature curve but no interactions; depth-2 allows pairwise interactions, and so on. The jumps quantify how much churn depends on thresholds vs. combinations of features."
          />
          <div className="px-3 pb-2">
            <ChartBox height={250}>
              <BarChart data={ladder} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
                <XAxis type="number" domain={[0.7, 0.95]} hide />
                <YAxis type="category" dataKey="name" {...yAxis} width={124} tick={{ fontSize: 11.5, fill: "#334155" }} />
                <Tooltip
                  cursor={{ fill: "#f1f5f9" }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTip
                        title={payload[0].payload.name}
                        rows={[
                          { label: "CV ROC-AUC", value: (payload[0].value as number).toFixed(4) },
                          { label: "Capability", value: payload[0].payload.detail },
                        ]}
                      />
                    ) : null
                  }
                />
                <Bar dataKey="auc" radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={false}>
                  {ladder.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#cbd5e1" : i === ladder.length - 1 ? C.ink : "#64748b"} />
                  ))}
                  <LabelList dataKey="auc" position="right" formatter={(v: unknown) => (v as number).toFixed(3)} style={{ fontSize: 11, fill: "#0b1220", fontFamily: "JetBrains Mono Variable" }} />
                </Bar>
              </BarChart>
            </ChartBox>
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
            <div className="bg-white px-5 py-3">
              <div className="num text-[18px] font-semibold">+{(add - lin).toFixed(3)}</div>
              <div className="text-[11.5px] text-muted">from non-linear thresholds</div>
            </div>
            <div className="bg-white px-5 py-3">
              <div className="num text-[18px] font-semibold">+{(full - add).toFixed(3)}</div>
              <div className="text-[11.5px] text-muted">from feature interactions</div>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title="Two-way interaction: service calls × cart abandonment"
            subtitle="Observed churn rate in each cell (cells with < 30 customers hidden)"
            info="Read across a row to see the effect of service calls at a fixed level of cart abandonment. The 5→6 call boundary is a vertical cliff at every abandonment level; above ~70% abandonment, churn rises regardless of calls."
          />
          <div className="px-5 pb-5">
            <Heatmap />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Surrogate decision tree"
          subtitle={`A depth-3 tree fitted to the data — ROC-AUC ${a.surrogate.auc.toFixed(3)} with just 7 splits. Node colour = churn rate.`}
          info="Surrogate trees trade accuracy for readability. This one is not used for scoring — it is a lens that exposes which splits carry most of the signal. Its top splits are exactly the rules above."
        />
        <div className="scrollbar-thin overflow-x-auto px-5 pb-5">
          <TreeView node={a.surrogate.tree} />
        </div>
      </Card>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Finding title="Robustness check" tone="ok">
          Excluding customers covered by the two rules, the model still reaches a hold-out ROC-AUC of <b className="num">{a.mix.residual_test_auc.toFixed(3)}</b> on the
          remaining {int(a.mix.residual_n)} customers (churn rate {pct(a.mix.residual_rate)}). The model is not just memorising the rules — it ranks gradual disengagement
          well too.
        </Finding>
        <Finding title="Analyst note" tone="warn">
          Boundaries this sharp (exactly {pct(ra.churn_rate, 0)} churn above a threshold) are unusual in organic behaviour. They may reflect a business policy (e.g. account
          closure after escalations) or how the churn label was defined. Worth confirming with the data owner before treating them as purely behavioural.
        </Finding>
      </div>
    </>
  );
}

function RuleCard({
  rule,
  tag,
  chart,
  chartTitle,
  legend,
  info,
  interpretation,
}: {
  rule: (typeof data.anatomy.rules)[number];
  tag: string;
  chart: React.ReactNode;
  chartTitle: string;
  legend: { color: string; label: string; dashed?: boolean }[];
  info: string;
  interpretation: React.ReactNode;
}) {
  return (
    <Card>
      <div className="px-5 pt-4">
        <div className="text-[11px] font-semibold tracking-wider text-churn uppercase">{tag}</div>
        <h3 className="mt-1 text-[16px] font-semibold tracking-tight">{rule.name}</h3>
        <code className="num mt-2 inline-block rounded-md bg-canvas px-2 py-1 text-[11.5px] text-ink-2">{rule.definition}</code>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-px border-y border-line bg-line">
        {[
          { v: int(rule.n), l: "customers" },
          { v: pct(rule.churn_rate, 1), l: "churn rate", c: "text-churn" },
          { v: pct(rule.share_of_churners, 0), l: "of all churners" },
          { v: money(rule.ltv_lost), l: `LTV lost (${pct(rule.share_of_ltv_lost, 0)})` },
        ].map((k) => (
          <div key={k.l} className="bg-white px-4 py-3">
            <div className={`num text-[18px] font-semibold ${k.c ?? ""}`}>{k.v}</div>
            <div className="text-[11px] text-muted">{k.l}</div>
          </div>
        ))}
      </div>
      <CardHeader title={chartTitle} info={info} actions={<Legend items={legend} />} />
      <div className="px-3">{chart}</div>
      <div className="px-5 pt-2 pb-4 text-[12.5px] leading-relaxed text-ink-2">{interpretation}</div>
      <div className="mx-5 mb-5 flex items-start gap-3 rounded-lg border border-warn/30 bg-warn-soft/60 px-3.5 py-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
        <div className="text-[12.5px] leading-relaxed">
          <span className="font-semibold">Early-warning cohort: </span>
          <span className="num font-semibold">{int(rule.near_n)}</span> active customers — {rule.near_label.charAt(0).toLowerCase() + rule.near_label.slice(1)} —
          holding <span className="num font-semibold">{money(rule.near_ltv)}</span> in LTV. They look safe today
          {rule.near_avg_risk !== null && (
            <>
              {" "}
              (avg. model risk <span className="num">{pct(rule.near_avg_risk, 0)}</span>)
            </>
          )}
          , but sit one step from a 100% churn zone.
        </div>
      </div>
    </Card>
  );
}

function Heatmap() {
  const h = data.heatmap;
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const rows = [...h.ys].map((_, i) => h.ys.length - 1 - i);
  return (
    <div>
      <div className="flex">
        <div className="flex w-14 shrink-0 items-center">
          <span className="-rotate-90 text-[11px] whitespace-nowrap text-muted">{h.y_label}</span>
        </div>
        <div className="flex-1">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: `52px repeat(${h.xs.length}, minmax(0,1fr))` }}>
            {rows.map((yi) => (
              <Row key={yi} yi={yi} hover={hover} setHover={setHover} />
            ))}
            <div />
            {h.xs.map((x, xi) => (
              <div key={x} className={`pt-1 text-center text-[11px] ${hover?.x === xi ? "font-semibold text-ink" : "text-muted"}`}>
                {x}
              </div>
            ))}
          </div>
          <div className="mt-1 pl-[52px] text-center text-[11px] text-muted">{h.x_label}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-muted">
        <span>0%</span>
        <div className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(to right, ${rateColor(0)}, ${rateColor(0.15)}, ${rateColor(0.289)}, ${rateColor(0.6)}, ${rateColor(1)})` }} />
        <span>100%</span>
        <span className="ml-2">· base rate {pct(data.meta.churn_rate)} is neutral</span>
      </div>
    </div>
  );
}

function Row({ yi, hover, setHover }: { yi: number; hover: { x: number; y: number } | null; setHover: (v: { x: number; y: number } | null) => void }) {
  const h = data.heatmap;
  return (
    <>
      <div className={`flex items-center justify-end pr-2 text-[11px] ${hover?.y === yi ? "font-semibold text-ink" : "text-muted"}`}>{h.ys[yi]}</div>
      {h.cells[yi].map((c, xi) => {
        const on = hover?.x === xi && hover?.y === yi;
        return (
          <div
            key={xi}
            onMouseEnter={() => setHover({ x: xi, y: yi })}
            onMouseLeave={() => setHover(null)}
            className={`num relative flex h-9 cursor-default items-center justify-center rounded-[4px] text-[11px] font-medium transition-shadow ${on ? "ring-2 ring-ink" : ""}`}
            style={{ background: rateColor(c.rate), color: textOn(c.rate) }}
          >
            {c.rate === null ? "·" : `${Math.round(c.rate * 100)}`}
            {on && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] whitespace-nowrap text-white shadow-lg">
                {h.ys[yi]} abandonment · {h.xs[xi]} calls
                <br />
                churn <b>{pct(c.rate)}</b> · n = {int(c.n)}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function TreeView({ node }: { node: SurrogateNode }) {
  return (
    <div className="flex min-w-[880px] justify-center pt-1">
      <TreeNode node={node} />
    </div>
  );
}

function TreeNode({ node, edge }: { node: SurrogateNode; edge?: string }) {
  const leaf = !node.left;
  return (
    <div className="flex flex-1 flex-col items-center">
      {edge && <div className="mb-1 text-[10.5px] font-medium text-muted">{edge}</div>}
      <div
        className={`rounded-lg border px-2.5 py-1.5 text-center shadow-sm ${leaf ? "min-w-[92px]" : "min-w-[150px]"}`}
        style={{ background: rateColor(node.rate), borderColor: "rgba(15,23,42,0.08)", color: textOn(node.rate) }}
      >
        {!leaf && (
          <div className="text-[11.5px] leading-tight font-semibold">
            {node.label} ≤ {node.threshold}
          </div>
        )}
        <div className={`num leading-tight ${leaf ? "text-[13px] font-semibold" : "text-[11px] opacity-80"}`}>{pct(node.rate, 0)} churn</div>
        <div className="num text-[10.5px] leading-tight opacity-75">n = {int(node.n)}</div>
      </div>
      {!leaf && (
        <>
          <div className="h-3 w-px bg-slate-300" />
          <div className="relative flex w-full gap-2">
            <div className="absolute top-0 right-1/4 left-1/4 h-px bg-slate-300" />
            <div className="flex flex-1 flex-col items-center pt-0">
              <div className="h-2 w-px bg-slate-300" />
              <TreeNode node={node.left!} edge="yes" />
            </div>
            <div className="flex flex-1 flex-col items-center">
              <div className="h-2 w-px bg-slate-300" />
              <TreeNode node={node.right!} edge="no" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
