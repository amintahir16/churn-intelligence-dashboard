import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import type { NavProps } from "../App";
import { Card, CardHeader, ChartTip, Finding, PageHeader } from "../components/ui";
import { C, ChartBox, axis, yAxis } from "../components/charts";
import { data } from "../lib/data";
import { int, money, num, pct } from "../lib/format";

const PROFILE_FEATURES = [
  "Login_Frequency",
  "Session_Duration_Avg",
  "Email_Open_Rate",
  "Mobile_App_Usage",
  "Cart_Abandonment_Rate",
  "Customer_Service_Calls",
  "Total_Purchases",
  "Days_Since_Last_Purchase",
  "Average_Order_Value",
  "Lifetime_Value",
];

export default function Segments({ go }: NavProps) {
  const s = data.segments;
  const rv = data.risk_value;
  const best = s.silhouette.find((x) => x.k === s.k)!;

  return (
    <>
      <PageHeader eyebrow="Segments" title="Who the customers are, and who to prioritise">
        Behavioural personas from k-means clustering on 14 standardised behaviour metrics (k chosen by silhouette), and an operational risk × value matrix for the{" "}
        {int(data.meta.retained)} customers who have not churned.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        {s.personas.map((p) => (
          <Card key={p.id}>
            <div className="px-5 pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight">{p.name}</h3>
                  <p className="text-[12px] text-muted">{p.description}</p>
                </div>
                <div className="text-right">
                  <div className={`num text-[22px] leading-none font-semibold ${p.churn_rate > data.meta.churn_rate ? "text-churn" : "text-keep"}`}>{pct(p.churn_rate, 0)}</div>
                  <div className="mt-1 text-[10.5px] text-muted">churn rate</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-canvas px-3 py-2 text-[11px]">
                <div>
                  <div className="num text-[13px] font-semibold">{pct(p.share, 0)}</div>
                  <div className="text-muted">{int(p.size)} cust.</div>
                </div>
                <div>
                  <div className="num text-[13px] font-semibold">{money(p.avg_ltv)}</div>
                  <div className="text-muted">avg LTV</div>
                </div>
                <div>
                  <div className="num text-[13px] font-semibold">{money(p.ltv_lost)}</div>
                  <div className="text-muted">LTV lost</div>
                </div>
              </div>
            </div>
            <div className="px-5 pt-3 pb-4">
              <div className="mb-1.5 flex justify-between text-[10.5px] text-muted">
                <span>below average</span>
                <span>z-score vs. all customers</span>
                <span>above</span>
              </div>
              {PROFILE_FEATURES.map((f) => {
                const z = p.profile[f];
                const w = Math.min(1, Math.abs(z) / 1.5) * 50;
                const bad = ["Cart_Abandonment_Rate", "Customer_Service_Calls", "Days_Since_Last_Purchase"].includes(f);
                const color = (z > 0) !== bad ? C.keep : C.churn;
                return (
                  <div key={f} className="grid grid-cols-[118px_1fr_46px] items-center gap-2 py-[3px]" title={`median ${num(p.medians[f])}`}>
                    <span className="truncate text-[11.5px] text-ink-2">{s.labels[f]}</span>
                    <span className="relative h-2.5">
                      <span className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-300" />
                      <span className="absolute top-0 bottom-0 rounded-sm" style={z >= 0 ? { left: "50%", width: `${w}%`, background: color, opacity: 0.85 } : { right: "50%", width: `${w}%`, background: color, opacity: 0.85 }} />
                    </span>
                    <span className="num text-right text-[11px] text-muted">{num(p.medians[f], 1)}</span>
                  </div>
                );
              })}
              <div className="mt-1 text-right text-[10.5px] text-muted">right column: segment median</div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="How many clusters?"
            subtitle="Silhouette score by k (8,000-customer sample)"
            info="Silhouette ranges from −1 to 1; values near 0.1–0.2 mean clusters overlap heavily. This is expected when behaviour varies along one continuous engagement axis."
          />
          <div className="px-3">
            <ChartBox height={200}>
              <BarChart data={s.silhouette} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="k" {...axis} tickFormatter={(v) => `k=${v}`} />
                <YAxis {...yAxis} tickFormatter={(v) => v.toFixed(2)} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} content={({ active, payload }) => (active && payload?.length ? <ChartTip rows={[{ label: `k = ${payload[0].payload.k}`, value: payload[0].payload.silhouette.toFixed(3) }]} /> : null)} />
                <Bar dataKey="silhouette" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {s.silhouette.map((x) => (
                    <Cell key={x.k} fill={x.k === s.k ? C.ink : "#cbd5e1"} />
                  ))}
                  <LabelList dataKey="silhouette" position="top" formatter={(v: unknown) => (v as number).toFixed(2)} style={{ fontSize: 10.5, fill: "#334155" }} />
                </Bar>
              </BarChart>
            </ChartBox>
          </div>
          <div className="px-5 pb-4 text-[12px] leading-relaxed text-muted">
            Best k = {s.k} (silhouette {best.silhouette.toFixed(2)}). The weak separation is itself a finding: engagement is a continuum, so personas are for communication —
            the risk score is what should drive operations.
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Risk × value priority matrix"
            subtitle={`Active customers by out-of-fold churn risk and lifetime value (LTV tertiles: < ${money(rv.ltv_cuts[0])}, < ${money(rv.ltv_cuts[1])}, above)`}
            info="Where to spend retention budget. Top-right cells (high risk, high value) are the priority; low-risk/high-value customers need protection from service failures, not discounts. Click a row to open the at-risk list."
          />
          <div className="px-5 pb-5">
            <div className="grid grid-cols-[110px_repeat(3,1fr)] gap-1.5">
              <div />
              {rv.value_tiers.map((v) => (
                <div key={v} className="pb-1 text-center text-[11.5px] font-semibold text-ink-2">
                  {v}
                </div>
              ))}
              {[...rv.risk_tiers].reverse().map((rt) => {
                const ri = rv.risk_tiers.indexOf(rt);
                const lo = rv.risk_bins[ri];
                const hi = rv.risk_bins[ri + 1];
                return (
                  <Row key={rt} label={rt} sub={`${pct(lo, 0)}–${pct(hi, 0)} risk`} cells={rv.cells[ri]} ri={ri} onClick={() => go("atrisk")} />
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {rv.risk_tiers.map((rt, i) => (
                <div key={rt} className="rounded-lg bg-canvas px-3 py-2">
                  <div className="text-[11px] text-muted">{rt} tier · historic churn</div>
                  <div className="num text-[15px] font-semibold">{pct(rv.historic_rate_by_tier[i], 0)}</div>
                  <div className="num text-[10.5px] text-muted">{int(rv.count_by_tier_all[i])} customers (all)</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Finding title="Segment insight" tone="warn">
          The {s.personas[0].name.toLowerCase()} segment is {pct(s.personas[0].share, 0)} of the base but churns at {pct(s.personas[0].churn_rate, 0)} — yet the
          largest pool of lost value sits elsewhere because high-LTV customers fall into the service-failure rule. Segmentation by behaviour and by mechanism are
          complementary views.
        </Finding>
      </div>
    </>
  );
}

function Row({
  label,
  sub,
  cells,
  ri,
  onClick,
}: {
  label: string;
  sub: string;
  cells: { n: number; ltv: number; avg_risk: number | null }[];
  ri: number;
  onClick: () => void;
}) {
  const maxN = 13000;
  const tint = ["#f1f5f9", "#fdf2e3", "#fbe3e3", "#f6c9ca"][ri];
  const tintStrong = ["#e2e8f0", "#f8dfb6", "#f4bcbd", "#ec9294"][ri];
  return (
    <>
      <div className="flex flex-col justify-center">
        <span className="text-[12.5px] font-semibold">{label}</span>
        <span className="text-[10.5px] text-muted">{sub}</span>
      </div>
      {cells.map((c, vi) => {
        const priority = ri >= 2 && vi === 2;
        return (
          <button
            key={vi}
            onClick={onClick}
            className={`group relative cursor-pointer overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-shadow hover:shadow-md ${priority ? "border-churn/50" : "border-transparent"}`}
            style={{ background: tint }}
          >
            <span className="absolute inset-y-0 left-0 opacity-70" style={{ width: `${Math.min(100, (c.n / maxN) * 100)}%`, background: tintStrong }} />
            <span className="relative">
              <span className="num block text-[15px] font-semibold">{int(c.n)}</span>
              <span className="num block text-[11px] text-ink-2">{money(c.ltv)} LTV</span>
              {priority && <span className="mt-0.5 block text-[10px] font-semibold tracking-wide text-churn uppercase">priority</span>}
            </span>
          </button>
        );
      })}
    </>
  );
}