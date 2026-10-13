# Churn Intelligence — 50,000 e-commerce customers

An end-to-end churn analysis: data audit, statistical analysis, model selection, explainability, and a business-ready interactive dashboard.

**Open `dashboard/dist/index.html` in any browser** — it is a single self-contained file (no server, no internet needed).

## Headline findings

| | |
|---|---|
| Churn rate | 28.9% (14,450 of 50,000) · $20.6M lifetime value lost |
| Model | LightGBM, hold-out ROC-AUC **0.929**, PR-AUC 0.911, well calibrated |
| Ranking | Top 20% of scored customers contains 67% of all churners |

1. **High-value customers with repeated service issues always churn.** Service calls ≥ 6 and lifetime value in the top quartile → 100% churn (4,124 customers, 29% of churners, 51% of lost LTV). 1,600+ active high-value customers sit at exactly 5 calls today.
2. **Under-25s who don't use discounts always churn.** Age ≤ 24 and discount usage < 30% → 100% churn; above 30% usage the same cohort churns at the base rate.
3. **Everyone else follows a disengagement gradient** — cart abandonment above ~70%, low email engagement, few purchases, long recency.
4. **Demographics and geography don't matter** (Cramér's V ≤ 0.03) and were dropped from the model after an ablation test.
5. **Missing data is a signal** — customers with no recorded session length or email open rate churn at ~41%.

Linear models reach only AUC 0.77 versus 0.93 for boosted trees; a complexity ladder attributes +0.10 AUC to non-linear thresholds and +0.05 to feature interactions.

## Dashboard pages

| Page | What it shows |
|---|---|
| Executive summary | KPIs, churn anatomy, six findings, quantified playbook |
| Churn anatomy | The two interaction rules, early-warning cohorts, complexity ladder, interaction heatmap, surrogate tree |
| Driver explorer | Effect-size ranking, per-feature churn curves with 95% CIs, demographics, correlation matrix |
| Data quality | Missingness vs churn, anomalies, cleaning decision log |
| Model performance | Leaderboard, ROC/PR, calibration, gains, ablation, hyper-parameter search |
| Explainability | Global SHAP, beeswarm, dependence curves |
| Segments | Behavioural personas, risk × value priority matrix |
| Decision lab | Live profit-optimal threshold from your cost assumptions; intervention scenarios |
| At-risk customers | 400 highest-risk active customers with reasons, talking points, CSV export |
| What-if simulator | The real model running in the browser with exact TreeSHAP — move sliders, watch risk respond |
| Methodology | Pipeline, validation design, limitations |

## Reproduce

```bash
# 1. analysis (≈ 15 min on a laptop) — writes dashboard/src/data/*.json
pip install pandas numpy scipy scikit-learn lightgbm xgboost
python analysis/churn_pipeline.py

# 2. dashboard
cd dashboard
npm install
npm run verify-model   # checks the JS scorer reproduces LightGBM exactly
npm run dev            # http://localhost:5173
npm run build          # -> dist/index.html (single file)
```

## Validation design

- Stratified 80/20 split; all selection (features, model family, hyper-parameters) done with 5-fold CV on the training set only; hold-out scored once.
- Every customer-level score and explanation is **out-of-fold** — no customer is scored by a model that saw them.
- Feature groups kept only if they improve CV AUC by > 0.001 (decision rule fixed before looking at results).

## Repository layout

```
analysis/churn_pipeline.py   full analysis pipeline
dashboard/src/pages/         one file per dashboard page
dashboard/src/lib/gbm.ts     LightGBM inference + exact TreeSHAP in TypeScript
dashboard/src/data/          pipeline outputs consumed by the dashboard
```
