import { sigmoid } from "../lib/gbm";
import { num, pct } from "../lib/format";

export interface Contribution {
  key: string;
  label: string;
  value: number | null;
  shap: number;
}

/** SHAP waterfall in log-odds space, annotated with probabilities. */
export function Waterfall({
  base,
  items,
  top = 8,
  onSelect,
  selected,
}: {
  base: number;
  items: Contribution[];
  top?: number;
  onSelect?: (key: string) => void;
  selected?: string;
}) {
  const sorted = [...items].sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap));
  const head = sorted.slice(0, top);
  const rest = sorted.slice(top);
  const restSum = rest.reduce((a, b) => a + b.shap, 0);
  const rows: (Contribution & { other?: boolean })[] = [...head];
  if (rest.length) rows.push({ key: "__rest", label: `${rest.length} other features`, value: null, shap: restSum, other: true });

  let run = base;
  const steps = rows.map((r) => {
    const start = run;
    run += r.shap;
    return { ...r, start, end: run };
  });
  const final = run;
  const xs = [base, final, ...steps.flatMap((s) => [s.start, s.end])];
  const lo = Math.min(...xs) - 0.3;
  const hi = Math.max(...xs) + 0.3;
  const X = (v: number) => ((v - lo) / (hi - lo)) * 100;

  return (
    <div className="text-[12px]">
      <div className="mb-2 flex items-center justify-between text-[11.5px] text-muted">
        <span>
          Baseline <b className="num text-ink">{pct(sigmoid(base), 0)}</b>
        </span>
        <span>
          Prediction <b className={`num ${sigmoid(final) >= 0.5 ? "text-churn" : "text-keep"}`}>{pct(sigmoid(final), 1)}</b>
        </span>
      </div>
      <div className="relative">
        <div className="absolute top-0 bottom-0 w-px bg-slate-300" style={{ left: `calc(190px + (100% - 190px - 50px) * ${X(base) / 100})` }} />
        {steps.map((s) => {
          const l = Math.min(X(s.start), X(s.end));
          const w = Math.max(0.6, Math.abs(X(s.end) - X(s.start)));
          const up = s.shap > 0;
          const isSel = selected === s.key;
          const interactive = !!onSelect && !s.other;
          const Row = interactive ? "button" : "div";
          return (
            <Row
              key={s.key}
              {...(interactive ? { type: "button" as const, onClick: () => onSelect!(s.key) } : {})}
              className={`grid w-full grid-cols-[190px_1fr_50px] items-center gap-0 rounded py-[3px] text-left transition-colors ${interactive ? "cursor-pointer hover:bg-slate-50" : ""} ${isSel ? "bg-keep-soft/60" : ""}`}
            >
              <span className="flex items-baseline justify-between gap-1 pr-3 text-ink-2">
                <span className={`truncate ${s.other ? "text-muted italic" : isSel ? "font-semibold text-ink" : ""}`}>{s.label}</span>
                {!s.other && <span className="num shrink-0 text-[11px] text-muted">{s.value === null ? "n/a" : num(s.value, 1)}</span>}
              </span>
              <span className="relative h-[18px]">
                <span
                  className="absolute top-[3px] bottom-[3px] rounded-[3px] transition-all duration-300"
                  style={{ left: `${l}%`, width: `${w}%`, background: s.other ? "#cbd5e1" : up ? "#e5484d" : "#3e63dd" }}
                />
              </span>
              <span className={`num text-right text-[11.5px] font-medium ${up ? "text-churn" : "text-keep"}`}>
                {up ? "+" : "−"}
                {Math.abs(s.shap).toFixed(2)}
              </span>
            </Row>
          );
        })}
      </div>
      <div className="mt-2 text-[10.5px] text-muted">Bars in log-odds; red pushes towards churn, blue towards retention. Contributions sum exactly to the prediction.</div>
    </div>
  );
}
