"""
End-to-end churn analysis pipeline.

Reads the raw CSV, cleans it, runs statistical analysis, compares models,
explains the chosen model with TreeSHAP, segments customers and exports
everything the dashboard needs to dashboard/src/data/*.json.

Run:  python analysis/churn_pipeline.py
"""
from __future__ import annotations

import json
import time
import warnings
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    f1_score,
    log_loss,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
    silhouette_score,
)
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "ecommerce_customer_churn_dataset.csv"
OUT = ROOT / "dashboard" / "src" / "data"
OUT.mkdir(parents=True, exist_ok=True)

SEED = 42
N_FOLDS = 5
TARGET = "Churned"
rng = np.random.default_rng(SEED)
T0 = time.time()


def log(msg: str) -> None:
    print(f"[{time.time() - T0:6.1f}s] {msg}", flush=True)


def r(x, n=4):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return None
    return round(float(x), n)


NUMERIC = [
    "Age", "Membership_Years", "Login_Frequency", "Session_Duration_Avg",
    "Pages_Per_Session", "Cart_Abandonment_Rate", "Wishlist_Items",
    "Total_Purchases", "Average_Order_Value", "Days_Since_Last_Purchase",
    "Discount_Usage_Rate", "Returns_Rate", "Email_Open_Rate",
    "Customer_Service_Calls", "Product_Reviews_Written",
    "Social_Media_Engagement_Score", "Mobile_App_Usage",
    "Payment_Method_Diversity", "Lifetime_Value", "Credit_Balance",
]
CATEGORICAL = ["Gender", "Country", "City", "Signup_Quarter"]
ENGAGEMENT = [
    "Login_Frequency", "Session_Duration_Avg", "Pages_Per_Session",
    "Wishlist_Items", "Email_Open_Rate", "Mobile_App_Usage",
    "Social_Media_Engagement_Score", "Product_Reviews_Written",
]
PRETTY = {
    "Age": "Age", "Membership_Years": "Membership (yrs)",
    "Login_Frequency": "Logins / month", "Session_Duration_Avg": "Session length (min)",
    "Pages_Per_Session": "Pages / session", "Cart_Abandonment_Rate": "Cart abandonment %",
    "Wishlist_Items": "Wishlist items", "Total_Purchases": "Total purchases",
    "Average_Order_Value": "Avg order value", "Days_Since_Last_Purchase": "Days since last order",
    "Discount_Usage_Rate": "Discount usage %", "Returns_Rate": "Returns %",
    "Email_Open_Rate": "Email open %", "Customer_Service_Calls": "Service calls",
    "Product_Reviews_Written": "Reviews written", "Social_Media_Engagement_Score": "Social engagement",
    "Mobile_App_Usage": "App usage", "Payment_Method_Diversity": "Payment methods",
    "Lifetime_Value": "Lifetime value", "Credit_Balance": "Credit balance",
    "Engagement_Index": "Engagement index", "Purchases_Per_Year": "Purchases / year",
    "Calls_Per_Year": "Service calls / year",
}


# ---------------------------------------------------------------------------
# 1. Load & data quality
# ---------------------------------------------------------------------------
log("Loading data")
raw = pd.read_csv(RAW)
raw.insert(0, "Customer_ID", [f"C{i + 1:05d}" for i in range(len(raw))])
df = raw.copy()
y_all = df[TARGET].to_numpy()

quality_missing = []
for c in NUMERIC + CATEGORICAL:
    m = df[c].isna()
    if m.sum() == 0:
        continue
    table = pd.crosstab(m, df[TARGET])
    chi2, p, *_ = stats.chi2_contingency(table)
    quality_missing.append({
        "feature": c, "label": PRETTY.get(c, c), "n": int(m.sum()), "pct": r(m.mean() * 100, 2),
        "churn_missing": r(df.loc[m, TARGET].mean()), "churn_present": r(df.loc[~m, TARGET].mean()),
        "p_value": float(p), "informative": bool(p < 0.001),
    })

anomaly_rules = [
    ("Age", (df.Age < 16) | (df.Age > 100), "Age outside 16–100 (values 5, 10, 150, 200)", "Set to missing"),
    ("Total_Purchases", df.Total_Purchases < 0, "Negative purchase count", "Set to missing"),
    ("Cart_Abandonment_Rate", df.Cart_Abandonment_Rate > 100, "Rate above 100%", "Set to missing"),
    ("Discount_Usage_Rate", df.Discount_Usage_Rate > 100, "Rate above 100%", "Set to missing"),
]
quality_anomalies = []
for col, mask, rule, action in anomaly_rules:
    quality_anomalies.append({"feature": col, "label": PRETTY[col], "rule": rule, "n": int(mask.sum()), "action": action})
    df.loc[mask, col] = np.nan

aov_cap = float(df.Average_Order_Value.quantile(0.999))
n_aov = int((df.Average_Order_Value > aov_cap).sum())
quality_anomalies.append({
    "feature": "Average_Order_Value", "label": PRETTY["Average_Order_Value"],
    "rule": f"Extreme order value (> p99.9 = {aov_cap:,.0f}; max {raw.Average_Order_Value.max():,.0f})",
    "n": n_aov, "action": f"Winsorised at {aov_cap:,.0f}",
})
df["Average_Order_Value"] = df.Average_Order_Value.clip(upper=aov_cap)

quality_notes = {
    "duplicates": int(raw.drop(columns="Customer_ID").duplicated().sum()),
    "fractional_purchases": int((raw.Total_Purchases % 1 != 0).sum()),
    "zero_ltv": int((raw.Lifetime_Value == 0).sum()),
    "total_missing_cells": int(raw[NUMERIC + CATEGORICAL].isna().sum().sum()),
    "rows_complete": int(raw[NUMERIC + CATEGORICAL].notna().all(axis=1).sum()),
}
log(f"Cleaned: {sum(a['n'] for a in quality_anomalies)} anomalous cells treated")


# ---------------------------------------------------------------------------
# 2. Statistical analysis (univariate)
# ---------------------------------------------------------------------------
log("Univariate statistics")
n_tests = len(NUMERIC) + len(CATEGORICAL)
stat_rows = []
for c in NUMERIC:
    m = df[c].notna()
    a, b = df.loc[m & (df[TARGET] == 1), c], df.loc[m & (df[TARGET] == 0), c]
    u, p = stats.mannwhitneyu(a, b, alternative="two-sided")
    auc = u / (len(a) * len(b))
    pooled = np.sqrt(((len(a) - 1) * a.var() + (len(b) - 1) * b.var()) / (len(a) + len(b) - 2))
    stat_rows.append({
        "feature": c, "label": PRETTY[c], "kind": "numeric", "test": "Mann–Whitney U",
        "effect": r(2 * auc - 1), "effect_name": "rank-biserial r", "cohens_d": r((a.mean() - b.mean()) / pooled),
        "p_value": float(min(p * n_tests, 1.0)), "auc": r(max(auc, 1 - auc)),
        "direction": "higher → more churn" if auc > 0.5 else "lower → more churn",
        "median_churned": r(a.median(), 2), "median_retained": r(b.median(), 2),
        "mean_churned": r(a.mean(), 2), "mean_retained": r(b.mean(), 2),
    })
for c in CATEGORICAL:
    table = pd.crosstab(df[c], df[TARGET])
    chi2, p, dof, _ = stats.chi2_contingency(table)
    v = np.sqrt(chi2 / (table.values.sum() * (min(table.shape) - 1)))
    stat_rows.append({
        "feature": c, "label": c.replace("_", " "), "kind": "categorical", "test": "χ² independence",
        "effect": r(v), "effect_name": "Cramér's V", "cohens_d": None,
        "p_value": float(min(p * n_tests, 1.0)), "auc": None, "direction": "—",
        "median_churned": None, "median_retained": None, "mean_churned": None, "mean_retained": None,
    })
stat_rows.sort(key=lambda d: -abs(d["effect"] or 0))


def wilson(k, n, z=1.96):
    if n == 0:
        return (0, 0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


feature_profiles = {}
for c in NUMERIC:
    s = df[c]
    lo, hi = s.quantile(0.005), s.quantile(0.995)
    is_int = bool((s.dropna() % 1 == 0).mean() > 0.98) and (hi - lo) <= 40
    if is_int:
        edges = np.arange(np.floor(lo) - 0.5, np.ceil(hi) + 1.5, 1.0 if hi - lo <= 25 else 2.0)
    else:
        edges = np.linspace(lo, hi, 25)
    clipped = s.clip(edges[0], edges[-1] - 1e-9)
    idx = pd.cut(clipped, edges, include_lowest=True, labels=False)
    bins = []
    for i in range(len(edges) - 1):
        sel = idx == i
        n = int(sel.sum())
        k = int(df.loc[sel, TARGET].sum())
        lo_ci, hi_ci = wilson(k, n)
        bins.append({
            "x0": r(edges[i], 3), "x1": r(edges[i + 1], 3), "mid": r((edges[i] + edges[i + 1]) / 2, 3),
            "n": n, "churned": k, "retained": n - k, "rate": r(k / n) if n else None,
            "ci": [r(lo_ci), r(hi_ci)],
        })
    q = pd.qcut(s, 10, duplicates="drop")
    deciles = df.groupby(q, observed=True)[TARGET].agg(["mean", "size"]).reset_index()
    feature_profiles[c] = {
        "label": PRETTY[c], "bins": bins, "integer": is_int,
        "deciles": [{"range": f"{iv.left:.4g}–{iv.right:.4g}", "rate": r(m_), "n": int(n_)}
                    for iv, m_, n_ in deciles.itertuples(index=False)],
        "missing_rate": r(s.isna().mean()),
        "churn_if_missing": r(df.loc[s.isna(), TARGET].mean()) if s.isna().any() else None,
    }

categorical_profiles = {}
for c in CATEGORICAL:
    g = df.groupby(c)[TARGET].agg(["sum", "size"]).reset_index().sort_values("size", ascending=False)
    rows = []
    for lvl, k, n in g.itertuples(index=False):
        lo_ci, hi_ci = wilson(k, n)
        rows.append({"level": str(lvl), "n": int(n), "rate": r(k / n), "ci": [r(lo_ci), r(hi_ci)]})
    categorical_profiles[c] = rows

corr_cols = NUMERIC + [TARGET]
corr = df[corr_cols].corr(method="spearman")
order = corr[TARGET].drop(TARGET).sort_values().index.tolist() + [TARGET]
corr = corr.loc[order, order]
correlation = {"labels": [PRETTY.get(c, "Churned") for c in order], "keys": order,
               "matrix": [[r(v, 3) for v in row] for row in corr.values]}

# two-way interaction heatmap of the two strongest drivers
calls_bins = [-0.5, 2.5, 4.5, 5.5, 6.5, 8.5, 10.5, 30]
calls_lbl = ["0–2", "3–4", "5", "6", "7–8", "9–10", "11+"]
cart_bins = [-0.1, 40, 50, 60, 65, 70, 75, 80, 101]
cart_lbl = ["≤40", "40–50", "50–60", "60–65", "65–70", "70–75", "75–80", "80+"]
hx = pd.cut(df.Customer_Service_Calls, calls_bins, labels=calls_lbl)
hy = pd.cut(df.Cart_Abandonment_Rate, cart_bins, labels=cart_lbl)
hm = df.groupby([hy, hx], observed=False)[TARGET].agg(["mean", "size"])
heatmap = {
    "x_label": "Service calls", "y_label": "Cart abandonment %", "xs": calls_lbl, "ys": cart_lbl,
    "cells": [[{"rate": r(hm.loc[(yl, xl), "mean"]) if hm.loc[(yl, xl), "size"] >= 30 else None,
                "n": int(hm.loc[(yl, xl), "size"])} for xl in calls_lbl] for yl in cart_lbl],
}


# ---------------------------------------------------------------------------
# 3. Feature engineering
# ---------------------------------------------------------------------------
ENG_STATS = {c: (float(df[c].mean()), float(df[c].std())) for c in ENGAGEMENT}
DEMO_LEVELS = {
    "Gender": sorted(df.Gender.dropna().unique().tolist()),
    "Country": sorted(df.Country.dropna().unique().tolist()),
    "Signup_Quarter": sorted(df.Signup_Quarter.dropna().unique().tolist()),
}


def engineered(frame: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=frame.index)
    z = pd.concat([(frame[c] - m) / s for c, (m, s) in ENG_STATS.items()], axis=1)
    out["Engagement_Index"] = z.mean(axis=1, skipna=True)
    yrs = frame.Membership_Years.clip(lower=0.25)
    out["Purchases_Per_Year"] = frame.Total_Purchases / yrs
    out["Calls_Per_Year"] = frame.Customer_Service_Calls / yrs
    return out


def demographics(frame: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=frame.index)
    for col, levels in DEMO_LEVELS.items():
        for lv in levels:
            out[f"{col}={lv}"] = (frame[col] == lv).astype(float)
    return out


def build(frame: pd.DataFrame, use_eng: bool, use_demo: bool) -> pd.DataFrame:
    parts = [frame[NUMERIC].astype(float)]
    if use_eng:
        parts.append(engineered(frame))
    if use_demo:
        parts.append(demographics(frame))
    return pd.concat(parts, axis=1)


# ---------------------------------------------------------------------------
# 4. Train / test split and feature-set ablation
# ---------------------------------------------------------------------------
idx_train, idx_test = train_test_split(np.arange(len(df)), test_size=0.2, stratify=y_all, random_state=SEED)
y_tr, y_te = y_all[idx_train], y_all[idx_test]
skf = StratifiedKFold(N_FOLDS, shuffle=True, random_state=SEED)
folds_tr = list(skf.split(idx_train, y_tr))

BASE_LGB = dict(objective="binary", learning_rate=0.05, num_leaves=31, min_child_samples=40,
                subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0,
                n_estimators=2000, verbose=-1, random_state=SEED, n_jobs=8)


def cv_lgb(X: pd.DataFrame, y: np.ndarray, params: dict, folds) -> tuple[float, float, int, np.ndarray]:
    oof = np.zeros(len(y))
    aucs, iters = [], []
    for tr, va in folds:
        m = lgb.LGBMClassifier(**params)
        m.fit(X.iloc[tr], y[tr], eval_set=[(X.iloc[va], y[va])], eval_metric="auc",
              callbacks=[lgb.early_stopping(100, verbose=False)])
        oof[va] = m.predict_proba(X.iloc[va])[:, 1]
        aucs.append(roc_auc_score(y[va], oof[va]))
        iters.append(m.best_iteration_)
    return float(np.mean(aucs)), float(np.std(aucs)), int(np.mean(iters)), oof


log("Feature-set ablation")
train_df = df.iloc[idx_train]
ablation = []
for name, ue, ud in [("Behavioural (20 raw)", False, False),
                     ("+ Engineered (3)", True, False),
                     ("+ Demographics (15)", False, True),
                     ("+ Engineered + Demographics", True, True)]:
    X = build(train_df, ue, ud)
    m_auc, s_auc, it, _ = cv_lgb(X, y_tr, BASE_LGB, folds_tr)
    ablation.append({"set": name, "use_eng": ue, "use_demo": ud, "n_features": X.shape[1],
                     "auc_mean": r(m_auc, 5), "auc_std": r(s_auc, 5)})
    log(f"  {name:32s} AUC {m_auc:.4f} ± {s_auc:.4f}")

base_auc = ablation[0]["auc_mean"]
MIN_GAIN = 0.001
USE_ENG = ablation[1]["auc_mean"] - base_auc > MIN_GAIN
USE_DEMO = ablation[2]["auc_mean"] - base_auc > MIN_GAIN
for a in ablation:
    a["selected"] = a["use_eng"] == USE_ENG and a["use_demo"] == USE_DEMO
log(f"Decision: engineered={USE_ENG}, demographics={USE_DEMO}")

X_all = build(df, USE_ENG, USE_DEMO)
FEATURES = X_all.columns.tolist()
X_tr, X_te = X_all.iloc[idx_train], X_all.iloc[idx_test]


# ---------------------------------------------------------------------------
# 5. Hyper-parameter search (random search, CV on train only)
# ---------------------------------------------------------------------------
log("Hyper-parameter search")
space = {
    "learning_rate": [0.02, 0.03, 0.05],
    "num_leaves": [7, 15, 31, 63],
    "min_child_samples": [20, 50, 100, 200],
    "colsample_bytree": [0.5, 0.7, 0.9],
    "subsample": [0.7, 0.85, 1.0],
    "reg_lambda": [0.0, 1.0, 5.0, 20.0],
    "min_split_gain": [0.0, 0.05],
}
trials = []
N_TRIALS = 24
for t in range(N_TRIALS):
    p = {k: v[rng.integers(len(v))] for k, v in space.items()}
    p = {k: (float(v) if isinstance(v, (np.floating, float)) else int(v)) for k, v in p.items()}
    params = {**BASE_LGB, **p}
    m_auc, s_auc, it, _ = cv_lgb(X_tr, y_tr, params, folds_tr)
    trials.append({"trial": t + 1, **p, "n_estimators": it, "auc_mean": r(m_auc, 5), "auc_std": r(s_auc, 5)})
    log(f"  trial {t + 1:02d} AUC {m_auc:.4f}  {p}")
best = max(trials, key=lambda d: d["auc_mean"])
BEST_PARAMS = {**BASE_LGB, **{k: best[k] for k in space}, "n_estimators": best["n_estimators"]}
log(f"Best CV AUC {best['auc_mean']:.4f} with {best['n_estimators']} trees")


# ---------------------------------------------------------------------------
# 6. Model comparison (same folds, same features)
# ---------------------------------------------------------------------------
log("Model comparison")
X_tr_imp_cols = FEATURES


def lr_model():
    return make_pipeline(SimpleImputer(strategy="median", add_indicator=True), StandardScaler(),
                         LogisticRegression(max_iter=2000, C=0.5))


def rf_model():
    return make_pipeline(SimpleImputer(strategy="median", add_indicator=True),
                         RandomForestClassifier(n_estimators=400, min_samples_leaf=10, max_features=0.4,
                                                n_jobs=8, random_state=SEED))


def xgb_model():
    return XGBClassifier(n_estimators=600, learning_rate=0.03, max_depth=5, subsample=0.85,
                         colsample_bytree=0.7, min_child_weight=5, reg_lambda=2.0,
                         eval_metric="logloss", n_jobs=8, random_state=SEED, tree_method="hist")


def lgb_model():
    p = {k: v for k, v in BEST_PARAMS.items()}
    return lgb.LGBMClassifier(**p)


def lr_input(X):
    X = X.copy()
    for c in ["Average_Order_Value", "Lifetime_Value", "Days_Since_Last_Purchase", "Credit_Balance"]:
        X[c] = np.log1p(X[c].clip(lower=0))
    return X


candidates = {
    "Logistic Regression": (lr_model, lr_input),
    "Random Forest": (rf_model, lambda X: X),
    "XGBoost": (xgb_model, lambda X: X),
    "LightGBM (tuned)": (lgb_model, lambda X: X),
}


def downsample_curve(xs, ys, n=120):
    idx = np.unique(np.linspace(0, len(xs) - 1, n).astype(int))
    return [[r(xs[i]), r(ys[i])] for i in idx]


rule_score_te = (df.iloc[idx_test].Customer_Service_Calls.fillna(5) >= 6).astype(float).to_numpy()
models_out = []
test_preds = {}
for name, (factory, prep) in candidates.items():
    t1 = time.time()
    cv_auc, cv_pr = [], []
    for tr, va in folds_tr:
        mdl = factory()
        mdl.fit(prep(X_tr.iloc[tr]), y_tr[tr])
        pv = mdl.predict_proba(prep(X_tr.iloc[va]))[:, 1]
        cv_auc.append(roc_auc_score(y_tr[va], pv))
        cv_pr.append(average_precision_score(y_tr[va], pv))
    mdl = factory()
    mdl.fit(prep(X_tr), y_tr)
    pt = mdl.predict_proba(prep(X_te))[:, 1]
    test_preds[name] = pt
    fpr, tpr, _ = roc_curve(y_te, pt)
    prec, rec, _ = precision_recall_curve(y_te, pt)
    ks = float(np.max(tpr - fpr))
    models_out.append({
        "name": name, "cv_auc_mean": r(np.mean(cv_auc)), "cv_auc_std": r(np.std(cv_auc)),
        "cv_pr_mean": r(np.mean(cv_pr)), "test_auc": r(roc_auc_score(y_te, pt)),
        "test_pr_auc": r(average_precision_score(y_te, pt)), "test_brier": r(brier_score_loss(y_te, pt)),
        "test_logloss": r(log_loss(y_te, pt)), "ks": r(ks), "fit_seconds": r(time.time() - t1, 1),
        "roc": downsample_curve(fpr, tpr), "pr": downsample_curve(rec[::-1], prec[::-1]),
    })
    log(f"  {name:22s} CV AUC {np.mean(cv_auc):.4f}  test AUC {models_out[-1]['test_auc']:.4f}")

fpr, tpr, _ = roc_curve(y_te, rule_score_te)
models_out.insert(0, {
    "name": "Rule: ≥6 service calls", "cv_auc_mean": None, "cv_auc_std": None, "cv_pr_mean": None,
    "test_auc": r(roc_auc_score(y_te, rule_score_te)), "test_pr_auc": r(average_precision_score(y_te, rule_score_te)),
    "test_brier": None, "test_logloss": None, "ks": r(np.max(tpr - fpr)), "fit_seconds": 0,
    "roc": [[r(a), r(b)] for a, b in zip(fpr, tpr)], "pr": [],
})
best_model_name = max((m for m in models_out if m["cv_auc_mean"]), key=lambda m: m["cv_auc_mean"])["name"]
log(f"Selected by CV AUC: {best_model_name}")

p_te = test_preds["LightGBM (tuned)"]

# calibration (10 quantile bins)
cal = pd.DataFrame({"p": p_te, "y": y_te})
cal["bin"] = pd.qcut(cal.p, 10, labels=False, duplicates="drop")
calibration = [{"pred": r(g.p.mean()), "obs": r(g.y.mean()), "n": int(len(g))} for _, g in cal.groupby("bin")]

# cumulative gains / lift by decile
order_te = np.argsort(-p_te)
gains = []
total_pos = y_te.sum()
for d in range(1, 11):
    k = int(round(len(p_te) * d / 10))
    top = y_te[order_te[:k]]
    seg = y_te[order_te[int(round(len(p_te) * (d - 1) / 10)):k]]
    gains.append({"decile": d, "pct_customers": d * 10, "captured": r(top.sum() / total_pos),
                  "lift": r(seg.mean() / y_te.mean(), 3), "rate": r(seg.mean())})

thr_grid = np.linspace(0.05, 0.95, 91)
f1s = [f1_score(y_te, p_te >= t) for t in thr_grid]
best_f1_thr = float(thr_grid[int(np.argmax(f1s))])

ltv_te = df.iloc[idx_test].Lifetime_Value.to_numpy()
test_scores = {"p": [r(v, 4) for v in p_te], "y": y_te.astype(int).tolist(), "ltv": [r(v, 0) for v in ltv_te]}


# ---------------------------------------------------------------------------
# 7. Out-of-fold scoring + TreeSHAP for every customer
# ---------------------------------------------------------------------------
log("OOF scoring + TreeSHAP on all customers")
skf_all = StratifiedKFold(N_FOLDS, shuffle=True, random_state=SEED + 1)
oof = np.zeros(len(df))
contrib = np.zeros((len(df), len(FEATURES) + 1))
for tr, va in skf_all.split(X_all, y_all):
    m = lgb.LGBMClassifier(**BEST_PARAMS)
    m.fit(X_all.iloc[tr], y_all[tr])
    oof[va] = m.predict_proba(X_all.iloc[va])[:, 1]
    contrib[va] = m.predict(X_all.iloc[va], pred_contrib=True)
shap_vals = contrib[:, :-1]
log(f"OOF AUC (all 50k) {roc_auc_score(y_all, oof):.4f}")

mean_abs = np.abs(shap_vals).mean(axis=0)
gorder = np.argsort(-mean_abs)
shap_global = [{"feature": FEATURES[i], "label": PRETTY.get(FEATURES[i], FEATURES[i]),
                "mean_abs": r(mean_abs[i]),
                "share": r(mean_abs[i] / mean_abs.sum()),
                "corr_sign": r(pd.Series(X_all.iloc[:, i]).corr(pd.Series(shap_vals[:, i]), method="spearman"), 3)}
               for i in gorder]

TOP_SHAP = [FEATURES[i] for i in gorder[:12]]
bee_idx = rng.choice(len(df), 900, replace=False)
beeswarm = []
for f in TOP_SHAP:
    j = FEATURES.index(f)
    vals = X_all.iloc[bee_idx, j]
    lo, hi = vals.quantile(0.02), vals.quantile(0.98)
    norm = ((vals - lo) / (hi - lo)).clip(0, 1)
    beeswarm.append({"feature": f, "label": PRETTY.get(f, f),
                     "points": [[r(s, 3), (r(nv, 3) if pd.notna(nv) else None)]
                                for s, nv in zip(shap_vals[bee_idx, j], norm)]})

dependence = {}
for f in TOP_SHAP[:10]:
    j = FEATURES.index(f)
    x = X_all.iloc[:, j]
    ok = x.notna()
    qbins = pd.qcut(x[ok], 30, duplicates="drop")
    g = pd.DataFrame({"x": x[ok], "s": shap_vals[ok.to_numpy(), j], "b": qbins}).groupby("b", observed=True)
    dependence[f] = {
        "label": PRETTY.get(f, f),
        "points": [{"x": r(gg.x.median(), 3), "mean": r(gg.s.mean(), 4), "p10": r(gg.s.quantile(0.1), 4),
                    "p90": r(gg.s.quantile(0.9), 4), "n": int(len(gg))} for _, gg in g],
        "missing_shap": r(shap_vals[~ok.to_numpy(), j].mean(), 4) if (~ok).any() else None,
    }


# ---------------------------------------------------------------------------
# 8. Final model on all data (for simulator & scenarios) + tree export
# ---------------------------------------------------------------------------
log("Final model on all data")
final = lgb.LGBMClassifier(**BEST_PARAMS)
final.fit(X_all, y_all)
booster = final.booster_
dump = booster.dump_model()


def flatten_tree(node):
    feat, thr, left, right, dleft, miss, val, cover = [], [], [], [], [], [], [], []

    def visit(nd):
        i = len(feat)
        for arr in (feat, thr, left, right, dleft, miss, val, cover):
            arr.append(None)
        if "leaf_index" in nd or "leaf_value" in nd and "split_feature" not in nd:
            feat[i], thr[i], left[i], right[i], dleft[i], miss[i] = -1, 0, -1, -1, 0, 0
            val[i] = nd["leaf_value"]
            cover[i] = nd.get("leaf_count", 0)
            return i
        feat[i] = nd["split_feature"]
        thr[i] = nd["threshold"]
        dleft[i] = 1 if nd["default_left"] else 0
        miss[i] = {"None": 0, "Zero": 1, "NaN": 2}[nd["missing_type"]]
        val[i] = nd["internal_value"]
        cover[i] = nd["internal_count"]
        left[i] = visit(nd["left_child"])
        right[i] = visit(nd["right_child"])
        return i

    visit(node)
    return {"f": feat, "t": [r(t, 6) for t in thr], "l": left, "r": right, "d": dleft, "m": miss,
            "v": [r(v, 7) for v in val], "c": cover}


trees = [flatten_tree(t["tree_structure"]) for t in dump["tree_info"]]
assert all(op == "<=" for t in dump["tree_info"] for op in [t["tree_structure"].get("decision_type", "<=")])

feature_meta = []
for f in FEATURES:
    s = X_all[f]
    feature_meta.append({
        "key": f, "label": PRETTY.get(f, f), "median": r(s.median(), 3), "min": r(s.quantile(0.005), 3),
        "max": r(s.quantile(0.995), 3), "step": 1 if (s.dropna() % 1 == 0).mean() > 0.98 else r((s.quantile(0.995) - s.quantile(0.005)) / 100, 3),
        "derived": f not in NUMERIC,
    })

simulator = {
    "features": FEATURES, "meta": feature_meta, "trees": trees,
    "engineered": USE_ENG, "demographics": USE_DEMO,
    "eng_stats": {k: [r(m, 6), r(s, 6)] for k, (m, s) in ENG_STATS.items()},
    "demo_levels": DEMO_LEVELS if USE_DEMO else {},
}

# verification sample for the JS scorer (raw margin + shap)
ver_idx = rng.choice(len(df), 40, replace=False)
ver_X = X_all.iloc[ver_idx]
verification = {
    "rows": [[None if pd.isna(v) else float(v) for v in row] for row in ver_X.to_numpy()],
    "raw": booster.predict(ver_X, raw_score=True).tolist(),
    "contrib": booster.predict(ver_X, pred_contrib=True).tolist(),
}


# ---------------------------------------------------------------------------
# 9. Segmentation (behavioural personas) and risk × value matrix
# ---------------------------------------------------------------------------
log("Segmentation")
SEG_FEATS = ["Login_Frequency", "Session_Duration_Avg", "Pages_Per_Session", "Cart_Abandonment_Rate",
             "Total_Purchases", "Average_Order_Value", "Days_Since_Last_Purchase", "Discount_Usage_Rate",
             "Returns_Rate", "Email_Open_Rate", "Customer_Service_Calls", "Mobile_App_Usage",
             "Lifetime_Value", "Wishlist_Items"]
seg_X = df[SEG_FEATS].fillna(df[SEG_FEATS].median())
seg_X = seg_X.assign(Average_Order_Value=np.log1p(seg_X.Average_Order_Value),
                     Lifetime_Value=np.log1p(seg_X.Lifetime_Value),
                     Days_Since_Last_Purchase=np.log1p(seg_X.Days_Since_Last_Purchase))
Z = StandardScaler().fit_transform(seg_X)
sil_idx = rng.choice(len(df), 8000, replace=False)
sil = []
for k in range(3, 8):
    km = KMeans(k, n_init=10, random_state=SEED).fit(Z)
    sil.append({"k": k, "silhouette": r(silhouette_score(Z[sil_idx], km.labels_[sil_idx]), 4),
                "inertia": r(km.inertia_, 0)})
    log(f"  k={k} silhouette {sil[-1]['silhouette']}")
# silhouette is near-flat on this one-factor dataset; prefer the largest k within 0.01 of the best
best_sil = max(s["silhouette"] for s in sil)
K = max(s["k"] for s in sil if s["silhouette"] >= best_sil - 0.01)
km = KMeans(K, n_init=20, random_state=SEED).fit(Z)
labels = km.labels_
zdf = pd.DataFrame(Z, columns=SEG_FEATS)
personas = []
for c in range(K):
    sel = labels == c
    prof = zdf[sel].mean()
    personas.append({
        "id": int(c), "size": int(sel.sum()), "share": r(sel.mean()),
        "churn_rate": r(y_all[sel].mean()), "avg_risk": r(oof[sel].mean()),
        "avg_ltv": r(df.Lifetime_Value[sel].mean(), 0), "ltv_lost": r(df.Lifetime_Value[sel & (y_all == 1)].sum(), 0),
        "profile": {f: r(prof[f], 3) for f in SEG_FEATS},
        "medians": {f: r(df.loc[sel, f].median(), 2) for f in SEG_FEATS},
    })


def name_persona(p):
    z = p["profile"]
    if z["Customer_Service_Calls"] > 0.6 and z["Login_Frequency"] < 0:
        return "Frustrated & Fading", "Many support calls, low engagement"
    if z["Login_Frequency"] > 0.6 and z["Cart_Abandonment_Rate"] < -0.4:
        return "Loyal Power Users", "Highly engaged, complete their carts"
    if z["Average_Order_Value"] > 0.8:
        return "Big-Ticket Occasionals", "High order value, infrequent visits"
    if z["Days_Since_Last_Purchase"] > 0.6:
        return "Drifting Away", "Long gap since last order"
    if z["Cart_Abandonment_Rate"] > 0.5 and z["Login_Frequency"] < -0.3:
        return "Disengaged Browsers", "Low activity, abandon carts"
    if z["Discount_Usage_Rate"] > 0.6:
        return "Deal Seekers", "Discount-driven buyers"
    if z["Returns_Rate"] > 0.6:
        return "Serial Returners", "High return rates"
    return "Steady Mainstream", "Close to the average customer"


used = set()
for p in sorted(personas, key=lambda d: d["churn_rate"]):
    nm, desc = name_persona(p)
    if nm in used:
        nm = f"{nm} II"
    used.add(nm)
    p["name"], p["description"] = nm, desc
personas.sort(key=lambda d: -d["churn_rate"])

active = y_all == 0
risk_bins = [0, 0.3, 0.5, 0.7, 1.01]
risk_lbl = ["Low", "Medium", "High", "Critical"]
ltv_q = df.Lifetime_Value.quantile([1 / 3, 2 / 3]).tolist()
val_lbl = ["Low value", "Mid value", "High value"]
rt = pd.cut(oof, risk_bins, labels=risk_lbl, right=False)
vt = pd.cut(df.Lifetime_Value, [-1, ltv_q[0], ltv_q[1], 1e12], labels=val_lbl)
matrix = []
for rl in risk_lbl:
    row = []
    for vl in val_lbl:
        sel = (rt == rl) & (vt == vl) & active
        row.append({"n": int(sel.sum()), "ltv": r(df.Lifetime_Value[sel].sum(), 0),
                    "avg_risk": r(oof[sel].mean()) if sel.any() else None})
    matrix.append(row)
risk_value = {"risk_tiers": risk_lbl, "value_tiers": val_lbl, "risk_bins": risk_bins[:-1] + [1.0],
              "ltv_cuts": [r(v, 0) for v in ltv_q], "cells": matrix,
              "historic_rate_by_tier": [r(y_all[rt == rl].mean()) for rl in risk_lbl],
              "count_by_tier_all": [int((rt == rl).sum()) for rl in risk_lbl]}


# ---------------------------------------------------------------------------
# 10. At-risk active customers with local explanations
# ---------------------------------------------------------------------------
log("At-risk list")
act_idx = np.where(active)[0]
top_idx = act_idx[np.argsort(-oof[act_idx])][:400]
at_risk = []
for i in top_idx:
    s = shap_vals[i]
    order_i = np.argsort(-np.abs(s))[:6]
    at_risk.append({
        "id": df.Customer_ID.iat[i], "risk": r(oof[i]), "ltv": r(df.Lifetime_Value.iat[i], 0),
        "country": df.Country.iat[i], "city": df.City.iat[i], "segment": next(p["name"] for p in personas if p["id"] == labels[i]),
        "tier": str(rt[i]), "value_tier": str(vt.iat[i]),
        "base": r(contrib[i, -1], 4),
        "shap": [r(v, 4) for v in s],
        "reasons": [{"feature": FEATURES[j], "label": PRETTY.get(FEATURES[j], FEATURES[j]),
                     "value": (None if pd.isna(X_all.iat[i, j]) else r(X_all.iat[i, j], 2)), "shap": r(s[j], 4)}
                    for j in order_i],
        "x": [None if pd.isna(v) else r(v, 3) for v in X_all.iloc[i].to_numpy()],
    })

sample_customers = []
for i in rng.choice(np.where(active)[0], 6, replace=False).tolist() + top_idx[:3].tolist():
    sample_customers.append({"id": df.Customer_ID.iat[i], "risk": r(oof[i]),
                             "x": [None if pd.isna(v) else r(v, 3) for v in X_all.iloc[i].to_numpy()]})


# ---------------------------------------------------------------------------
# 11. Model-based intervention scenarios (associational, not causal)
# ---------------------------------------------------------------------------
log("Scenarios")
target_pop = active & (oof >= 0.5)
base_raw = df[target_pop].copy()
base_p = final.predict_proba(build(base_raw, USE_ENG, USE_DEMO))[:, 1]


def scenario(name, desc, lever, fn, eligible):
    mod = base_raw.copy()
    elig = eligible(mod).to_numpy()
    mod = fn(mod)
    new_p = final.predict_proba(build(mod, USE_ENG, USE_DEMO))[:, 1]
    new_p = np.where(elig, new_p, base_p)
    delta = base_p - new_p
    ltv = base_raw.Lifetime_Value.to_numpy()
    return {"name": name, "description": desc, "lever": lever, "eligible": int(elig.sum()),
            "base_risk": r(base_p[elig].mean()) if elig.any() else None,
            "new_risk": r(new_p[elig].mean()) if elig.any() else None,
            "churners_avoided": r(delta.sum(), 0), "ltv_protected": r((delta * ltv).sum(), 0)}


scenarios = [
    scenario("Resolve issues before the 6th call", "Cap service calls at 5 via first-contact resolution",
             "Customer_Service_Calls",
             lambda d: d.assign(Customer_Service_Calls=d.Customer_Service_Calls.clip(upper=5)),
             lambda d: d.Customer_Service_Calls >= 6),
    scenario("Cart recovery programme", "Reduce cart abandonment by 15 pts for heavy abandoners",
             "Cart_Abandonment_Rate",
             lambda d: d.assign(Cart_Abandonment_Rate=(d.Cart_Abandonment_Rate - 15).clip(lower=0)),
             lambda d: d.Cart_Abandonment_Rate > 65),
    scenario("Win-back for dormant buyers", "Bring customers idle > 30 days back to a 30-day cadence",
             "Days_Since_Last_Purchase",
             lambda d: d.assign(Days_Since_Last_Purchase=d.Days_Since_Last_Purchase.clip(upper=30)),
             lambda d: d.Days_Since_Last_Purchase > 30),
    scenario("Engagement nudges", "+3 logins/month, +5 pts email opens, +5 app usage",
             "Login_Frequency",
             lambda d: d.assign(Login_Frequency=d.Login_Frequency + 3, Email_Open_Rate=(d.Email_Open_Rate + 5).clip(upper=100),
                                Mobile_App_Usage=d.Mobile_App_Usage + 5),
             lambda d: d.Login_Frequency < 10),
]
combo = scenario("Combined playbook", "All four levers applied to the eligible customers", "all",
                 lambda d: d.assign(
                     Customer_Service_Calls=d.Customer_Service_Calls.clip(upper=5),
                     Cart_Abandonment_Rate=np.where(d.Cart_Abandonment_Rate > 65, (d.Cart_Abandonment_Rate - 15).clip(lower=0), d.Cart_Abandonment_Rate),
                     Days_Since_Last_Purchase=d.Days_Since_Last_Purchase.clip(upper=30),
                     Login_Frequency=np.where(d.Login_Frequency < 10, d.Login_Frequency + 3, d.Login_Frequency),
                     Email_Open_Rate=np.where(d.Login_Frequency < 10, (d.Email_Open_Rate + 5).clip(upper=100), d.Email_Open_Rate),
                     Mobile_App_Usage=np.where(d.Login_Frequency < 10, d.Mobile_App_Usage + 5, d.Mobile_App_Usage)),
                 lambda d: pd.Series(True, index=d.index))
scenarios.append(combo)


# ---------------------------------------------------------------------------
# 12. Churn anatomy: interaction rules, complexity ladder, surrogate tree
# ---------------------------------------------------------------------------
log("Churn anatomy")
from sklearn.tree import DecisionTreeClassifier

ltv_p75 = float(df.Lifetime_Value.quantile(0.75))
calls_s, ltv_s, age_s, disc_s = df.Customer_Service_Calls, df.Lifetime_Value, df.Age, df.Discount_Usage_Rate
rule_defs = [
    {"id": "service_value", "name": "High-value customers with repeated service issues",
     "definition": f"Service calls ≥ 6  AND  lifetime value > {ltv_p75:,.0f} (top quartile)",
     "mask": (calls_s >= 6) & (ltv_s > ltv_p75),
     "near": (calls_s == 5) & (ltv_s > ltv_p75),
     "near_label": "High-value customers sitting at exactly 5 calls — one call away"},
    {"id": "young_no_discount", "name": "Young customers who don't use discounts",
     "definition": "Age ≤ 24  AND  discount usage < 30%",
     "mask": (age_s <= 24) & (disc_s < 30),
     "near": (age_s <= 24) & (disc_s >= 30) & (disc_s < 35),
     "near_label": "Under-25s using discounts only 30–35% of the time"},
]
rules_out = []
churned_mask = y_all == 1
any_rule = np.zeros(len(df), bool)
for rd in rule_defs:
    m = rd["mask"].fillna(False).to_numpy()
    near = rd["near"].fillna(False).to_numpy() & active
    any_rule |= m
    rules_out.append({
        "id": rd["id"], "name": rd["name"], "definition": rd["definition"], "n": int(m.sum()),
        "churn_rate": r(y_all[m].mean()), "share_of_churners": r(y_all[m].sum() / y_all.sum()),
        "ltv_lost": r(df.Lifetime_Value[m & churned_mask].sum(), 0),
        "share_of_ltv_lost": r(df.Lifetime_Value[m & churned_mask].sum() / df.Lifetime_Value[churned_mask].sum()),
        "near_n": int(near.sum()), "near_label": rd["near_label"],
        "near_ltv": r(df.Lifetime_Value[near].sum(), 0), "near_avg_risk": r(oof[near].mean()) if near.any() else None,
    })
residual = ~any_rule
rest_te = residual[idx_test]
anatomy_mix = {
    "rule_churners": int(y_all[any_rule].sum()), "other_churners": int(y_all[residual].sum()),
    "residual_rate": r(y_all[residual].mean()), "residual_n": int(residual.sum()),
    "residual_test_auc": r(roc_auc_score(y_te[rest_te], p_te[rest_te])),
}

# conditional curves that reveal each interaction
ltv_edges = [0, 500, 1000, 1500, 1874, 2500, 3000, 9000]
ltv_lbl = ["<500", "500–1k", "1k–1.5k", "1.5k–1.87k", "1.87k–2.5k", "2.5k–3k", "3k+"]
lb = pd.cut(ltv_s, ltv_edges, labels=ltv_lbl, include_lowest=True)
curve_ltv = [{"bin": b,
              "low_calls": r(df[TARGET][(lb == b) & (calls_s <= 5)].mean()),
              "high_calls": r(df[TARGET][(lb == b) & (calls_s >= 6)].mean())} for b in ltv_lbl]
disc_edges = [0, 10, 20, 25, 30, 35, 40, 50, 60, 120]
disc_lbl = ["<10", "10–20", "20–25", "25–30", "30–35", "35–40", "40–50", "50–60", "60+"]
dbn = pd.cut(disc_s, disc_edges, labels=disc_lbl, include_lowest=True)
curve_disc = [{"bin": b,
               "young": r(df[TARGET][(dbn == b) & (age_s <= 24)].mean()),
               "older": r(df[TARGET][(dbn == b) & (age_s > 24)].mean())} for b in disc_lbl]
age_edges = [0, 18, 20, 22, 24, 26, 30, 40, 50, 60, 120]
age_lbl = ["<18", "18–20", "20–22", "22–24", "24–26", "26–30", "30–40", "40–50", "50–60", "60+"]
ab = pd.cut(age_s, age_edges, labels=age_lbl, include_lowest=True)
curve_age = [{"bin": b, "rate": r(df[TARGET][ab == b].mean()), "n": int((ab == b).sum())} for b in age_lbl]

# complexity ladder: how much signal is linear vs. non-linear vs. interaction
ladder = [{"name": "Logistic regression", "detail": "linear, additive", "auc": next(m["cv_auc_mean"] for m in models_out if m["name"] == "Logistic Regression")}]
for depth, leaves, label, detail in [(1, 2, "GBM depth 1", "non-linear, no interactions"),
                                     (2, 3, "GBM depth 2", "pairwise interactions"),
                                     (3, 7, "GBM depth 3", "3-way interactions")]:
    p_ = {**BASE_LGB, "max_depth": depth, "num_leaves": leaves, "learning_rate": 0.05}
    m_auc, _, _, _ = cv_lgb(X_tr, y_tr, p_, folds_tr)
    ladder.append({"name": label, "detail": detail, "auc": r(m_auc)})
ladder.append({"name": "LightGBM (tuned)", "detail": f"{BEST_PARAMS['num_leaves']} leaves, full interactions", "auc": best["auc_mean"]})

# depth-3 surrogate tree (fit on the raw features; sklearn handles NaN natively)
sur = DecisionTreeClassifier(max_depth=3, min_samples_leaf=300, random_state=SEED).fit(X_all, y_all)
tr_ = sur.tree_


def sur_node(i, depth=0):
    n = int(tr_.n_node_samples[i])
    rate = float(tr_.value[i][0][1]) if tr_.value[i][0].sum() <= 1.0001 else float(tr_.value[i][0][1] / tr_.value[i][0].sum())
    node = {"n": n, "rate": r(rate), "depth": depth}
    if tr_.children_left[i] != -1:
        f = FEATURES[tr_.feature[i]]
        node.update({"feature": f, "label": PRETTY.get(f, f), "threshold": r(tr_.threshold[i], 2),
                     "left": sur_node(tr_.children_left[i], depth + 1),
                     "right": sur_node(tr_.children_right[i], depth + 1)})
    return node


surrogate = {"tree": sur_node(0), "auc": r(roc_auc_score(y_all, sur.predict_proba(X_all)[:, 1])),
             "fidelity_auc": r(roc_auc_score((oof >= 0.5).astype(int), sur.predict_proba(X_all)[:, 1]))}
anatomy = {"rules": rules_out, "mix": anatomy_mix, "ladder": ladder, "surrogate": surrogate,
           "curves": {"ltv_by_calls": curve_ltv, "discount_by_age": curve_disc, "age": curve_age},
           "ltv_p75": r(ltv_p75, 0)}
log(f"  rules cover {anatomy_mix['rule_churners']} churners; residual test AUC {anatomy_mix['residual_test_auc']}")


# ---------------------------------------------------------------------------
# 13. Headline numbers & export
# ---------------------------------------------------------------------------
churned = y_all == 1
calls = df.Customer_Service_Calls
cart = df.Cart_Abandonment_Rate
meta = {
    "rows": int(len(df)), "columns": int(raw.shape[1] - 1), "churn_rate": r(y_all.mean()),
    "churned": int(churned.sum()), "retained": int((~churned).sum()),
    "ltv_lost": r(df.Lifetime_Value[churned].sum(), 0), "ltv_total": r(df.Lifetime_Value.sum(), 0),
    "avg_ltv_churned": r(df.Lifetime_Value[churned].mean(), 0), "avg_ltv_retained": r(df.Lifetime_Value[~churned].mean(), 0),
    "active_at_risk": int((active & (oof >= 0.5)).sum()),
    "active_at_risk_ltv": r(df.Lifetime_Value[active & (oof >= 0.5)].sum(), 0),
    "test_auc": r(roc_auc_score(y_te, p_te)), "test_pr_auc": r(average_precision_score(y_te, p_te)),
    "oof_auc": r(roc_auc_score(y_all, oof)), "best_f1_threshold": r(best_f1_thr, 2),
    "top_decile_lift": gains[0]["lift"], "top3_capture": gains[2]["captured"],
    "selected_model": "LightGBM (tuned)", "best_cv_model": best_model_name, "n_features": len(FEATURES),
    "best_params": {k: BEST_PARAMS[k] for k in list(space) + ["n_estimators"]},
    "n_trials": N_TRIALS, "seed": SEED, "folds": N_FOLDS, "train_rows": int(len(idx_train)), "test_rows": int(len(idx_test)),
    "calls_cliff": {"le5": r(df[TARGET][calls <= 5].mean()), "ge6": r(df[TARGET][calls >= 6].mean()),
                    "n_ge6": int((calls >= 6).sum())},
    "cart_cliff": {"le65": r(df[TARGET][cart <= 65].mean()), "gt75": r(df[TARGET][cart > 75].mean()),
                   "n_gt75": int((cart > 75).sum())},
    "runtime_seconds": r(time.time() - T0, 0),
}

insights = {
    "meta": meta,
    "quality": {"missing": sorted(quality_missing, key=lambda d: -d["pct"]), "anomalies": quality_anomalies, "notes": quality_notes},
    "stats": stat_rows, "features": feature_profiles, "categoricals": categorical_profiles,
    "correlation": correlation, "heatmap": heatmap,
    "ablation": ablation, "tuning": {"trials": trials, "best": best},
    "models": models_out, "calibration": calibration, "gains": gains, "test_scores": test_scores,
    "shap": {"global": shap_global, "beeswarm": beeswarm, "dependence": dependence},
    "segments": {"k": K, "silhouette": sil, "personas": personas, "features": SEG_FEATS,
                 "labels": {f: PRETTY[f] for f in SEG_FEATS}},
    "risk_value": risk_value, "at_risk": at_risk, "scenarios": scenarios, "anatomy": anatomy,
    "features_order": FEATURES, "pretty": {f: PRETTY.get(f, f) for f in FEATURES},
}


def dump_json(obj, path):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"), allow_nan=False, default=lambda o: None)
    log(f"wrote {path.name} ({path.stat().st_size / 1024:.0f} KB)")


def clean_nan(o):
    if isinstance(o, float):
        return o if np.isfinite(o) else None
    if isinstance(o, dict):
        return {k: clean_nan(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean_nan(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return clean_nan(float(o))
    return o


dump_json(clean_nan(insights), OUT / "insights.json")
dump_json(clean_nan({**simulator, "samples": sample_customers}), OUT / "model.json")
dump_json(clean_nan(verification), ROOT / "analysis" / "verification.json")
log("Done")
