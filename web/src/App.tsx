import { useMemo, useState } from "react";
import { useSSE } from "@/lib/useSSE";
import { filterTraces, type TraceFilter } from "@/lib/filters";
import { methodColor, statusColor } from "@/lib/ui";
import { TraceDetail } from "@/components/TraceDetail";
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

export default function App() {
  const traces = useSSE();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<TraceFilter>({ path: "", status: "", nPlusOneOnly: false });

  const visible = useMemo(() => filterTraces(traces, filter), [traces, filter]);

  return (
    <div className="grid h-screen grid-cols-[400px_1fr] bg-background text-sm">
      <aside className="flex min-h-0 flex-col border-r border-border">
        <header className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-timing shadow-[0_0_8px_var(--color-timing)]" />
            <span className="font-mono text-sm font-semibold tracking-tight">debugd</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="tnum font-mono text-xs text-muted-foreground/60">
              {visible.length}/{traces.length}
            </span>
            <ThemeToggle />
          </div>
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
      className={`cursor-pointer border-b border-border/60 border-l-2 px-4 py-2.5 transition-colors ${
        active ? "border-l-timing bg-accent/60" : "border-l-transparent hover:bg-accent/30"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-11 shrink-0 font-mono text-[11px] font-semibold ${methodColor(t.method)}`}>
          {t.method}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90">{t.path}</span>
        {t.n_plus_one > 0 && (
          <span className="shrink-0 rounded bg-rose-500/15 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-rose-400">
            N+1
          </span>
        )}
      </div>
      <div className="tnum mt-1 flex items-center gap-2 pl-[3.25rem] font-mono text-[11px] text-muted-foreground/70">
        <span className={statusColor(t.status)}>{t.status}</span>
        <span>·</span>
        <span>{t.duration_ms.toFixed(1)}ms</span>
        <span>·</span>
        <span>{t.query_count} queries</span>
      </div>
    </li>
  );
}
