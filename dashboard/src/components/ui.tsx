import { useState, type ReactNode } from "react";
import { Info, Lightbulb } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-panel shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  info,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  info?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold tracking-tight text-ink">
          {title}
          {info && <InfoTip>{info}</InfoTip>}
        </h3>
        {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function InfoTip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="How to read this"
        className="cursor-pointer rounded text-muted/70 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-keep"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info size={13} strokeWidth={2.2} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="fade-in absolute top-5 left-1/2 z-50 w-72 -translate-x-1/2 rounded-lg bg-ink px-3 py-2.5 text-[12px] leading-relaxed font-normal text-white shadow-xl"
        >
          {children}
        </span>
      )}
    </span>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{eyebrow}</div>
      <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
      {children && <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-2">{children}</p>}
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "churn" | "keep" | "warn" | "ok";
  icon?: ReactNode;
}) {
  const toneCls = {
    default: "text-ink",
    churn: "text-churn",
    keep: "text-keep",
    warn: "text-warn",
    ok: "text-ok",
  }[tone];
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center justify-between text-[12px] font-medium text-muted">
        <span>{label}</span>
        {icon && <span className="text-muted/70">{icon}</span>}
      </div>
      <div className={`num mt-1.5 text-[28px] leading-none font-semibold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-2 text-[12px] leading-snug text-muted">{sub}</div>}
    </Card>
  );
}

export function Finding({
  children,
  title = "Finding",
  tone = "default",
}: {
  children: ReactNode;
  title?: string;
  tone?: "default" | "churn" | "warn" | "ok";
}) {
  const cls = {
    default: "border-l-ink bg-white",
    churn: "border-l-churn bg-churn-soft/50",
    warn: "border-l-warn bg-warn-soft/60",
    ok: "border-l-ok bg-ok-soft/60",
  }[tone];
  return (
    <div className={`rounded-r-lg border border-l-[3px] border-line px-4 py-3 ${cls}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ink-2 uppercase">
        <Lightbulb size={12} strokeWidth={2.4} /> {title}
      </div>
      <div className="text-[13px] leading-relaxed text-ink">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "xs";
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer rounded-md font-medium transition-colors duration-150 ${
            size === "xs" ? "px-2 py-0.5 text-[11.5px]" : "px-2.5 py-1 text-[12px]"
          } ${o.value === value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[12px] text-muted">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="cursor-pointer rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-keep"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "churn" | "keep" | "warn" | "ok" }) {
  const cls = {
    default: "bg-slate-100 text-ink-2",
    churn: "bg-churn-soft text-[#b4232a]",
    keep: "bg-keep-soft text-keep",
    warn: "bg-warn-soft text-[#a85a04]",
    ok: "bg-ok-soft text-[#0b7a50]",
  }[tone];
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-[3px] w-3.5 rounded-full"
            style={i.dashed ? { backgroundImage: `linear-gradient(to right, ${i.color} 50%, transparent 50%)`, backgroundSize: "5px 3px" } : { background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function ChartTip({ title, rows }: { title?: ReactNode; rows: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-white/95 px-3 py-2 text-[12px] shadow-lg backdrop-blur">
      {title && <div className="mb-1 font-semibold text-ink">{title}</div>}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-muted">
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="num font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Bar({ value, max, color = "#0b1220", height = 6 }: { value: number; max: number; color?: string; height?: number }) {
  return (
    <div className="w-full rounded-full bg-line-2" style={{ height }}>
      <div className="rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, height, background: color }} />
    </div>
  );
}
