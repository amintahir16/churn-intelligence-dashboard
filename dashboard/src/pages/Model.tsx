import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ErrorBar, Line, LineChart, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { NavProps } from "../App";
import { Badge, Card, CardHeader, ChartTip, Finding, Kpi, Legend, PageHeader, Segmented } from "../components/ui";
import { C, ChartBox, axis, pctTick, yAxis } from "../components/charts";
import { data } from "../lib/data";
import { int, pct } from "../lib/format";

const MODEL_COLORS: Record<string, string> = {
  "Rule: ≥6 service calls": "#cbd5e1",
  "Logistic Regression": "#94a3b8",
  "Random Forest": "#d97706",
  XGBoost: "#3e63dd",
  "LightGBM (tuned)": "#e5484d",
};

export default function ModelPage(_: NavProps) {
  const m = data.meta;
  const models = data.models;
  const sel = models.find((x) => x.name === m.selected_model)!;
  const [curve, setCurve] = useState<"roc" | "pr">("roc");
  const [shown, setShown] = useState<Record<string, boolean>>(Object.fromEntries(models.map((x) => [x.name, true])));

  return (
    <>
      <PageHeader eyebrow="Model performance" title="How well can churn be predicted — and how was the model chosen">
        {int(m.train_rows)} customers for training with {m.folds}-fold stratified cross-validation; {int(m.test_rows)} held out and touched once for final
        evaluation. Four model families compared on identical folds and features; LightGBM tuned by random search over {m.n_trials} configurations.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="ROC-AUC (hold-out)" value={sel.test_auc.toFixed(3)} sub={`CV ${sel.cv_auc_mean?.toFixed(3)} ± ${sel.cv_auc_std?.toFixed(3)}`} />
        <Kpi label="PR-AUC (hold-out)" value={sel.test_pr_auc.toFixed(3)} sub={`vs. ${pct(m.churn_rate, 0)} for a random ranking`} />
        <Kpi label="Brier score" value={sel.test_brier?.toFixed(3) ?? "—"} sub="Mean squared error of probabilities (lower is better)" />
        <Kpi label="KS statistic" value={sel.ks.toFixed(3)} sub="Max separation of churn / retain score distributions" />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Model leaderboard"
          subtitle="Same 20 features, same folds · selection criterion: mean cross-validated ROC-AUC"
          info="Model selection uses CV on the training set only, so the hold-out numbers are an unbiased estimate. The single-rule baseline shows how much a simple business heuristic already achieves."
        />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead>
              <tr className="border-y border-line bg-canvas text-left text-[10.5px] font-semibold tracking-wider text-muted uppercase">
                <th className="px-5 py-2">Model</th>
                <th className="px-3 py-2 text-right">CV ROC-AUC</th>
                <th className="px-3 py-2 text-right">Test ROC-AUC</th>
                <th className="px-3 py-2 text-right">Test PR-AUC</th>
                <th className="px-3 py-2 text-right">Brier</th>
                <th className="px-3 py-2 text-right">Log-loss</th>
                <th className="px-3 py-2 text-right">KS</th>
                <th className="px-5 py-2 text-right">Fit time</th>
              </tr>
            </thead>
            <tbody>
              {models.map((r) => {
                const best = r.name === m.selected_model;
                return (
                  <tr key={r.name} className={`border-b border-line-2 ${best ? "bg-churn-soft/40" : ""}`}>
                    <td className="px-5 py-2.5">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span className="h-2 w-2 rounded-full" style={{ background: MODEL_COLORS[r.name] }} />
                        {r.name}
                        {best && <Badge tone="churn">selected</Badge>}
                      </span>
                    </td>
                    <td className="num px-3 text-right">{r.cv_auc_mean ? `${r.cv_auc_mean.toFixed(4)} ± ${r.cv_auc_std!.toFixed(4)}` : "—"}</td>
                    <td className={`num px-3 text-right ${best ? "font-semibold" : ""}`}>{r.test_auc.toFixed(4)}</td>
                    <td className="num px-3 text-right">{r.test_pr_auc.toFixed(4)}</td>
                    <td className="num px-3 text-right">{r.test_brier?.toFixed(4) ?? "—"}</td>
                    <td className="num px-3 text-right">{r.test_logloss?.toFixed(4) ?? "—"}</td>
                    <td className="num px-3 text-right">{r.ks.toFixed(3)}</td>
                    <td className="num px-5 text-right text-muted">{r.fit_seconds ? `${r.fit_seconds}s` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 text-[12px] leading-relaxed text-muted">
          Tree ensembles beat logistic regression by ~0.15 AUC — consistent with the interaction structure found in the anatomy analysis. XGBoost and LightGBM are within
          noise of each other; LightGBM was chosen for best CV score, fastest training, and native missing-value handling.
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={curve === "roc" ? "ROC curves (hold-out)" : "Precision–recall curves (hold-out)"}
            subtitle="Toggle models in the legend"
            info={
              curve === "roc"
                ? "True positive rate vs false positive rate across all thresholds. The diagonal is random guessing. Area under the curve = probability a random churner is ranked above a random non-churner."
                : "Precision (share of flagged customers who really churn) vs recall (share of churners caught). More informative than ROC under class imbalance; the dashed line is the base rate."
            }
            actions={
              <Segmented
                value={curve}
                onChange={setCurve}
                options={[
                  { value: "roc", label: "ROC" },
                  { value: "pr", label: "PR" },
                ]}
              />
            }
          />
          <div className="px-3">
            <ChartBox height={300}>
              <LineChart margin={{ top: 6, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={C.grid} />
                <XAxis type="number" dataKey="x" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} {...axis} tickFormatter={(v) => v.toFixed(1)} label={{ value: curve === "roc" ? "False positive rate" : "Recall", position: "insideBottom", offset: -2, fontSize: 11, fill: "#64748b" }} height={36} />
                <YAxis type="number" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} {...yAxis} tickFormatter={(v) => v.toFixed(1)} />
                {curve === "roc" ? (
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#cbd5e1" strokeDasharray="4 4" />
                ) : (
                  <ReferenceLine y={m.churn_rate} stroke="#cbd5e1" strokeDasharray="4 4" />
                )}
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTip
                        rows={payload.slice(0, 1).map((p) => ({
                          label: `${p.name} · ${curve === "roc" ? "FPR" : "recall"} ${(p.payload.x as number).toFixed(2)}`,
                          value: (p.payload.y as number).toFixed(3),
                          color: p.color,
                        }))}
                      />
                    ) : null
                  }
                />
                {models
                  .filter((x) => shown[x.name] && (curve === "roc" ? x.roc.length : x.pr.length))
                  .map((x) => (
                    <Line
                      key={x.name}
                      name={x.name}
                      data={(curve === "roc" ? x.roc : x.pr).map(([a, b]) => ({ x: a, y: b }))}
                      dataKey="y"
                      type="linear"
                      stroke={MODEL_COLORS[x.name]}
                      strokeWidth={x.name === m.selected_model ? 2.5 : 1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
              </LineChart>
            </ChartBox>
          </div>
          <div className="flex flex-wrap gap-1.5 px-5 pt-1 pb-4">
            {models
              .filter((x) => (curve === "roc" ? x.roc.length : x.pr.length))
              .map((x) => (
                <button
                  key={x.name}
                  onClick={() => setShown((s) => ({ ...s, [x.name]: !s[x.name] }))}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] transition-colors ${
                    shown[x.name] ? "border-line bg-white text-ink" : "border-transparent bg-canvas text-muted line-through"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: MODEL_COLORS[x.name] }} />
                  {x.name}
                  <span className="num text-muted">{(curve === "roc" ? x.test_auc : x.test_pr_auc).toFixed(3)}</span>
                </button>
              ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Calibration"
            subtitle="Predicted probability vs observed churn rate, by score decile"
            info="If the model says 30%, about 30% of those customers should churn. Points on the diagonal mean probabilities can be used directly for expected-value calculations (e.g. expected LTV at risk) without re-calibration."
          />
          <div className="px-3">
            <ChartBox height={300}>
              <ScatterChart margin={{ top: 6, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={C.grid} />
                <XAxis type="number" dataKey="pred" domain={[0, 1]} {...axis} tickFormatter={pctTick} label={{ value: "Mean predicted probability", position: "insideBottom", offset: -2, fontSize: 11, fill: "#64748b" }} height={36} />
                <YAxis type="number" dataKey="obs" domain={[0, 1]} {...yAxis} tickFormatter={pctTick} />
                <ZAxis dataKey="n" range={[70, 70]} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#cbd5e1" strokeDasharray="4 4" />
                <Tooltip
                  cursor={false}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTip
                        rows={[
                          { label: "Predicted", value: pct(payload[0].payload.pred) },
                          { label: "Observed", value: pct(payload[0].payload.obs) },
                          { label: "Customers", value: int(payload[0].payload.n) },
                        ]}
                      />
                    ) : null
                  }
                />
                <Scatter data={data.calibration} fill={C.churn} line={{ stroke: C.churn, strokeWidth: 1.5 }} isAnimationActive={false} />
              </ScatterChart>
            </ChartBox>
          </div>
          <div className="px-5 pb-4 text-[12px] leading-relaxed text-muted">
            Scores are bimodal: most customers are confidently safe (&lt;10%) or confidently lost (&gt;90%), with a small uncertain middle band — a direct consequence of the
            deterministic rules.
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Cumulative gains"
            subtitle="Share of all churners captured when contacting the top x% of customers by risk"
            info="The business view of ranking quality. A random list captures x% of churners in x% of customers (dashed). The perfect model would reach 100% at the base rate."
          />
          <div className="px-3">
            <ChartBox height={260}>
              <AreaChart data={[{ pct_customers: 0, captured: 0, random: 0, perfect: 0 }, ...data.gains.map((g) => ({ ...g, random: g.pct_customers / 100, perfect: Math.min(1, g.pct_customers / 100 / m.churn_rate) }))]} margin={{ top: 6, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="pct_customers" {...axis} tickFormatter={(v) => `${v}%`} />
                <YAxis {...yAxis} tickFormatter={pctTick} domain={[0, 1]} />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTip
                        title={`Top ${payload[0].payload.pct_customers}% of customers`}
                        rows={[
                          { label: "Model captures", value: pct(payload[0].payload.captured), color: C.churn },
                          { label: "Perfect", value: pct(payload[0].payload.perfect) },
                          { label: "Random", value: pct(payload[0].payload.random) },
                        ]}
                      />
                    ) : null
                  }
                />
                <Area dataKey="perfect" stroke="#cbd5e1" fill="none" strokeDasharray="2 3" isAnimationActive={false} />
                <Area dataKey="random" stroke="#94a3b8" fill="none" strokeDasharray="4 4" isAnimationActive={false} />
                <Area dataKey="captured" stroke={C.churn} strokeWidth={2.5} fill={C.churn} fillOpacity={0.08} isAnimationActive={false} />
              </AreaChart>
            </ChartBox>
          </div>
          <div className="flex items-center justify-between px-5 pb-4">
            <Legend
              items={[
                { color: C.churn, label: "model" },
                { color: "#94a3b8", label: "random", dashed: true },
                { color: "#cbd5e1", label: "perfect", dashed: true },
              ]}
            />
            <span className="text-[12px] text-ink-2">
              Top 20% → <b className="num">{pct(data.gains[1].captured, 0)}</b> of churners · lift <b className="num">{data.gains[0].lift.toFixed(1)}×</b> in decile 1
            </span>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Churn rate by risk decile"
            subtitle="Observed churn in each 10% slice of the ranked hold-out set"
          />
          <div className="px-3 pb-3">
            <ChartBox height={290}>
              <BarChart data={data.gains} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="decile" {...axis} tickFormatter={(v) => `D${v}`} />
                <YAxis {...yAxis} tickFormatter={pctTick} domain={[0, 1]} />
                <ReferenceLine y={m.churn_rate} stroke={C.muted} strokeDasharray="3 3" />
                <Tooltip cursor={{ fill: "#f1f5f9" }} content={({ active, payload }) => (active && payload?.length ? <ChartTip title={`Decile ${payload[0].payload.decile}`} rows={[{ label: "Churn rate", value: pct(payload[0].payload.rate) }, { label: "Lift", value: `${payload[0].payload.lift.toFixed(2)}×` }]} /> : null)} />
                <Bar dataKey="rate" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {data.gains.map((g) => (
                    <Cell key={g.decile} fill={g.rate > m.churn_rate ? C.churn : "#cbd5e1"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartBox>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Feature-set ablation"
            subtitle="Does adding engineered or demographic features help? (5-fold CV, ±1 sd)"
            info="Decision rule set in advance: keep a feature group only if it improves mean CV AUC by more than 0.001. Neither group cleared the bar, so the simpler 20-feature behavioural model was kept."
          />
          <div className="px-3 pb-3">
            <ChartBox height={220}>
              <BarChart data={data.ablation.map((a) => ({ ...a, err: a.auc_std }))} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }}>
                <XAxis type="number" domain={[0.92, 0.932]} hide />
                <YAxis type="category" dataKey="set" {...yAxis} width={170} tick={{ fontSize: 11.5, fill: "#334155" }} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} content={({ active, payload }) => (active && payload?.length ? <ChartTip title={payload[0].payload.set} rows={[{ label: "CV AUC", value: `${payload[0].payload.auc_mean.toFixed(4)} ± ${payload[0].payload.auc_std.toFixed(4)}` }, { label: "Features", value: payload[0].payload.n_features }]} /> : null)} />
                <Bar dataKey="auc_mean" barSize={16} radius={[0, 3, 3, 0]} isAnimationActive={false}>
                  {data.ablation.map((a) => (
                    <Cell key={a.set} fill={a.selected ? C.ink : "#cbd5e1"} />
                  ))}
                  <ErrorBar dataKey="err" width={5} stroke="#64748b" direction="x" />
                </Bar>
              </BarChart>
            </ChartBox>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Hyper-parameter search"
            subtitle={`${m.n_trials} random configurations, each scored by 5-fold CV with early stopping`}
            info="Each dot is one configuration. The spread is small (≈0.002 AUC), which says performance is limited by the information in the data, not by tuning. Point size = number of leaves."
          />
          <div className="px-3">
            <ChartBox height={180}>
              <ScatterChart margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis type="number" dataKey="trial" {...axis} domain={[0, m.n_trials + 1]} />
                <YAxis type="number" dataKey="auc_mean" {...yAxis} width={52} domain={["dataMin - 0.0005", "dataMax + 0.0005"]} tickFormatter={(v) => v.toFixed(3)} />
                <ZAxis type="number" dataKey="num_leaves" range={[30, 160]} />
                <Tooltip cursor={false} content={({ active, payload }) => (active && payload?.length ? <ChartTip title={`Trial ${payload[0].payload.trial}`} rows={[{ label: "CV AUC", value: payload[0].payload.auc_mean.toFixed(4) }, { label: "leaves", value: payload[0].payload.num_leaves }, { label: "learning rate", value: payload[0].payload.learning_rate }, { label: "min child", value: payload[0].payload.min_child_samples }, { label: "trees", value: payload[0].payload.n_estimators }]} /> : null)} />
                <Scatter data={data.tuning.trials} isAnimationActive={false}>
                  {data.tuning.trials.map((t) => (
                    <Cell key={t.trial} fill={t.trial === data.tuning.best.trial ? C.churn : "#94a3b8"} fillOpacity={t.trial === data.tuning.best.trial ? 1 : 0.6} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ChartBox>
          </div>
          <div className="flex flex-wrap gap-1.5 px-5 pt-1 pb-4">
            {Object.entries(m.best_params).map(([k, v]) => (
              <span key={k} className="num rounded-md bg-canvas px-2 py-1 text-[11px] text-ink-2">
                {k}=<b className="text-ink">{v}</b>
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Finding title="Why this evaluation is trustworthy" tone="ok">
          Hold-out AUC ({sel.test_auc.toFixed(3)}) matches cross-validated AUC ({sel.cv_auc_mean?.toFixed(3)}) and out-of-fold AUC over all 50k customers ({m.oof_auc.toFixed(3)}),
          so there is no sign of over-fitting. Every customer-level score shown in this dashboard is out-of-fold — produced by a model that never saw that customer.
        </Finding>
      </div>
    </>
  );
}
