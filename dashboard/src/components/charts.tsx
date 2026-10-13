import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

export const C = {
  churn: "#e5484d",
  churnDark: "#c92a2f",
  churnSoft: "#f6b3b5",
  keep: "#3e63dd",
  keepSoft: "#a9b9f0",
  ink: "#0b1220",
  muted: "#94a3b8",
  grid: "#eef0f3",
  warn: "#d97706",
  ok: "#12a26b",
};

export const axis = {
  tickLine: false,
  axisLine: { stroke: "#e5e7eb" },
  tick: { fontSize: 11, fill: "#64748b" },
} as const;

export const yAxis = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: "#64748b" },
  width: 44,
} as const;

export function ChartBox({ height = 260, children }: { height?: number; children: ReactNode }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export const pctTick = (v: number) => `${Math.round(v * 100)}%`;
