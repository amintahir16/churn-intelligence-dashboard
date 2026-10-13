import { ArrowRight, CircleDollarSign, Crosshair, Target, TrendingDown, UserX } from "lucide-react";
import type { NavProps, PageId } from "../App";
import { Card, CardHeader, Kpi, PageHeader } from "../components/ui";
import { data } from "../lib/data";
import { int, money, pct } from "../lib/format";

export default function Overview({ go }: NavProps) {
  const m = data.meta;
  const [ruleA, ruleB] = data.anatomy.rules;
  const mix = data.anatomy.mix;
  const top20 = data.gains[1];
  const precisionTop20 = (data.gains[0].rate + data.gains[1].rate) / 2;
  const cat = data.stats.filter((s) => s.kind === "categorical");
  const maxV = Math.max(...cat.filter((c) => c.feature !== "City").map((c) => c.effect));
  const informativeMissing = data.quality.missing.filter((q) => q.informative).sort((a, b) => b.churn_missing - a.churn_missing);
  const combo = data.scenarios.find((s) => s.lever === "all")!;
  const levers = data.scenarios.filter((s) => s.lever !== "all").sort((a, b) => b.churners_avoided - a.churners_avoided);

  const findings: { n: string; title: string; body: string; to: PageId; tone: string }[] = [
    {
      n: "01",
      title: `Every high-value customer with ${"≥"}6 service calls churned`,
      body: `${int(ruleA.n)} customers in the top LTV quartile who called support 6+ times: ${pct(ruleA.churn_rate, 0)} churn. They are ${pct(
        ruleA.share_of_churners,
        0,
      )} of all churners but ${pct(ruleA.share_of_ltv_lost, 0)} of lost lifetime value.`,
      to: "anatomy",
      tone: "churn",
    },
    {
      n: "02",
      title: "Under-25s who ignore discounts leave — all of them",
      body: `${int(ruleB.n)} customers aged ≤24 with discount usage below 30% churned at ${pct(ruleB.churn_rate, 0)}. Above 30% usage, the same age group churns at the base rate.`,
      to: "anatomy",
      tone: "churn",
    },
    {
      n: "03",
      title: "Outside those two rules, churn is a disengagement gradient",
      body: `Cart abandonment above 75% lifts churn to ${pct(m.cart_cliff.gt75, 0)} (vs ${pct(m.cart_cliff.le65, 0)} at ≤65%). Low email opens, few purchases and long recency compound it.`,
      to: "drivers",
      tone: "warn",
    },
    {
      n: "04",
      title: "Who the customer is matters far less than how they behave",
      body: `Country, gender and signup quarter have Cramér's V ≤ ${maxV.toFixed(3)} — statistically negligible. Adding them to the model did not improve cross-validated AUC, so they were dropped.`,
      to: "drivers",
      tone: "default",
    },
    {
      n: "05",
      title: "Missing data is itself a churn signal",
      body: `Customers with no recorded ${informativeMissing
        .slice(0, 2)
        .map((q) => q.label.toLowerCase())
        .join(" or ")} churn at ~${pct(informativeMissing[0]?.churn_missing ?? 0, 0)} — missingness was preserved for the model rather than imputed away.`,
      to: "quality",
      tone: "default",
    },
    {
      n: "06",
      title: `The model ranks risk sharply: top 20% holds ${pct(top20.captured, 0)} of churners`,
      body: `Hold-out ROC-AUC ${m.test_auc.toFixed(3)}, PR-AUC ${m.test_pr_auc.toFixed(3)}. Contacting the top-scored fifth of customers reaches ${pct(
        top20.captured,
        0,
      )} of churners at ~${pct(precisionTop20, 0)} precision.`,
      to: "model",
      tone: "ok",
    },
  ];

  const total = mix.rule_churners + mix.other_churners;
  const toneDot: Record<string, string> = { churn: "bg-churn", warn: "bg-warn", default: "bg-ink", ok: "bg-ok" };

  return (
    <>
      <PageHeader eyebrow="Executive summary" title="Why customers churn — and where to act first">
        An end-to-end analysis of {int(m.rows)} e-commerce customers. Churn is not one problem: {pct(mix.rule_churners / total, 0)} of churners are explained by two
        sharp, rule-like interactions, and the rest follow a gradual disengagement curve. Each needs a different intervention.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Churn rate" value={pct(m.churn_rate)} tone="churn" icon={<UserX size={14} />} sub={`${int(m.churned)} of ${int(m.rows)} customers`} />
        <Kpi label="Lifetime value lost" value={money(m.ltv_lost)} icon={<CircleDollarSign size={14} />} sub={`${pct(m.ltv_lost / m.ltv_total, 0)} of total customer LTV`} />
        <Kpi label="Model ROC-AUC" value={m.test_auc.toFixed(3)} icon={<Target size={14} />} sub={`Hold-out of ${int(m.test_rows)} · PR-AUC ${m.test_pr_auc.toFixed(3)}`} />
        <Kpi label="Lift in top decile" value={`${m.top_decile_lift.toFixed(1)}×`} tone="keep" icon={<Crosshair size={14} />} sub={`Top 30% captures ${pct(m.top3_capture, 0)} of churners`} />
        <Kpi
          label="Active customers at risk"
          value={int(m.active_at_risk)}
          tone="warn"
          icon={<TrendingDown size={14} />}
          sub={`${money(m.active_at_risk_ltv)} LTV with score ≥ 50%`}
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Anatomy of 14,450 churners"
          subtitle="Each churned customer attributed to the mechanism that explains them"
          info="Rule-based segments were discovered with a surrogate decision tree and then verified directly on the data. 'Other' churners are those not covered by either rule — the model scores them from the gradual engagement signals."
          actions={
            <button onClick={() => go("anatomy")} className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-keep hover:underline">
              Open anatomy <ArrowRight size={13} />
            </button>
          }
        />
        <div className="px-5 pb-5">
          <AnatomyBar />
        </div>
      </Card>

      <div className="mt-6 mb-3 flex items-end justify-between">
        <h2 className="text-[16px] font-semibold tracking-tight">Six findings</h2>
        <span className="text-[12px] text-muted">Click any finding to see the evidence</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {findings.map((f) => (
          <button
            key={f.n}
            onClick={() => go(f.to)}
            className="group cursor-pointer rounded-xl border border-line bg-white p-4 text-left transition-[border-color,box-shadow] duration-200 hover:border-slate-300 hover:shadow-[0_4px_16px_rgba(16,24,40,0.06)] focus-visible:outline-2 focus-visible:outline-keep"
          >
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${toneDot[f.tone]}`} />
              <span className="num text-[11px] font-semibold text-muted">{f.n}</span>
            </div>
            <div className="mt-2 text-[14px] leading-snug font-semibold tracking-tight text-ink">{f.title}</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{f.body}</p>
            <div className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-muted transition-colors group-hover:text-keep">
              See evidence <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Recommended playbook"
          subtitle={`Model-estimated impact on the ${int(m.active_at_risk)} active customers currently scored ≥ 50% risk`}
          info="Estimates come from re-scoring at-risk customers with the lever applied (counterfactual prediction). They indicate where the model sees leverage; they are associational, and each should be validated with a controlled experiment before roll-out."
          actions={
            <button onClick={() => go("decision")} className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-keep hover:underline">
              Decision lab <ArrowRight size={13} />
            </button>
          }
        />
        <div className="grid gap-px overflow-hidden border-t border-line bg-line md:grid-cols-4">
          {levers.map((s, i) => (
            <div key={s.name} className="bg-white p-4">
              <div className="num text-[11px] font-semibold text-muted">P{i + 1}</div>
              <div className="mt-1 text-[13.5px] leading-snug font-semibold">{s.name}</div>
              <div className="mt-1 text-[12px] leading-snug text-muted">{s.description}</div>
              <div className="mt-3 flex items-baseline gap-3">
                <div>
                  <div className="num text-[20px] font-semibold text-ok">{int(s.churners_avoided)}</div>
                  <div className="text-[11px] text-muted">churners avoided</div>
                </div>
                <div>
                  <div className="num text-[20px] font-semibold text-ink">{money(s.ltv_protected)}</div>
                  <div className="text-[11px] text-muted">LTV protected</div>
                </div>
              </div>
              <div className="mt-2 text-[11.5px] text-muted">
                {int(s.eligible)} eligible · risk {pct(s.base_risk, 0)} → {pct(s.new_risk, 0)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-[12.5px]">
          <span className="text-ink-2">
            <span className="font-semibold">Combined playbook:</span> average risk {pct(combo.base_risk, 0)} → {pct(combo.new_risk, 0)} across {int(combo.eligible)} customers
          </span>
          <span className="num font-semibold text-ok">
            ≈ {int(combo.churners_avoided)} retained · {money(combo.ltv_protected)} LTV
          </span>
        </div>
      </Card>
    </>
  );
}

export function AnatomyBar() {
  const [a, b] = data.anatomy.rules;
  const mix = data.anatomy.mix;
  const total = mix.rule_churners + mix.other_churners;
  const overlap = a.n + b.n - mix.rule_churners;
  const segs = [
    { label: a.name, n: a.n, color: "#c92a2f", note: a.definition },
    { label: b.name, n: b.n - overlap, color: "#f0868a", note: `${b.definition}${overlap ? ` (excl. ${overlap} overlap)` : ""}` },
    { label: "Gradual disengagement", n: mix.other_churners, color: "#cbd5e1", note: "Probabilistic: cart abandonment, low email/app engagement, recency" },
  ];
  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-lg">
        {segs.map((s) => (
          <div
            key={s.label}
            className="group relative flex items-center justify-center transition-opacity hover:opacity-90"
            style={{ width: `${(s.n / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.n.toLocaleString()}`}
          >
            <span className={`num text-[12px] font-semibold ${s.color === "#cbd5e1" ? "text-ink" : "text-white"}`}>{pct(s.n / total, 0)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {segs.map((s) => (
          <div key={s.label} className="flex gap-2.5">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <div>
              <div className="text-[12.5px] font-semibold text-ink">
                {s.label} <span className="num font-medium text-muted">· {int(s.n)}</span>
              </div>
              <div className="text-[11.5px] leading-snug text-muted">{s.note}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
