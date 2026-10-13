import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Search, SlidersHorizontal } from "lucide-react";
import type { NavProps } from "../App";
import { Badge, Card, CardHeader, PageHeader, Segmented } from "../components/ui";
import { Waterfall } from "../components/Waterfall";
import { data } from "../lib/data";
import { int, money, num, pct } from "../lib/format";
import type { AtRisk } from "../lib/types";

type SortKey = "risk" | "ltv" | "exp";

export default function AtRiskPage({ go }: NavProps) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<"all" | "Critical" | "High" | "Medium">("all");
  const [value, setValue] = useState<"all" | "High value" | "Mid value" | "Low value">("all");
  const [sort, setSort] = useState<SortKey>("exp");
  const [sel, setSel] = useState<AtRisk>(() => [...data.at_risk].sort((a, b) => b.risk * b.ltv - a.risk * a.ltv)[0]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const r = data.at_risk.filter(
      (c) =>
        (tier === "all" || c.tier === tier) &&
        (value === "all" || c.value_tier === value) &&
        (!s || c.id.toLowerCase().includes(s) || c.city.toLowerCase().includes(s) || c.country.toLowerCase().includes(s) || c.segment.toLowerCase().includes(s)),
    );
    const key = (c: AtRisk) => (sort === "risk" ? c.risk : sort === "ltv" ? c.ltv : c.risk * c.ltv);
    return r.sort((a, b) => key(b) - key(a));
  }, [q, tier, value, sort]);

  const totalExp = rows.reduce((a, c) => a + c.risk * c.ltv, 0);

  const exportCsv = () => {
    const head = ["customer_id", "risk", "ltv", "expected_loss", "tier", "value_tier", "segment", "country", "city", "reason_1", "reason_2", "reason_3"];
    const lines = rows.map((c) =>
      [c.id, c.risk, c.ltv, Math.round(c.risk * c.ltv), c.tier, c.value_tier, c.segment, c.country, c.city, ...c.reasons.slice(0, 3).map((r) => `${r.label} (${r.shap > 0 ? "+" : ""}${r.shap.toFixed(2)})`)]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "at_risk_customers.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader eyebrow="At-risk customers" title="Who to call this week, and what to say">
        The {int(data.at_risk.length)} highest-risk customers who have <b>not yet churned</b>, scored out-of-fold. Each comes with the model's reasons, so a retention
        agent knows which problem to address.
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <label className="relative">
              <span className="sr-only">Search</span>
              <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search ID, city, segment…"
                className="w-56 rounded-lg border border-line bg-white py-1.5 pr-3 pl-8 text-[12.5px] transition-colors outline-none placeholder:text-muted/70 focus:border-keep"
              />
            </label>
            <Segmented
              value={tier}
              onChange={setTier}
              options={[
                { value: "all", label: "All tiers" },
                { value: "Critical", label: "Critical" },
                { value: "High", label: "High" },
                { value: "Medium", label: "Medium" },
              ]}
            />
            <Segmented
              value={value}
              onChange={setValue}
              options={[
                { value: "all", label: "All value" },
                { value: "High value", label: "High" },
                { value: "Mid value", label: "Mid" },
                { value: "Low value", label: "Low" },
              ]}
            />
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[12px] text-muted">
                <b className="num text-ink">{int(rows.length)}</b> customers · expected loss <b className="num text-ink">{money(totalExp)}</b>
              </span>
              <button onClick={exportCsv} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-slate-50">
                <Download size={13} /> CSV
              </button>
            </div>
          </div>
          <div className="scrollbar-thin max-h-[640px] overflow-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead className="sticky top-0 z-10 bg-canvas">
                <tr className="border-b border-line text-left text-[10.5px] font-semibold tracking-wider text-muted uppercase">
                  <th className="px-4 py-2">Customer</th>
                  <Th k="risk" sort={sort} setSort={setSort}>
                    Risk
                  </Th>
                  <Th k="ltv" sort={sort} setSort={setSort}>
                    LTV
                  </Th>
                  <Th k="exp" sort={sort} setSort={setSort}>
                    Exp. loss
                  </Th>
                  <th className="px-3 py-2">Top reasons</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((c) => {
                  const active = c.id === sel.id;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSel(c)}
                      className={`cursor-pointer border-b border-line-2 transition-colors ${active ? "bg-keep-soft/70" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-4 py-2">
                        <div className="num font-semibold">{c.id}</div>
                        <div className="text-[11px] text-muted">
                          {c.city}, {c.country} · {c.segment}
                        </div>
                      </td>
                      <td className="px-3">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-14 rounded-full bg-line-2">
                            <span className="block h-1.5 rounded-full" style={{ width: `${c.risk * 100}%`, background: c.risk >= 0.7 ? "#c92a2f" : c.risk >= 0.5 ? "#e5484d" : "#f0868a" }} />
                          </span>
                          <span className="num text-[12px] font-medium">{pct(c.risk, 0)}</span>
                        </div>
                      </td>
                      <td className="num px-3">{money(c.ltv)}</td>
                      <td className="num px-3 font-medium">{money(c.risk * c.ltv)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {c.reasons
                            .filter((r) => r.shap > 0)
                            .slice(0, 3)
                            .map((r) => (
                              <span key={r.feature} className="inline-flex items-center gap-0.5 rounded bg-churn-soft px-1.5 py-0.5 text-[11px] text-[#b4232a]">
                                {r.label}
                              </span>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > 200 && <div className="px-4 py-3 text-center text-[11.5px] text-muted">Showing first 200 of {rows.length} — export CSV for the full list</div>}
            {rows.length === 0 && <div className="px-4 py-10 text-center text-[12.5px] text-muted">No customers match these filters</div>}
          </div>
        </Card>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <span className="num">{sel.id}</span>
                  <Badge tone={sel.tier === "Critical" ? "churn" : sel.tier === "High" ? "warn" : "default"}>{sel.tier}</Badge>
                </span>
              }
              subtitle={`${sel.city}, ${sel.country} · ${sel.segment} · ${sel.value_tier}`}
            />
            <div className="grid grid-cols-3 gap-px border-y border-line bg-line">
              <Mini label="Churn risk" value={pct(sel.risk, 0)} tone="text-churn" />
              <Mini label="Lifetime value" value={money(sel.ltv)} />
              <Mini label="Expected loss" value={money(sel.risk * sel.ltv)} />
            </div>
            <div className="px-5 py-4">
              <div className="mb-2 text-[12px] font-semibold">Why the model flags this customer</div>
              <Waterfall
                base={sel.base}
                items={data.features_order.map((f, i) => ({ key: f, label: data.pretty[f], value: sel.x[i], shap: sel.shap?.[i] ?? 0 }))}
                top={7}
              />
            </div>
            <div className="border-t border-line px-5 py-4">
              <div className="mb-2 text-[12px] font-semibold">Suggested talking points</div>
              <ul className="space-y-1.5 text-[12.5px] leading-snug text-ink-2">
                {sel.reasons
                  .filter((r) => r.shap > 0)
                  .slice(0, 3)
                  .map((r) => (
                    <li key={r.feature} className="flex gap-2">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink" />
                      {advice(r.feature, r.value)}
                    </li>
                  ))}
              </ul>
              <button
                onClick={() => go("simulator", { id: sel.id, x: sel.x })}
                className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-ink-2"
              >
                <SlidersHorizontal size={14} /> Open in what-if simulator
              </button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Th({ k, sort, setSort, children }: { k: SortKey; sort: SortKey; setSort: (k: SortKey) => void; children: React.ReactNode }) {
  const on = sort === k;
  return (
    <th className="px-3 py-2 whitespace-nowrap">
      <button onClick={() => setSort(k)} className={`inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap uppercase transition-colors ${on ? "text-ink" : "hover:text-ink"}`}>
        {children}
        {on ? <ArrowDown size={11} /> : <ArrowUp size={11} className="opacity-0" />}
      </button>
    </th>
  );
}

function Mini({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-white px-4 py-2.5">
      <div className={`num text-[16px] font-semibold ${tone}`}>{value}</div>
      <div className="text-[10.5px] text-muted">{label}</div>
    </div>
  );
}

function advice(feature: string, v: number | null): string {
  const val = v === null ? "unknown" : num(v, 1);
  switch (feature) {
    case "Customer_Service_Calls":
      return `${val} support calls — assign a senior agent and close open issues on first contact.`;
    case "Cart_Abandonment_Rate":
      return `Abandons ${val}% of carts — send a cart-recovery reminder with free shipping.`;
    case "Days_Since_Last_Purchase":
      return `${val} days since last order — trigger a personalised win-back offer.`;
    case "Email_Open_Rate":
      return v === null ? "No email engagement on record — switch to app push or SMS." : `Opens only ${val}% of emails — switch channel to app push or SMS.`;
    case "Discount_Usage_Rate":
      return `Low discount usage (${val}%) — offer a targeted first-time promotion.`;
    case "Age":
      return `Young customer (${val}) — price-sensitive cohort, lead with a tailored offer.`;
    case "Lifetime_Value":
      return `High-value account — prioritise white-glove handling.`;
    case "Login_Frequency":
      return `Only ${val} logins/month — re-engage with personalised recommendations.`;
    case "Total_Purchases":
      return `Few purchases (${val}) — suggest a bundle or loyalty incentive.`;
    case "Session_Duration_Avg":
      return v === null ? "Session data missing — check tracking for this account." : `Short sessions (${val} min) — improve discovery with tailored picks.`;
    case "Returns_Rate":
      return `Returns ${val}% of orders — ask about fit/quality issues.`;
    case "Average_Order_Value":
      return `High order value (${val}) — ensure premium delivery experience.`;
    default:
      return `${data.pretty[feature] ?? feature} = ${val} is pushing risk up.`;
  }
}
