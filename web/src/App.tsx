import { useMemo, useState } from "react";
import { Settings, Search, Clock, Database } from "lucide-react";
import { useSSE } from "@/lib/useSSE";
import { useMeta } from "@/lib/useMeta";
import { filterTraces, type TraceFilter } from "@/lib/filters";
import { statusColor } from "@/lib/ui";
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
    <div className="grid h-full grid-cols-[400px_1fr]">
      <aside className="flex min-h-0 flex-col border-r border-border">
        <header className="flex items-center justify-end px-4 py-2">
          <span className="tnum font-mono text-xs text-muted-foreground/60">
            {visible.length}/{traces.length}
          </span>
        </header>
        <FilterBar filter={filter} onChange={setFilter} />
        <ScrollArea className="min-h-0 flex-1">
          <ul>
            {visible.map((t) => (
              <RequestRow
                key={t.trace_id}
                t={t}
                active={t.trace_id === selected}
                onClick={() => setSelected(t.trace_id)}
              />
            ))}
            {visible.length === 0 && (
              <li className="px-4 py-10 text-center text-xs text-muted-foreground/60">
                {traces.length === 0 ? "Waiting for traces…" : "No matches."}
              </li>
            )}
          </ul>
        </ScrollArea>
      </aside>
      <main className="overflow-y-auto px-8 py-8">
        {selected ? (
          <TraceDetail id={selected} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground/60">
            Select a request to inspect.
          </div>
        )}
      </main>
    </div>
  );
}

function FilterBar({ filter, onChange }: { filter: TraceFilter; onChange: (f: TraceFilter) => void }) {
  return (
    <div className="flex items-center gap-2 border-y border-border px-3 py-2">
      <Input
        value={filter.path}
        onChange={(e) => onChange({ ...filter, path: e.target.value })}
        placeholder="filter path…"
        className="h-8 flex-1 font-mono text-xs"
      />
      <Select value={filter.status} onValueChange={(v) => onChange({ ...filter, status: v ?? "" })}>
        <SelectTrigger size="sm" className="w-[74px] font-mono text-xs">
          {STATUS_LABEL[filter.status] ?? "All"}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All</SelectItem>
          <SelectItem value="2">2xx</SelectItem>
          <SelectItem value="4">4xx</SelectItem>
          <SelectItem value="5">5xx</SelectItem>
        </SelectContent>
      </Select>
      <button
        onClick={() => onChange({ ...filter, nPlusOneOnly: !filter.nPlusOneOnly })}
        className={`h-8 rounded-md border px-2.5 font-mono text-xs transition-colors ${
          filter.nPlusOneOnly
            ? "border-rose-500/40 bg-rose-500/15 text-rose-400"
            : "border-border text-muted-foreground hover:bg-accent/40"
        }`}
      >
        N+1
      </button>
    </div>
  );
}

function RequestRow({ t, active, onClick }: { t: Summary; active: boolean; onClick: () => void }) {
  return (
    <li
      onClick={onClick}
      className={`cursor-pointer border-b border-border/40 border-l-2 py-3 px-4 transition-all duration-150 ${
        active
          ? "border-l-timing bg-timing-soft/20 dark:bg-timing-soft/10 text-foreground"
          : "border-l-transparent hover:bg-accent/20 text-foreground/90"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-11 shrink-0 font-mono text-[9px] font-bold text-center uppercase tracking-wider px-1 py-0.5 rounded-sm ${
          t.method === 'GET' ? 'bg-sky-500/10 text-sky-500 dark:text-sky-450' :
          t.method === 'POST' ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-450' :
          t.method === 'PUT' || t.method === 'PATCH' ? 'bg-amber-500/10 text-amber-500 dark:text-amber-450' :
          t.method === 'DELETE' ? 'bg-rose-500/10 text-rose-500 dark:text-rose-455' :
          'bg-muted text-muted-foreground'
        }`}>
          {t.method}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold tracking-tight leading-none">
          {t.path}
        </span>
        {t.n_plus_one > 0 && (
          <span className="shrink-0 rounded bg-rose-500/10 border border-rose-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-rose-500 dark:text-rose-400">
            N+1
          </span>
        )}
      </div>
      <div className="tnum mt-2 flex items-center gap-2 pl-[3.25rem] font-mono text-[10px] uppercase font-semibold text-muted-foreground/60 tracking-wider">
        <span className={statusColor(t.status)}>{t.status}</span>
        <span className="opacity-40">·</span>
        <span>{t.duration_ms.toFixed(1)}ms</span>
        <span className="opacity-40">·</span>
        <span>{t.query_count} {t.query_count === 1 ? 'query' : 'queries'}</span>
      </div>
    </li>
  );
}
