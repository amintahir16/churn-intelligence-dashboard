import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { RotateCcw, Sparkles } from "lucide-react";
import type { NavProps } from "../App";
import { Card, CardHeader, ChartTip, PageHeader, Select } from "../components/ui";
import { C, ChartBox, axis, pctTick, yAxis } from "../components/charts";
import { Waterfall } from "../components/Waterfall";
import { model } from "../lib/data";
import { predict, treeShap, type Row } from "../lib/gbm";
import { num, pct } from "../lib/format";

const F = model.features;
const META = Object.fromEntries(model.meta.map((m) => [m.key, m]));
const GROUPS: { name: string; keys: string[] }[] = [
  { name: "Service & account", keys: ["Customer_Service_Calls", "Lifetime_Value", "Age", "Membership_Years", "Credit_Balance"] },
  { name: "Purchasing", keys: ["Cart_Abandonment_Rate", "Days_Since_Last_Purchase", "Total_Purchases", "Average_Order_Value", "Discount_Usage_Rate", "Returns_Rate", "Payment_Method_Diversity"] },
  { name: "Engagement", keys: ["Email_Open_Rate", "Login_Frequency", "Session_Duration_Avg", "Pages_Per_Session", "Mobile_App_Usage", "Social_Media_Engagement_Score", "Wishlist_Items", "Product_Reviews_Written"] },
];
/** Actionable features and the direction a retention action can move them (-1 = reduce, +1 = increase). */
const ACTIONABLE: Record<string, 1 | -1> = {
  Customer_Service_Calls: -1,
  Cart_Abandonment_Rate: -1,
  Days_Since_Last_Purchase: -1,
  Returns_Rate: -1,
  Discount_Usage_Rate: 1,
  Email_Open_Rate: 1,
  Login_Frequency: 1,
  Mobile_App_Usage: 1,
  Session_Duration_Avg: 1,
  Total_Purchases: 1,
};
const medianRow: Row = model.meta.map((m) => m.median);

function topDriver(x: Row): string {
  const phi = treeShap(model.trees, x, F.length);
  let best = 0;
  for (let i = 1; i < F.length; i++) if (phi[i] > phi[best]) best = i;
  return F[best];
}

function riskLabel(p: number) {
  if (p >= 0.7) return { t: "Critical", c: "#c92a2f" };
  if (p >= 0.5) return { t: "High", c: "#e5484d" };
  if (p >= 0.3) return { t: "Medium", c: "#d97706" };
  return { t: "Low", c: "#12a26b" };
}

export default function Simulator({ state }: NavProps) {
  const incoming = state as { id: string; x: Row } | undefined;
  const presets = useMemo(
    () => [
      ...(incoming ? [{ id: `pass:${incoming.id}`, label: `${incoming.id} (from at-risk list)`, x: incoming.x }] : []),
      ...[...model.samples]
        .sort((a, b) => b.risk - a.risk)
        .map((s) => ({ id: s.id, label: `${s.id} · ${riskLabel(s.risk).t.toLowerCase()} risk (${pct(s.risk, 0)})`, x: s.x })),
      { id: "median", label: "Typical customer (all medians)", x: medianRow },
    ],
    [incoming],
  );
  const [presetId, setPresetId] = useState(presets[0].id);
  const preset = presets.find((p) => p.id === presetId) ?? presets[0];
  const [x, setX] = useState<Row>(() => [...preset.x]);
  const [focus, setFocus] = useState(() => topDriver(preset.x));

  const choose = (id: string) => {
    const nx = presets.find((p) => p.id === id)?.x ?? medianRow;
    setPresetId(id);
    setX([...nx]);
    setFocus(topDriver(nx));
  };

  const p = useMemo(() => predict(model.trees, x), [x]);
  const p0 = useMemo(() => predict(model.trees, preset.x), [preset]);
  const phi = useMemo(() => treeShap(model.trees, x, F.length), [x]);
  const rl = riskLabel(p);
  const changed = x.some((v, i) => v !== preset.x[i]);

  const ice = useMemo(() => {
    const j = F.indexOf(focus);
    const m = META[focus];
    const n = 40;
    return Array.from({ length: n + 1 }, (_, k) => {
      const v = m.min + ((m.max - m.min) * k) / n;
      const xx = [...x];
      xx[j] = m.step === 1 ? Math.round(v) : v;
      return { v: xx[j] as number, p: predict(model.trees, xx) };
    });
  }, [x, focus]);

  const levers = useMemo(() => {
    return Object.entries(ACTIONABLE)
      .filter(([f]) => x[F.indexOf(f)] !== null)
      .map(([f, dir]) => {
        const j = F.indexOf(f);
        const m = META[f];
        const cur = x[j] as number;
        const cands: { v: number; p: number }[] = [];
        for (let k = 0; k <= 40; k++) {
          const raw = m.min + ((m.max - m.min) * k) / 40;
          if ((raw - cur) * dir <= 0) continue;
          const xx = [...x];
          xx[j] = m.step === 1 ? Math.round(raw) : +raw.toFixed(1);
          cands.push({ v: xx[j] as number, p: predict(model.trees, xx) });
        }
        if (!cands.length) return { f, label: m.label, from: x[j], to: cur, p, gain: 0 };
        const minP = Math.min(...cands.map((c) => c.p));
        // smallest move that captures ≥ 90% of the achievable reduction
        const target = p - 0.9 * (p - minP);
        const best = cands.filter((c) => c.p <= target + 1e-9).sort((a, b) => Math.abs(a.v - cur) - Math.abs(b.v - cur))[0] ?? { v: cur, p };
        return { f, label: m.label, from: x[j], to: best.v, p: best.p, gain: p - best.p };
      })
      .filter((l) => l.gain > 0.005)
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 5);
  }, [x, p]);

  const set = (key: string, v: number | null) => {
    const j = F.indexOf(key);
    setX((old) => {
      const n = [...old];
      n[j] = v;
      return n;
    });
  };

  return (
    <>
      <PageHeader eyebrow="What-if simulator" title="Change a customer, watch the model respond">
        The production LightGBM model ({model.trees.length} trees) runs in your browser. Every slider move re-scores the customer and recomputes exact TreeSHAP attributions —
        verified to match LightGBM to 1e-6.
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select label="Preset customer" value={presetId} onChange={choose} options={presets.map((pp) => ({ value: pp.id, label: pp.label }))} />
        <button
          onClick={() => setX([...preset.x])}
          disabled={!changed}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <Card>
          <div className="grid gap-x-8 gap-y-1 p-5 md:grid-cols-2">
            {GROUPS.map((g) => (
              <div key={g.name} className={g.name === "Engagement" ? "md:col-span-2" : ""}>
                <div className="mt-1 mb-2 text-[10.5px] font-semibold tracking-[0.12em] text-muted uppercase">{g.name}</div>
                <div className={`grid gap-x-8 gap-y-3.5 ${g.name === "Engagement" ? "md:grid-cols-2" : ""}`}>
                  {g.keys.map((k) => (
                    <FeatureSlider
                      key={k}
                      k={k}
                      value={x[F.indexOf(k)]}
                      original={preset.x[F.indexOf(k)]}
                      shap={phi[F.indexOf(k)]}
                      focused={focus === k}
                      onFocus={() => setFocus(k)}
                      onChange={(v) => set(k, v)}
                    />
                  ))}
                </div>
                <div className="h-4" />
              </div>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <div className="flex items-center gap-5 px-5 pt-5 pb-4">
              <Gauge p={p} color={rl.c} />
              <div>
                <div className="text-[11.5px] font-medium text-muted">Predicted churn probability</div>
                <div className="num text-[38px] leading-none font-semibold" style={{ color: rl.c }}>
                  {pct(p, 1)}
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[12px]">
                  <span className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: rl.c }}>
                    {rl.t} risk
                  </span>
                  {changed && (
                    <span className={`num font-medium ${p < p0 ? "text-ok" : "text-churn"}`}>
                      {p < p0 ? "▼" : "▲"} {Math.abs((p - p0) * 100).toFixed(1)} pts vs. start
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="border-t border-line px-5 py-4">
              <Waterfall
                base={phi[F.length]}
                items={F.map((f, i) => ({ key: f, label: META[f].label, value: x[i], shap: phi[i] }))}
                top={8}
                onSelect={setFocus}
                selected={focus}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title={`Sensitivity: ${META[focus].label}`} subtitle="Risk if only this feature changes (others held fixed)" info="An individual conditional expectation (ICE) curve: the model is re-scored across the feature's range for this exact customer. Steps reveal the thresholds the model learned." />
            <div className="px-3 pb-3">
              <ChartBox height={170}>
                <LineChart data={ice} margin={{ top: 6, right: 14, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="v" type="number" domain={["dataMin", "dataMax"]} {...axis} tickFormatter={(v) => num(v, 0)} />
                  <YAxis {...yAxis} domain={[0, 1]} tickFormatter={pctTick} ticks={[0, 0.5, 1]} />
                  <ReferenceLine y={0.5} stroke="#e2e8f0" />
                  <Tooltip content={({ active, payload }) => (active && payload?.length ? <ChartTip rows={[{ label: `${META[focus].label} = ${num(payload[0].payload.v, 1)}`, value: pct(payload[0].payload.p, 1) }]} /> : null)} />
                  <Line dataKey="p" type="stepAfter" stroke={C.ink} strokeWidth={2} dot={false} isAnimationActive={false} />
                  {x[F.indexOf(focus)] !== null && <ReferenceDot x={x[F.indexOf(focus)] as number} y={p} r={5} fill={rl.c} stroke="white" strokeWidth={2} />}
                </LineChart>
              </ChartBox>
            </div>
          </Card>

          <Card>
            <CardHeader title="Biggest levers for this customer" subtitle="Single change that lowers risk the most, among actionable features" />
            <div className="px-5 pb-4">
              {levers.length === 0 && <div className="py-3 text-[12.5px] text-muted">No single actionable change lowers risk meaningfully — this customer is already low-risk or needs several changes at once.</div>}
              {levers.map((l) => (
                <button
                  key={l.f}
                  onClick={() => {
                    set(l.f, l.to);
                    setFocus(l.f);
                  }}
                  className="group mb-1.5 flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-ok/40 hover:bg-ok-soft/40"
                >
                  <span>
                    <span className="block text-[12.5px] font-medium">{l.label}</span>
                    <span className="num text-[11px] text-muted">
                      {l.from === null ? "missing" : num(l.from, 1)} → {num(l.to, 1)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="num text-[12.5px] font-semibold text-ok">−{(l.gain * 100).toFixed(1)} pts</span>
                    <Sparkles size={13} className="text-muted transition-colors group-hover:text-ok" />
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function FeatureSlider({
  k,
  value,
  original,
  shap,
  focused,
  onFocus,
  onChange,
}: {
  k: string;
  value: number | null;
  original: number | null;
  shap: number;
  focused: boolean;
  onFocus: () => void;
  onChange: (v: number | null) => void;
}) {
  const m = META[k];
  const v = value ?? m.median;
  const fill = ((v - m.min) / (m.max - m.min)) * 100;
  const dirty = value !== original;
  return (
    <div onMouseDown={onFocus} onFocus={onFocus} className={`rounded-lg px-2 py-1 -mx-2 transition-colors ${focused ? "bg-keep-soft/50" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`s-${k}`} className="flex items-center gap-1.5 truncate text-[12.5px] text-ink">
          {m.label}
          {dirty && <span className="h-1.5 w-1.5 rounded-full bg-keep" title="changed" />}
        </label>
        <span className="flex items-baseline gap-2">
          <span className={`num text-[10.5px] ${shap > 0.05 ? "text-churn" : shap < -0.05 ? "text-keep" : "text-muted"}`}>
            {shap >= 0 ? "+" : "−"}
            {Math.abs(shap).toFixed(2)}
          </span>
          {value === null ? (
            <button onClick={() => onChange(m.median)} className="cursor-pointer rounded bg-slate-100 px-1.5 text-[11px] text-muted hover:text-ink">
              missing
            </button>
          ) : (
            <span className="num w-14 text-right text-[12.5px] font-semibold">{num(value, m.step === 1 ? 0 : 1)}</span>
          )}
        </span>
      </div>
      <input
        id={`s-${k}`}
        type="range"
        min={m.min}
        max={m.max}
        step={m.step}
        value={Math.min(m.max, Math.max(m.min, v))}
        onChange={(e) => onChange(+e.target.value)}
        className={`mt-1.5 w-full ${value === null ? "opacity-40" : ""}`}
        style={{ ["--fill" as string]: `${fill}%` }}
      />
    </div>
  );
}

function Gauge({ p, color }: { p: number; color: string }) {
  const r = 38;
  const c = Math.PI * r;
  return (
    <svg width="96" height="58" viewBox="0 0 96 58" aria-hidden>
      <path d="M10 50 A38 38 0 0 1 86 50" fill="none" stroke="#eef0f3" strokeWidth="9" strokeLinecap="round" />
      <path d="M10 50 A38 38 0 0 1 86 50" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} style={{ transition: "stroke-dasharray 300ms ease, stroke 300ms" }} />
      <line x1="48" y1="12" x2="48" y2="17" stroke="#cbd5e1" strokeWidth="1.5" />
    </svg>
  );
}
