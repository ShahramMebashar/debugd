import { useMemo, useState } from "react";
import { Settings, Search, Clock, Database } from "lucide-react";
import { useSSE } from "@/lib/useSSE";
import { useMeta } from "@/lib/useMeta";
import { filterTraces, type TraceFilter } from "@/lib/filters";
import { TraceDetail } from "@/components/TraceDetail";
import { LogConsole } from "@/components/LogConsole";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { Summary } from "@/types";

const STATUS_LABEL: Record<string, string> = { "": "All", "2": "2xx", "4": "4xx", "5": "5xx" };

type View = "requests" | "logs" | "settings";

export default function App() {
  const [view, setView] = useState<View>("requests");
  const { meta, setMeta } = useMeta();
  const logsEnabled = !!meta?.logs;
  // If logs get disabled while viewing them, fall back to requests.
  const effectiveView: View = view === "logs" && !logsEnabled ? "requests" : view;

  return (
    <div className="flex h-screen flex-col bg-background text-sm antialiased selection:bg-timing/20">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-card/10 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg className="size-4.5 text-timing" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" className="opacity-20" />
              <circle cx="12" cy="12" r="6" className="opacity-45" />
              <circle cx="12" cy="12" r="2.2" fill="currentColor" />
            </svg>
            <span className="font-mono text-[15px] font-bold tracking-tight text-foreground select-none">
              debug<span className="text-timing">d</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 select-none">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500"></span>
            </span>
            <span className="font-mono tracking-wider uppercase text-[9px] opacity-90">Listening</span>
          </div>
        </div>

        <nav className="flex items-center p-0.5 rounded-lg border border-border bg-muted/30">
          <button
            onClick={() => setView("requests")}
            aria-current={view === "requests" ? "page" : undefined}
            className={`rounded-md px-3.5 py-1 text-xs font-semibold tracking-tight transition-all duration-150 ${
              view === "requests"
                ? "bg-card text-foreground shadow-xs border border-border/10"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/20 border border-transparent"
            }`}
          >
            Requests
          </button>
          {logsEnabled && (
            <button
              onClick={() => setView("logs")}
              aria-current={view === "logs" ? "page" : undefined}
              className={`rounded-md px-3.5 py-1 text-xs font-semibold tracking-tight transition-all duration-150 ${
                view === "logs"
                  ? "bg-card text-foreground shadow-xs border border-border/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/20 border border-transparent"
              }`}
            >
              Logs
            </button>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setView(view === "settings" ? "requests" : "settings")}
            aria-label="Settings"
            aria-current={view === "settings" ? "page" : undefined}
            className={`grid size-7 place-items-center rounded-md transition-colors ${
              view === "settings" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <Settings className="size-4" />
          </button>
          <ThemeToggle />
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {effectiveView === "settings" ? (
          <SettingsPanel meta={meta} onChanged={setMeta} />
        ) : effectiveView === "logs" ? (
          <LogConsole />
        ) : (
          <RequestsView />
        )}
      </div>
    </div>
  );
}

function RequestsView() {
  const traces = useSSE();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<TraceFilter>({ path: "", status: "", nPlusOneOnly: false });

  const visible = useMemo(() => filterTraces(traces, filter), [traces, filter]);

  return (
    <div className="grid h-full grid-cols-[380px_1fr]">
      <aside className="flex min-h-0 flex-col border-r border-border bg-card/15">
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-border/30 bg-card/25 px-4 animate-fade-in">
          <div className="flex items-center gap-1.5 select-none">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-timing opacity-60"></span>
              <span className="relative inline-flex size-1.5 rounded-full bg-timing"></span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/90">Traces Stream</span>
          </div>
          <span className="tnum font-mono text-[10px] font-bold bg-accent/40 text-muted-foreground/80 px-2 py-0.5 rounded-full border border-border/40 select-none">
            {visible.length} / {traces.length}
          </span>
        </header>
        <FilterBar filter={filter} onChange={setFilter} />
        <ScrollArea className="min-h-0 flex-1">
          <ul className="divide-y divide-border/25">
            {visible.map((t) => (
              <RequestRow
                key={t.trace_id}
                t={t}
                active={t.trace_id === selected}
                onClick={() => setSelected(t.trace_id)}
              />
            ))}
            {visible.length === 0 && (
              <li className="px-4 py-16 text-center select-none">
                <p className="text-xs font-semibold text-muted-foreground/72">
                  {traces.length === 0 ? "Waiting for Laravel traces…" : "No traces matched."}
                </p>
                <p className="text-[11px] text-muted-foreground/45 mt-1 font-mono">
                  {traces.length === 0 ? "Trigger a PHP request to begin." : "Try adjusting your filters."}
                </p>
              </li>
            )}
          </ul>
        </ScrollArea>
      </aside>
      <main className="overflow-y-auto px-8 py-8">
        {selected ? (
          <TraceDetail id={selected} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center select-none gap-2">
            <div className="size-10 rounded-xl border border-dashed border-border/60 bg-card/20 grid place-items-center mb-1 text-muted-foreground/50">
              <Search className="size-4" />
            </div>
            <div className="text-xs font-semibold text-foreground/80">Telemetry Inspector</div>
            <div className="text-[11px] text-muted-foreground/60 max-w-64 font-medium leading-relaxed">
              Select any request trace from the left stream pane to view the interactive timeline, database queries, benchmarks, and debug dumps.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function FilterBar({ filter, onChange }: { filter: TraceFilter; onChange: (f: TraceFilter) => void }) {
  return (
    <div className="flex flex-col gap-2 p-3 border-b border-border/30 bg-card/5">
      <div className="flex items-center gap-2 relative">
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none">
          <Search className="size-3.5" />
        </div>
        <Input
          value={filter.path}
          onChange={(e) => onChange({ ...filter, path: e.target.value })}
          placeholder="Filter request path…"
          className="h-8 pl-8 flex-1 font-mono text-xs bg-background/50 focus-visible:bg-background border-border/35 rounded-lg placeholder:text-muted-foreground/42 focus-visible:ring-1 focus-visible:ring-timing transition-all"
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Select value={filter.status} onValueChange={(v) => onChange({ ...filter, status: v ?? "" })}>
            <SelectTrigger size="sm" className="w-full h-8 font-mono text-xs bg-background/50 border-border/35 rounded-lg text-left pl-2.5 hover:bg-background/80 transition-colors">
              <span className="text-muted-foreground/60 mr-1 text-[10px] uppercase tracking-wider font-bold">Status:</span>
              <span className="font-bold text-foreground">{STATUS_LABEL[filter.status] ?? "All"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="2">2xx Success</SelectItem>
              <SelectItem value="4">4xx Client Error</SelectItem>
              <SelectItem value="5">5xx Server Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <button
          onClick={() => onChange({ ...filter, nPlusOneOnly: !filter.nPlusOneOnly })}
          className={`h-8 rounded-lg border px-3 font-mono text-xs font-bold tracking-tight transition-all flex items-center gap-1.5 cursor-pointer select-none ${
            filter.nPlusOneOnly
              ? "border-rose-500/30 bg-rose-500/10 text-rose-550 dark:text-rose-400 hover:bg-rose-500/15"
              : "border-border/35 bg-background/50 text-muted-foreground/80 hover:bg-accent/40 hover:text-foreground"
          }`}
        >
          <span className={`size-1.5 rounded-full ${filter.nPlusOneOnly ? "bg-rose-500 animate-pulse" : "bg-muted-foreground/40"}`} />
          N+1
        </button>
      </div>
    </div>
  );
}

function RequestRow({ t, active, onClick }: { t: Summary; active: boolean; onClick: () => void }) {
  const isError = t.status >= 500;
  const isWarn = t.status >= 400 && t.status < 500;

  return (
    <li
      onClick={onClick}
      className={`cursor-pointer px-4 py-3 transition-all duration-150 group relative select-none ${
        active
          ? "bg-timing-soft/12 dark:bg-timing-soft/6"
          : "hover:bg-muted/12"
      }`}
    >
      <div 
        className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r transition-all duration-200 ${
          active 
            ? "bg-timing h-auto" 
            : "bg-transparent h-0 group-hover:bg-muted-foreground/30 group-hover:h-3"
        }`} 
      />

      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 font-mono text-[9px] font-bold text-center px-1.5 py-0.5 rounded-sm ${
            t.method === 'GET' ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400' :
            t.method === 'POST' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
            t.method === 'PUT' || t.method === 'PATCH' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-450' :
            t.method === 'DELETE' ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400' :
            'bg-muted text-muted-foreground'
          }`}>
            {t.method}
          </span>
          <span className={`truncate font-mono text-xs tracking-tight ${active ? "text-foreground font-bold" : "text-foreground/85 font-semibold"}`}>
            {t.path}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {t.n_plus_one > 0 && (
            <span className="rounded bg-rose-500/10 border border-rose-500/10 px-1 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-rose-500 dark:text-rose-455">
              N+1
            </span>
          )}
        </div>
      </div>

      <div className="tnum mt-2 flex items-center justify-between pl-0 font-mono text-[10px] uppercase font-bold text-muted-foreground/50 tracking-wider">
        <div className="flex items-center gap-1">
          <span className={`inline-flex items-center justify-center font-bold px-1 rounded-sm ${
            isError ? "bg-rose-500/10 text-rose-500 dark:text-rose-400" :
            isWarn ? "bg-amber-500/10 text-amber-500 dark:text-amber-400" :
            "bg-emerald-500/5 text-emerald-500 dark:text-emerald-400"
          }`}>
            {t.status}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1">
            <Clock className="size-3 text-muted-foreground/35" />
            <span className="text-muted-foreground/75 font-semibold">{t.duration_ms.toFixed(1)}ms</span>
          </span>
          <span className="opacity-35">·</span>
          <span className="flex items-center gap-1">
            <Database className="size-3 text-muted-foreground/35" />
            <span className="text-muted-foreground/75 font-semibold">{t.query_count} Q</span>
          </span>
        </div>
      </div>
    </li>
  );
}
