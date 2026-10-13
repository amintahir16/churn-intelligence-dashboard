import { useEffect, useState, type ComponentType } from "react";
import {
  Activity,
  BrainCircuit,
  Database,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Microscope,
  ScrollText,
  SlidersHorizontal,
  Users,
  Menu,
  X,
} from "lucide-react";
import { data } from "./lib/data";
import { pct, int } from "./lib/format";
import Overview from "./pages/Overview";
import Anatomy from "./pages/Anatomy";
import Drivers from "./pages/Drivers";
import Quality from "./pages/Quality";
import ModelPage from "./pages/Model";
import Explain from "./pages/Explain";
import Segments from "./pages/Segments";
import DecisionLab from "./pages/DecisionLab";
import AtRiskPage from "./pages/AtRisk";
import Simulator from "./pages/Simulator";
import Methodology from "./pages/Methodology";

export interface NavProps {
  go: (id: PageId, state?: unknown) => void;
  state?: unknown;
}

const PAGES = [
  { id: "overview", label: "Executive summary", icon: LayoutDashboard, group: "Story", C: Overview },
  { id: "anatomy", label: "Churn anatomy", icon: Microscope, group: "Story", C: Anatomy },
  { id: "drivers", label: "Driver explorer", icon: Activity, group: "Analysis", C: Drivers },
  { id: "quality", label: "Data quality", icon: Database, group: "Analysis", C: Quality },
  { id: "model", label: "Model performance", icon: Gauge, group: "Model", C: ModelPage },
  { id: "explain", label: "Explainability", icon: BrainCircuit, group: "Model", C: Explain },
  { id: "segments", label: "Segments", icon: Users, group: "Action", C: Segments },
  { id: "decision", label: "Decision lab", icon: FlaskConical, group: "Action", C: DecisionLab },
  { id: "atrisk", label: "At-risk customers", icon: ListChecks, group: "Action", C: AtRiskPage },
  { id: "simulator", label: "What-if simulator", icon: SlidersHorizontal, group: "Action", C: Simulator },
  { id: "method", label: "Methodology", icon: ScrollText, group: "Appendix", C: Methodology },
] as const satisfies readonly { id: string; label: string; icon: ComponentType<{ size?: number }>; group: string; C: ComponentType<NavProps> }[];

export type PageId = (typeof PAGES)[number]["id"];

const readHash = (): PageId => {
  const h = window.location.hash.replace("#/", "").replace("#", "");
  return (PAGES.find((p) => p.id === h)?.id ?? "overview") as PageId;
};

export default function App() {
  const [page, setPage] = useState<PageId>(readHash);
  const [navState, setNavState] = useState<unknown>(undefined);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setPage(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (id: PageId, state?: unknown) => {
    setNavState(state);
    setMobileOpen(false);
    if (id !== page) window.location.hash = `#/${id}`;
    setPage(id);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  };

  const current = PAGES.find((p) => p.id === page)!;
  const Page = current.C;
  const groups = [...new Set(PAGES.map((p) => p.group))];
  const m = data.meta;

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink">
          <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
            <path d="M6 21l6-6 5 5 9-10" stroke="#f97362" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <div className="text-[14px] leading-none font-semibold tracking-tight">Churn Intelligence</div>
          <div className="mt-1 text-[11px] leading-none text-muted">E-commerce · {int(m.rows)} customers</div>
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g} className="mb-4">
            <div className="px-2 pb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-muted/80 uppercase">{g}</div>
            {PAGES.filter((p) => p.group === g).map((p) => {
              const Icon = p.icon;
              const active = p.id === page;
              return (
                <button
                  key={p.id}
                  onClick={() => go(p.id)}
                  aria-current={active ? "page" : undefined}
                  className={`group mb-0.5 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-[7px] text-left text-[13px] font-medium transition-colors duration-150 ${
                    active ? "bg-ink text-white" : "text-ink-2 hover:bg-slate-100 hover:text-ink"
                  }`}
                >
                  <Icon size={15} />
                  {p.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mx-3 mb-4 rounded-lg border border-line bg-canvas p-3 text-[11.5px] leading-relaxed text-muted">
        <div className="flex items-center justify-between">
          <span>Base churn rate</span>
          <span className="num font-semibold text-churn">{pct(m.churn_rate)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Model ROC-AUC</span>
          <span className="num font-semibold text-ink">{m.test_auc.toFixed(3)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Features used</span>
          <span className="num font-semibold text-ink">{m.n_features}</span>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] border-r border-line bg-white lg:block">{nav}</aside>

      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <span className="text-[14px] font-semibold">Churn Intelligence</span>
        <button aria-label="Open navigation" className="cursor-pointer rounded-md p-1.5 hover:bg-slate-100" onClick={() => setMobileOpen(true)}>
          <Menu size={18} />
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMobileOpen(false)} />
          <aside className="fade-in absolute inset-y-0 left-0 w-[260px] bg-white shadow-xl">
            <button aria-label="Close navigation" className="absolute top-4 right-3 cursor-pointer rounded-md p-1 hover:bg-slate-100" onClick={() => setMobileOpen(false)}>
              <X size={16} />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <main className="lg:pl-[240px]">
        <div key={page} className="fade-in mx-auto max-w-[1280px] px-4 py-7 sm:px-8 lg:py-9">
          <Page go={go} state={navState} />
          <footer className="mt-14 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5 text-[11.5px] text-muted">
            <span>
              {int(m.rows)} customers · {m.columns} attributes · {m.folds}-fold CV · {int(m.test_rows)}-row hold-out · seed {m.seed}
            </span>
            <span>Pipeline: Python · LightGBM · TreeSHAP · rendered client-side with React</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
