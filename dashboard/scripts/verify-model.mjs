// Checks that the browser scorer reproduces LightGBM's raw scores and pred_contrib SHAP values.
import { readFileSync } from "node:fs";
import { rawScore, treeShap } from "../src/lib/gbm.ts";

const model = JSON.parse(readFileSync(new URL("../src/data/model.json", import.meta.url)));
const ver = JSON.parse(readFileSync(new URL("../../analysis/verification.json", import.meta.url)));
const F = model.features.length;

let maxRaw = 0;
let maxShap = 0;
ver.rows.forEach((row, i) => {
  maxRaw = Math.max(maxRaw, Math.abs(rawScore(model.trees, row) - ver.raw[i]));
  const phi = treeShap(model.trees, row, F);
  phi.forEach((v, j) => (maxShap = Math.max(maxShap, Math.abs(v - ver.contrib[i][j]))));
});
console.log(`rows=${ver.rows.length} max|Δraw|=${maxRaw.toExponential(2)} max|Δshap|=${maxShap.toExponential(2)}`);
if (maxRaw > 1e-3 || maxShap > 1e-3) {
  console.error("MISMATCH");
  process.exit(1);
}
console.log("OK — JS scorer matches LightGBM");
