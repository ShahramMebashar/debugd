import { useState } from "react";
import { useTrace } from "@/lib/useTrace";
import { useEditor } from "@/lib/useEditor";
import { bar } from "@/lib/waterfall";
import { formatSql } from "@/lib/sqlFormat";
import { levelColor, statusColor } from "@/lib/ui";
import { SqlText } from "@/components/SqlText";
import { CodeLink, CodeLinkProvider } from "@/components/CodeLink";
import { Lightbulb } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { segmentMeasures } from "@/lib/measures";
import { hasContext, prettyJson } from "@/lib/logs";
import type { Dump, Envelope, LogEntry, Measure, NPlusOne, Octane, Query } from "@/types";

const ms = (n: number) => `${n.toFixed(1)}ms`;

export function TraceDetail({ id }: { id: string }) {
  const state = useTrace(id);
  const [editor] = useEditor();

  if (state.status === "loading") return <Centered>Loading…</Centered>;
  if (state.status === "error") return <Centered>Trace not found — it may have been evicted.</Centered>;

  if (state.status !== "loaded") return null;

  const { trace } = state;
  const total = trace.request.duration_ms || 1;
  const dbMs = trace.queries.reduce((s, q) => s + q.duration_ms, 0);
  // Exact group membership from the server (by normalized_sql + caller), not a
  // caller-only approximation — otherwise unrelated queries sharing a call site
  // get falsely badged.
  const npIndices = new Set((trace.n_plus_one ?? []).flatMap((g) => g.indices));

  return (
    <CodeLinkProvider root={trace.project_root ?? ""} template={editor}>
      <div className="mx-auto max-w-5xl space-y-8">
        <StatBar trace={trace} dbMs={dbMs} />

        {trace.exception && <ExceptionPanel e={trace.exception} />}

        {trace.n_plus_one && trace.n_plus_one.length > 0 && (
          <NPlusOnePanel groups={trace.n_plus_one} />
        )}

        <DetailTabs trace={trace} total={total} npIndices={npIndices} />
      </div>
    </CodeLinkProvider>
  );
}

function DetailTabs({ trace, total, npIndices }: {
  trace: Envelope; total: number; npIndices: Set<number>;
}) {
  const tabs: { key: string; label: string; count?: number; node: React.ReactNode }[] = [
    {
      key: "queries", label: "Queries", count: trace.queries.length,
      node: <QueryList queries={trace.queries} total={total} npIndices={npIndices} />,
    },
  ];
  if (trace.measures?.length) {
    tabs.push({ key: "benchmarks", label: "Benchmarks", count: trace.measures.length, node: <MeasureList measures={trace.measures} /> });
  }
  if (trace.dumps?.length) {
    tabs.push({ key: "dumps", label: "Dumps", count: trace.dumps.length, node: <DumpList dumps={trace.dumps} /> });
  }
  if (trace.logs.length) {
    tabs.push({ key: "logs", label: "Logs", count: trace.logs.length, node: <LogList logs={trace.logs} /> });
  }
  if (trace.octane) {
    tabs.push({ key: "octane", label: "Octane", node: <OctanePanel o={trace.octane} memoryMb={trace.request.memory_mb} /> });
  }

  return (
    <Tabs defaultValue="queries">
      <TabsList className="h-9">
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key} className="text-xs">
            {t.label}
            {t.count !== undefined && (
              <span className="tnum ml-1.5 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                {t.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.key} value={t.key} className="mt-4">
          {t.node}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function OctanePanel({ o, memoryMb }: { o: Octane; memoryMb: number }) {
  const warm = o.running && o.worker_requests >= 5;
  const memLeak = warm && o.memory_growth_mb > 5;
  const lateBindings = o.new_bindings?.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Runtime" value={o.running ? "Octane" : "php-fpm"} />
        <StatCard label="Worker PID" value={String(o.worker_pid)} />
        <StatCard label="Requests" value={String(o.worker_requests)} />
        <StatCard
          label="Mem growth"
          value={`${o.memory_growth_mb >= 0 ? "+" : ""}${o.memory_growth_mb.toFixed(1)}`}
          sub="MB"
          danger={memLeak}
        />
        <StatCard label="Bindings" value={String(o.bindings)} danger={warm && lateBindings} />
      </div>
      <p className="font-mono text-[11px] text-muted-foreground/70">
        worker started at {o.worker_memory_start_mb.toFixed(1)} MB · now {memoryMb.toFixed(1)} MB
      </p>

      {memLeak && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-foreground/90">
              Memory grew <strong>{o.memory_growth_mb.toFixed(1)} MB</strong> over {o.worker_requests} requests on this
              worker — a likely <strong>memory leak</strong>. Look for state accumulating between requests.
            </p>
          </div>
          {lateBindings && <BindingSuspects keys={o.new_bindings} />}
        </div>
      )}

      {!memLeak && warm && lateBindings && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
          <p className="text-xs leading-relaxed text-foreground/90">
            This request registered container bindings <em>after</em> the worker warmed up. Under Octane these persist
            across requests — fine if intentional, a leak if it happens every request.
          </p>
          <BindingSuspects keys={o.new_bindings} />
        </div>
      )}

      {!o.running && (
        <p className="text-xs text-muted-foreground/60">
          Not running under Octane — per-worker metrics are trivial (one request per process).
        </p>
      )}
    </div>
  );
}

function BindingSuspects({ keys }: { keys: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {keys.map((k) => (
        <code key={k} className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
          {k}
        </code>
      ))}
    </div>
  );
}

function StatBar({ trace, dbMs }: { trace: Envelope; dbMs: number }) {
  const r = trace.request;
  const np = trace.n_plus_one?.length ?? 0;
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={`font-mono text-xs font-bold text-center uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
          r.method === 'GET' ? 'bg-sky-500/10 text-sky-500 dark:text-sky-400' :
          r.method === 'POST' ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400' :
          r.method === 'PUT' || r.method === 'PATCH' ? 'bg-amber-500/10 text-amber-500 dark:text-amber-400' :
          r.method === 'DELETE' ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400' :
          'bg-muted text-muted-foreground'
        }`}>{r.method}</span>
        <span className="font-mono text-sm font-semibold tracking-tight text-foreground/90">{r.path}</span>
        <span className={`tnum font-mono text-xs font-semibold px-2 py-0.5 rounded-full border border-current/15 ${statusColor(r.status)}`}>{r.status}</span>
        {r.route && <span className="font-mono text-xs text-muted-foreground/75 bg-muted/40 border border-border/50 px-2 py-0.5 rounded-md">{r.route}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Duration" value={ms(r.duration_ms)} />
        <StatCard label="Boot" value={ms(r.boot_ms)} sub={r.duration_ms ? `${pct(r.boot_ms, r.duration_ms)}%` : undefined} />
        <StatCard label="DB time" value={ms(dbMs)} sub={`${pct(dbMs, r.duration_ms)}%`} />
        <StatCard label="Memory" value={`${r.memory_mb.toFixed(1)}`} sub="MB" />
        <StatCard label="Queries" value={String(trace.queries.length)} />
        <StatCard label="N+1 groups" value={String(np)} danger={np > 0} />
      </div>
    </header>
  );
}

function StatCard({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card/45 hover:bg-card/75 px-4 py-3 transition-colors duration-150">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="tnum mt-1 flex items-baseline gap-1 font-mono text-lg font-medium leading-none">
        <span className={danger ? "text-rose-500 dark:text-rose-455 font-bold" : "text-foreground"}>{value}</span>
        {sub && <span className="text-xs text-muted-foreground/80">{sub}</span>}
      </div>
    </div>
  );
}

function QueryList({ queries, total, npIndices }: { queries: Query[]; total: number; npIndices: Set<number> }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  if (queries.length === 0) return <Empty>No queries.</Empty>;

  const slowest = Math.max(...queries.map((q) => q.duration_ms));
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {queries.map((q, i) => (
        <QueryRow
          key={i}
          q={q}
          total={total}
          isSlow={q.duration_ms === slowest && queries.length > 1}
          isNPlus={npIndices.has(i)}
          open={open.has(i)}
          onToggle={() => toggle(i)}
        />
      ))}
    </div>
  );
}

function QueryRow({
  q, total, isSlow, isNPlus, open, onToggle,
}: {
  q: Query; total: number; isSlow: boolean; isNPlus: boolean; open: boolean; onToggle: () => void;
}) {
  const { left, width } = bar(q.offset_ms, q.duration_ms, total);
  return (
    <div className={`border-b border-border/40 last:border-0 hover:bg-muted/10 transition-colors ${isNPlus ? "border-l-2 border-l-rose-500/70 bg-rose-500/[0.01]" : ""}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-col gap-1.5 px-4 py-2.5 text-left transition-colors"
      >
        <div className="flex items-baseline gap-3">
          <span className={`text-muted-foreground/45 transition-transform duration-100 ${open ? "rotate-90 text-timing" : ""}`}>
            ›
          </span>
          {isNPlus && (
            <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-rose-500 dark:text-rose-400">
              N+1
            </span>
          )}
          <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold tracking-tight">
            <SqlText sql={q.sql} />
          </span>
          <span className={`tnum shrink-0 font-mono text-xs font-semibold ${isSlow ? "text-amber-500 dark:text-amber-400" : "text-muted-foreground"}`}>
            {ms(q.duration_ms)}
          </span>
        </div>
        <div className="flex items-center gap-4 pl-5">
          <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-timing-soft">
            <div className="absolute h-full rounded-full bg-timing transition-all duration-300" style={{ left: `${left}%`, width: `${width}%` }} />
          </div>
          <CodeLink caller={q.caller} className="max-w-[45%] shrink-0 font-mono text-[10px]" />
        </div>
      </div>

      {open && (
        <div className="space-y-3 bg-popover/40 border-t border-border/20 px-4 py-3.5 pl-9 transition-all">
          <div className="rounded-lg border border-border bg-background/50 p-3 text-xs leading-relaxed overflow-x-auto shadow-inner">
            <SqlText sql={formatSql(q.sql)} block />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11px] sm:grid-cols-4">
            <Meta k="connection" v={q.connection} />
            <Meta k="bindings" v={String(q.bindings_count)} />
            <Meta k="offset" v={ms(q.offset_ms)} />
            <Meta k="duration" v={ms(q.duration_ms)} />
            <div className="col-span-2 sm:col-span-4 border-t border-border/20 pt-1.5 mt-1">
              <div className="flex gap-2">
                <span className="text-muted-foreground/60">caller</span>
                <CodeLink caller={q.caller} className="max-w-full" />
              </div>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

function MeasureList({ measures }: { measures: Measure[] }) {
  return (
    <div className="space-y-2">
      {segmentMeasures(measures).map((seg, i) =>
        seg.group ? <ConcurrentCluster key={i} items={seg.items} /> : <BenchRow key={i} m={seg.items[0]} />,
      )}
    </div>
  );
}

function BenchRow({ m }: { m: Measure }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <span className="tnum w-16 shrink-0 text-right font-mono font-medium text-violet-600 dark:text-violet-300">
        {m.duration_ms.toFixed(2)}ms
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{m.label}</span>
      <span className="tnum shrink-0 font-mono text-[11px] text-muted-foreground/60">@{ms(m.offset_ms)}</span>
      <CodeLink caller={m.caller} className="hidden max-w-[30%] font-mono text-[11px] sm:inline-flex" />
    </div>
  );
}

function ConcurrentCluster({ items }: { items: Measure[] }) {
  const parallel = items.some((m) => m.concurrent);
  const max = Math.max(...items.map((m) => m.duration_ms), 0.001);
  // Parallel: wall time = slowest task; sequential: sum of tasks.
  const wall = parallel ? max : items.reduce((s, m) => s + m.duration_ms, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-violet-500/30 bg-violet-500/[0.05]">
      <div className="flex items-center gap-2 border-b border-violet-500/20 px-3 py-1.5 text-[11px]">
        <span className="font-medium text-violet-600 dark:text-violet-300">concurrently</span>
        <span className="rounded bg-muted px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {parallel ? "parallel" : "ran sequentially"}
        </span>
        <span className="text-muted-foreground/60">{items.length} tasks</span>
        <span className="tnum ml-auto font-mono text-muted-foreground">{wall.toFixed(2)}ms wall</span>
      </div>
      <div className="space-y-1 p-2">
        {items.map((m, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 truncate font-medium">{m.label}</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-violet-500/10">
              <div
                className="absolute h-2 rounded-full bg-violet-500/70"
                style={{ left: 0, width: `${Math.max((m.duration_ms / max) * 100, 2)}%` }}
              />
            </div>
            <span className="tnum w-16 shrink-0 text-right font-mono text-muted-foreground">{m.duration_ms.toFixed(2)}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DumpList({ dumps }: { dumps: Dump[] }) {
  return (
    <div className="space-y-2">
      {dumps.map((d, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-[11px]">
            {d.label && <span className="font-medium">{d.label}</span>}
            <span className="rounded bg-muted px-1.5 font-mono text-muted-foreground">{d.type}</span>
            <span className="tnum ml-auto font-mono text-muted-foreground/60">@{ms(d.offset_ms)}</span>
            <CodeLink caller={d.caller} className="hidden max-w-[35%] font-mono text-[11px] sm:inline-flex" />
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs text-foreground/85">
            {d.value}
          </pre>
        </div>
      ))}
    </div>
  );
}

function LogList({ logs }: { logs: LogEntry[] }) {
  const sorted = [...logs].sort((a, b) => a.offset_ms - b.offset_ms);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card text-xs">
      {sorted.map((l, i) => (
        <LogRow key={i} l={l} />
      ))}
    </div>
  );
}

function LogRow({ l }: { l: LogEntry }) {
  const [open, setOpen] = useState(false);
  const hasCtx = hasContext(l.context);
  const rowClass = "flex w-full items-baseline gap-3 px-3 py-1.5 text-left font-mono";
  const inner = (
    <>
      <span className="tnum w-14 shrink-0 text-right text-muted-foreground/60">{ms(l.offset_ms)}</span>
      <span className={`w-16 shrink-0 uppercase ${levelColor(l.level)}`}>{l.level}</span>
      <span className="min-w-0 flex-1 break-words text-foreground/85">{l.message}</span>
      {hasCtx && (
        <span className="shrink-0 text-muted-foreground/40 transition-transform" style={{ transform: open ? "rotate(90deg)" : "" }}>
          ›
        </span>
      )}
    </>
  );
  return (
    <div className="border-b border-border/60 last:border-0">
      {hasCtx ? (
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${rowClass} hover:bg-accent/40`}>
          {inner}
        </button>
      ) : (
        <div className={rowClass}>{inner}</div>
      )}
      {open && hasCtx && (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words bg-background/50 px-3 py-2 pl-[4.75rem] font-mono text-[11px] text-foreground/80">
          {prettyJson(l.context)}
        </pre>
      )}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  belongs_to: "belongsTo",
  has_many: "hasMany",
  morph: "polymorphic",
  unknown: "N+1",
};

function NPlusOnePanel({ groups }: { groups: NPlusOne[] }) {
  return (
    <Section title={`N+1 detected (${groups.length})`} tone="danger">
      <div className="space-y-3">
        {groups.map((g, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/5 shadow-xs">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs">
              <span className="tnum rounded bg-destructive/10 px-2 py-0.5 font-mono text-xs font-semibold text-rose-500 dark:text-rose-455">
                {g.count}×
              </span>
              {g.suggestion.table && (
                <span className="font-mono font-bold text-foreground">{g.suggestion.table}</span>
              )}
              <span className="rounded-md border border-border bg-card/60 px-2 py-0.5 font-mono text-[9px] font-bold text-muted-foreground uppercase">
                {KIND_LABEL[g.suggestion.kind] ?? "N+1"}
              </span>
              <span className="tnum ml-auto font-mono text-xs font-semibold text-rose-500 dark:text-rose-455">{ms(g.total_ms)} wasted</span>
              <div className="w-full font-mono text-[11px] text-muted-foreground/75 mt-1 border-t border-border/10 pt-1">
                caller: <CodeLink caller={g.caller} />
              </div>
            </div>
            <div className="flex items-start gap-2.5 border-t border-destructive/10 bg-background/50 px-4 py-3">
              <svg className="mt-0.5 size-4 shrink-0 text-amber-500/95" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .1 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                <path d="M9 18h6" />
                <path d="M10 22h4" />
              </svg>
              <div className="flex-1">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-0.5">Recommended Fix</div>
                <FixText fix={g.suggestion.fix} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// Render the fix sentence, emphasizing any ->with('…') call inline.
function FixText({ fix }: { fix: string }) {
  const parts = fix.split(/(->with\([^)]*\))/g);
  return (
    <p className="text-xs leading-relaxed text-foreground/90 font-medium">
      {parts.map((p, i) =>
        p.startsWith("->with(") ? (
          <code key={i} className="rounded bg-emerald-500/10 border border-emerald-500/10 px-1.5 py-0.5 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
            {p}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

function ExceptionPanel({ e }: { e: NonNullable<Envelope["exception"]> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/5 shadow-xs">
      <div className="border-b border-destructive/15 bg-destructive/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-rose-500 dark:text-rose-400">
        Fatal Exception Detected
      </div>
      <div className="space-y-2 p-4">
        <div className="font-mono text-sm font-semibold text-rose-500 dark:text-rose-455 leading-snug">{e.class}</div>
        <div className="text-sm font-medium text-foreground/90">{e.message}</div>
        <div className="font-mono text-[11px] text-muted-foreground/80 border-t border-border/10 pt-1.5 mt-2">
          File: <CodeLink caller={e.file} />
        </div>
        {e.trace && (
          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-background/50 border border-border p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {e.trace}
          </pre>
        )}
      </div>
    </div>
  );
}

function Section({ title, count, accent, tone, children }: {
  title: string; count?: number; accent?: string; tone?: "danger"; children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className={`text-[11px] font-semibold uppercase tracking-widest ${tone === "danger" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>{title}</h2>
        {count !== undefined && <span className="tnum font-mono text-xs text-muted-foreground/60">{count}</span>}
        {accent && <span className="tnum ml-auto font-mono text-xs text-muted-foreground/60">{accent}</span>}
      </div>
      {children}
    </section>
  );
}

const Meta = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-2">
    <span className="text-muted-foreground/60">{k}</span>
    <span className="truncate text-foreground/85">{v}</span>
  </div>
);

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{children}</div>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-lg border border-border bg-card px-3 py-4 text-center text-xs text-muted-foreground">{children}</p>
);

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
