import { useState } from "react";
import { useTrace } from "@/lib/useTrace";
import { bar } from "@/lib/waterfall";
import { formatSql } from "@/lib/sqlFormat";
import { methodColor, statusColor } from "@/lib/ui";
import { SqlText } from "@/components/SqlText";
import { Lightbulb } from "lucide-react";
import type { Envelope, LogEntry, NPlusOne, Query } from "@/types";

const ms = (n: number) => `${n.toFixed(1)}ms`;

export function TraceDetail({ id }: { id: string }) {
  const state = useTrace(id);

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
    <div className="mx-auto max-w-5xl space-y-8">
      <StatBar trace={trace} dbMs={dbMs} />

      {trace.exception && <ExceptionPanel e={trace.exception} />}

      {trace.n_plus_one && trace.n_plus_one.length > 0 && (
        <NPlusOnePanel groups={trace.n_plus_one} />
      )}

      <Section title="Queries" count={trace.queries.length} accent={`${ms(dbMs)} total`}>
        <QueryList queries={trace.queries} total={total} npIndices={npIndices} />
      </Section>

      {trace.logs.length > 0 && (
        <Section title="Logs" count={trace.logs.length}>
          <LogList logs={trace.logs} />
        </Section>
      )}
    </div>
  );
}

function StatBar({ trace, dbMs }: { trace: Envelope; dbMs: number }) {
  const r = trace.request;
  const np = trace.n_plus_one?.length ?? 0;
  return (
    <header className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={`font-mono text-sm font-semibold ${methodColor(r.method)}`}>{r.method}</span>
        <span className="font-mono text-sm">{r.path}</span>
        <span className={`tnum font-mono text-sm ${statusColor(r.status)}`}>{r.status}</span>
        {r.route && <span className="font-mono text-xs text-muted-foreground">{r.route}</span>}
      </div>
      <div className="grid grid-cols-3 divide-x divide-y divide-border rounded-lg border border-border bg-card lg:grid-cols-6 lg:divide-y-0">
        <Stat label="Duration" value={ms(r.duration_ms)} />
        <Stat label="Boot" value={ms(r.boot_ms)} sub={r.duration_ms ? `${pct(r.boot_ms, r.duration_ms)}%` : undefined} />
        <Stat label="DB time" value={ms(dbMs)} sub={`${pct(dbMs, r.duration_ms)}%`} />
        <Stat label="Memory" value={`${r.memory_mb.toFixed(1)}`} sub="MB" />
        <Stat label="Queries" value={String(trace.queries.length)} />
        <Stat label="N+1 groups" value={String(np)} danger={np > 0} />
      </div>
    </header>
  );
}

function Stat({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`tnum mt-1 font-mono text-lg ${danger ? "text-rose-400" : "text-foreground"}`}>
        {value}
        {sub && <span className="ml-1 text-xs text-muted-foreground">{sub}</span>}
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
    <div className={`border-b border-border/60 last:border-0 ${isNPlus ? "border-l-2 border-l-rose-500/70" : ""}`}>
      <button
        onClick={onToggle}
        className="flex w-full flex-col gap-1.5 px-3 py-2 text-left transition-colors hover:bg-accent/40"
      >
        <div className="flex items-baseline gap-3">
          <span className="text-muted-foreground/50 transition-transform" style={{ transform: open ? "rotate(90deg)" : "" }}>
            ›
          </span>
          {isNPlus && (
            <span className="rounded bg-rose-500/15 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-rose-400">
              N+1
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-xs">
            <SqlText sql={q.sql} />
          </span>
          <span className={`tnum shrink-0 font-mono text-xs ${isSlow ? "text-amber-400" : "text-muted-foreground"}`}>
            {ms(q.duration_ms)}
          </span>
        </div>
        <div className="flex items-center gap-3 pl-6">
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-timing-soft">
            <div className="absolute h-1 rounded-full bg-timing" style={{ left: `${left}%`, width: `${width}%` }} />
          </div>
          <span className="shrink-0 truncate font-mono text-[11px] text-muted-foreground/70" style={{ maxWidth: "45%" }}>
            {q.caller}
          </span>
        </div>
      </button>

      {open && (
        <div className="space-y-3 bg-popover/60 px-3 pb-3 pl-9">
          <div className="rounded-md border border-border bg-background/60 p-3 text-xs">
            <SqlText sql={formatSql(q.sql)} block />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[11px] sm:grid-cols-4">
            <Meta k="connection" v={q.connection} />
            <Meta k="bindings" v={String(q.bindings_count)} />
            <Meta k="offset" v={ms(q.offset_ms)} />
            <Meta k="duration" v={ms(q.duration_ms)} />
            <div className="col-span-2 sm:col-span-4">
              <Meta k="caller" v={q.caller} />
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

function LogList({ logs }: { logs: LogEntry[] }) {
  const sorted = [...logs].sort((a, b) => a.offset_ms - b.offset_ms);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card font-mono text-xs">
      {sorted.map((l, i) => (
        <div key={i} className="flex gap-3 border-b border-border/60 px-3 py-1.5 last:border-0">
          <span className="tnum w-14 shrink-0 text-right text-muted-foreground/60">{ms(l.offset_ms)}</span>
          <span className={`w-16 shrink-0 uppercase ${levelColor(l.level)}`}>{l.level}</span>
          <span className="min-w-0 flex-1 break-words text-foreground/85">{l.message}</span>
        </div>
      ))}
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
      <div className="space-y-2">
        {groups.map((g, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-rose-500/30 bg-rose-500/[0.06]">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="tnum rounded bg-rose-500/20 px-1.5 font-semibold text-rose-600 dark:text-rose-300">
                {g.count}×
              </span>
              {g.suggestion.table && (
                <span className="font-mono font-medium">{g.suggestion.table}</span>
              )}
              <span className="rounded bg-muted px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {KIND_LABEL[g.suggestion.kind] ?? "N+1"}
              </span>
              <span className="tnum ml-auto font-mono text-muted-foreground">{ms(g.total_ms)} wasted</span>
              <span className="w-full font-mono text-[11px] text-muted-foreground/70">{g.caller}</span>
            </div>
            <div className="flex items-start gap-2 border-t border-rose-500/20 bg-background/40 px-3 py-2">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              <FixText fix={g.suggestion.fix} />
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
    <p className="text-xs leading-relaxed text-foreground/90">
      {parts.map((p, i) =>
        p.startsWith("->with(") ? (
          <code key={i} className="rounded bg-emerald-500/15 px-1 font-mono text-emerald-700 dark:text-emerald-300">
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
    <div className="overflow-hidden rounded-lg border border-rose-500/30 bg-rose-500/[0.06]">
      <div className="border-b border-rose-500/20 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-rose-400">
        Exception
      </div>
      <div className="space-y-1 p-4">
        <div className="font-mono text-sm text-rose-300">{e.class}</div>
        <div className="text-sm text-foreground/90">{e.message}</div>
        <div className="font-mono text-xs text-muted-foreground">{e.file}</div>
        {e.trace && (
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
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

function levelColor(level: string): string {
  if (["error", "critical", "alert", "emergency"].includes(level)) return "text-rose-600 dark:text-rose-400";
  if (level === "warning") return "text-amber-600 dark:text-amber-400";
  if (level === "info" || level === "notice") return "text-sky-600 dark:text-sky-400";
  return "text-muted-foreground/60";
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
