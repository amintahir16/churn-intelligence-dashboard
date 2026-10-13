import insightsJson from "../data/insights.json";
import modelJson from "../data/model.json";
import type { Insights, ModelBundle } from "./types";

export const data = insightsJson as unknown as Insights;
export const model = modelJson as unknown as ModelBundle;
