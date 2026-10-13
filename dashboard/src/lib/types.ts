import type { FlatTree } from "./gbm";

export interface Meta {
  rows: number;
  columns: number;
  churn_rate: number;
  churned: number;
  retained: number;
  ltv_lost: number;
  ltv_total: number;
  avg_ltv_churned: number;
  avg_ltv_retained: number;
  active_at_risk: number;
  active_at_risk_ltv: number;
  test_auc: number;
  test_pr_auc: number;
  oof_auc: number;
  best_f1_threshold: number;
  top_decile_lift: number;
  top3_capture: number;
  selected_model: string;
  best_cv_model: string;
  n_features: number;
  best_params: Record<string, number>;
  n_trials: number;
  seed: number;
  folds: number;
  train_rows: number;
  test_rows: number;
  calls_cliff: { le5: number; ge6: number; n_ge6: number };
  cart_cliff: { le65: number; gt75: number; n_gt75: number };
  runtime_seconds: number;
}

export interface MissingRow {
  feature: string;
  label: string;
  n: number;
  pct: number;
  churn_missing: number;
  churn_present: number;
  p_value: number;
  informative: boolean;
}

export interface AnomalyRow {
  feature: string;
  label: string;
  rule: string;
  n: number;
  action: string;
}

export interface StatRow {
  feature: string;
  label: string;
  kind: "numeric" | "categorical";
  test: string;
  effect: number;
  effect_name: string;
  cohens_d: number | null;
  p_value: number;
  auc: number | null;
  direction: string;
  median_churned: number | null;
  median_retained: number | null;
  mean_churned: number | null;
  mean_retained: number | null;
}

export interface Bin {
  x0: number;
  x1: number;
  mid: number;
  n: number;
  churned: number;
  retained: number;
  rate: number | null;
  ci: [number, number];
}

export interface FeatureProfile {
  label: string;
  bins: Bin[];
  integer: boolean;
  deciles: { range: string; rate: number; n: number }[];
  missing_rate: number;
  churn_if_missing: number | null;
}

export interface CatLevel {
  level: string;
  n: number;
  rate: number;
  ci: [number, number];
}

export interface ModelRow {
  name: string;
  cv_auc_mean: number | null;
  cv_auc_std: number | null;
  cv_pr_mean: number | null;
  test_auc: number;
  test_pr_auc: number;
  test_brier: number | null;
  test_logloss: number | null;
  ks: number;
  fit_seconds: number;
  roc: [number, number][];
  pr: [number, number][];
}

export interface ShapGlobal {
  feature: string;
  label: string;
  mean_abs: number;
  share: number;
  corr_sign: number;
}

export interface Reason {
  feature: string;
  label: string;
  value: number | null;
  shap: number;
}

export interface AtRisk {
  id: string;
  risk: number;
  ltv: number;
  country: string;
  city: string;
  segment: string;
  tier: string;
  value_tier: string;
  base: number;
  shap: number[];
  reasons: Reason[];
  x: (number | null)[];
}

export interface Persona {
  id: number;
  name: string;
  description: string;
  size: number;
  share: number;
  churn_rate: number;
  avg_risk: number;
  avg_ltv: number;
  ltv_lost: number;
  profile: Record<string, number>;
  medians: Record<string, number>;
}

export interface Scenario {
  name: string;
  description: string;
  lever: string;
  eligible: number;
  base_risk: number;
  new_risk: number;
  churners_avoided: number;
  ltv_protected: number;
}

export interface Rule {
  id: string;
  name: string;
  definition: string;
  n: number;
  churn_rate: number;
  share_of_churners: number;
  ltv_lost: number;
  share_of_ltv_lost: number;
  near_n: number;
  near_label: string;
  near_ltv: number;
  near_avg_risk: number | null;
}

export interface SurrogateNode {
  n: number;
  rate: number;
  depth: number;
  feature?: string;
  label?: string;
  threshold?: number;
  left?: SurrogateNode;
  right?: SurrogateNode;
}

export interface Insights {
  meta: Meta;
  quality: {
    missing: MissingRow[];
    anomalies: AnomalyRow[];
    notes: Record<string, number>;
  };
  stats: StatRow[];
  features: Record<string, FeatureProfile>;
  categoricals: Record<string, CatLevel[]>;
  correlation: { labels: string[]; keys: string[]; matrix: number[][] };
  heatmap: {
    x_label: string;
    y_label: string;
    xs: string[];
    ys: string[];
    cells: { rate: number | null; n: number }[][];
  };
  ablation: { set: string; n_features: number; auc_mean: number; auc_std: number; selected: boolean }[];
  tuning: { trials: (Record<string, number>)[]; best: Record<string, number> };
  models: ModelRow[];
  calibration: { pred: number; obs: number; n: number }[];
  gains: { decile: number; pct_customers: number; captured: number; lift: number; rate: number }[];
  test_scores: { p: number[]; y: number[]; ltv: number[] };
  shap: {
    global: ShapGlobal[];
    beeswarm: { feature: string; label: string; points: [number, number | null][] }[];
    dependence: Record<
      string,
      { label: string; points: { x: number; mean: number; p10: number; p90: number; n: number }[]; missing_shap: number | null }
    >;
  };
  segments: {
    k: number;
    silhouette: { k: number; silhouette: number; inertia: number }[];
    personas: Persona[];
    features: string[];
    labels: Record<string, string>;
  };
  risk_value: {
    risk_tiers: string[];
    value_tiers: string[];
    risk_bins: number[];
    ltv_cuts: number[];
    cells: { n: number; ltv: number; avg_risk: number | null }[][];
    historic_rate_by_tier: number[];
    count_by_tier_all: number[];
  };
  at_risk: AtRisk[];
  scenarios: Scenario[];
  anatomy: {
    rules: Rule[];
    mix: { rule_churners: number; other_churners: number; residual_rate: number; residual_n: number; residual_test_auc: number };
    ladder: { name: string; detail: string; auc: number }[];
    surrogate: { tree: SurrogateNode; auc: number; fidelity_auc: number };
    curves: {
      ltv_by_calls: { bin: string; low_calls: number; high_calls: number }[];
      discount_by_age: { bin: string; young: number; older: number }[];
      age: { bin: string; rate: number; n: number }[];
    };
    ltv_p75: number;
  };
  features_order: string[];
  pretty: Record<string, string>;
}

export interface FeatureMeta {
  key: string;
  label: string;
  median: number;
  min: number;
  max: number;
  step: number;
  derived: boolean;
}

export interface ModelBundle {
  features: string[];
  meta: FeatureMeta[];
  trees: FlatTree[];
  samples: { id: string; risk: number; x: (number | null)[] }[];
}
