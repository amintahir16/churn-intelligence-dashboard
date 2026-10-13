import type { NavProps } from "../App";
import { Card, CardHeader, PageHeader } from "../components/ui";
import { data } from "../lib/data";
import { int } from "../lib/format";

export default function Methodology(_: NavProps) {
  const m = data.meta;
  const steps = [
    { n: "1", t: "Audit", d: `Profiled ${m.columns} columns × ${int(m.rows)} rows: missingness, impossible values, outliers, duplicates, leakage screen.` },
    { n: "2", t: "Clean", d: "Impossible values → NaN; extreme order values winsorised at p99.9; missingness kept as signal." },
    { n: "3", t: "Analyse", d: "Mann–Whitney / χ² tests with Bonferroni correction; effect sizes; Wilson CIs; Spearman correlations; interaction heatmaps." },
    { n: "4", t: "Select features", d: "Pre-registered ablation: engineered and demographic groups kept only if CV AUC improves by > 0.001." },
    { n: "5", t: "Model", d: `LR, RF, XGBoost, LightGBM on identical stratified ${m.folds}-fold CV; LightGBM tuned by ${m.n_trials}-trial random search with early stopping.` },
    { n: "6", t: "Evaluate", d: `Single untouched ${int(m.test_rows)}-row hold-out: ROC/PR-AUC, Brier, log-loss, KS, calibration, gains, lift.` },
    { n: "7", t: "Explain", d: "Exact TreeSHAP on out-of-fold predictions; surrogate tree; complexity ladder to quantify interactions." },
    { n: "8", t: "Act", d: "Segments, risk × value matrix, profit-optimal threshold, counterfactual intervention scenarios." },
  ];
  const limits = [
    { t: "Correlation, not causation", d: "Scenario impacts are model-based counterfactuals. Each lever should be validated with a randomised retention experiment (uplift modelling) before budget is committed." },
    { t: "Snapshot data, no timeline", d: "There are no event timestamps, so this is a classification of who churned rather than when. With dated activity, a survival model (Cox / discrete-time hazard) would estimate time-to-churn." },
    { t: "Label definition", d: "The exactly-100% rule segments suggest the churn label may partly encode business policy. Confirm the label definition with the data owner." },
    { t: "Fairness", d: "Age contributes to the score via the under-25 discount interaction. Before using scores for pricing or offers, check for disparate impact by age group and consider an age-blind variant (the AUC cost can be measured with the same ablation harness)." },
    { t: "Drift", d: "Missingness is predictive, so tracking-pipeline changes would shift scores. Monitor feature completeness and PSI alongside AUC in production." },
  ];
  return (
    <>
      <PageHeader eyebrow="Methodology" title="How this analysis was built">
        A reproducible pipeline from raw CSV to dashboard: one Python script generates every number shown here, and the browser re-implements the final model exactly.
      </PageHeader>

      <Card>
        <CardHeader title="Pipeline" subtitle={`analysis/churn_pipeline.py · end-to-end runtime ≈ ${Math.round(m.runtime_seconds / 60)} min on a laptop`} />
        <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="bg-white p-4">
              <div className="flex items-center gap-2">
                <span className="num grid h-5 w-5 place-items-center rounded-full bg-ink text-[10.5px] font-semibold text-white">{s.n}</span>
                <span className="text-[13px] font-semibold">{s.t}</span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{s.d}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Validation design" />
          <div className="space-y-3 px-5 pb-5 text-[12.5px] leading-relaxed text-ink-2">
            <p>
              <b className="text-ink">Split.</b> Stratified 80/20 split (seed {m.seed}). All selection — features, model family, hyper-parameters — used only the{" "}
              {int(m.train_rows)} training rows via {m.folds}-fold CV. The hold-out was scored once.
            </p>
            <p>
              <b className="text-ink">Customer scores.</b> Risk scores, SHAP explanations and the at-risk list come from a separate {m.folds}-fold out-of-fold pass over all{" "}
              {int(m.rows)} customers, so no customer is scored by a model trained on them (OOF AUC {m.oof_auc.toFixed(3)}).
            </p>
            <p>
              <b className="text-ink">Browser model.</b> The final model is trained on all rows and exported as {data.meta.best_params.n_estimators} flattened trees. A
              TypeScript scorer and exact TreeSHAP implementation reproduce LightGBM's raw scores and <code className="num text-[11.5px]">pred_contrib</code> output to
              &lt; 1e-6 (checked by <code className="num text-[11.5px]">npm run verify-model</code>).
            </p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Stack" />
          <div className="grid grid-cols-2 gap-4 px-5 pb-5 text-[12.5px]">
            <div>
              <div className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Analysis</div>
              <ul className="space-y-0.5 text-ink-2">
                <li>pandas · NumPy · SciPy</li>
                <li>scikit-learn</li>
                <li>LightGBM · XGBoost</li>
                <li>TreeSHAP (native)</li>
              </ul>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Dashboard</div>
              <ul className="space-y-0.5 text-ink-2">
                <li>React · TypeScript · Vite</li>
                <li>Tailwind CSS</li>
                <li>Recharts + custom SVG</li>
                <li>Single self-contained HTML file</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Limitations and next steps" subtitle="What a careful reader should keep in mind" />
        <div className="grid gap-px border-t border-line bg-line md:grid-cols-2 xl:grid-cols-3">
          {limits.map((l) => (
            <div key={l.t} className="bg-white p-4">
              <div className="text-[13px] font-semibold">{l.t}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{l.d}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
