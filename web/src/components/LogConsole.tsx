import { useMemo, useState } from "react";
import { useLogs } from "@/lib/useLogs";
import { filterLogs, type LogFilter } from "@/lib/logFilters";
import { splitHighlight } from "@/lib/highlight";
import { levelColor } from "@/lib/ui";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { LogLine } from "@/types";

const LEVELS = ["", "error", "warning", "info", "debug"];
const LEVEL_LABEL: Record<string, string> = {
  "": "All levels", error: "Error", warning: "Warning", info: "Info", debug: "Debug",
};

export function LogConsole() {
  const lines = useLogs();
  const [filter, setFilter] = useState<LogFilter>({ text: "", level: "", channel: "", source: "" });

  const channels = useMemo(
    () => Array.from(new Set(lines.map((l) => l.channel))).sort(),
    [lines],
  );
  const sources = useMemo(
    () => Array.from(new Set(lines.map((l) => l.source))).sort(),
    [lines],
  );
  const visible = useMemo(() => filterLogs(lines, filter), [lines, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Input
          value={filter.text}
          onChange={(e) => setFilter({ ...filter, text: e.target.value })}
          placeholder="search logs…"
          className="h-8 min-w-48 flex-1 font-mono text-xs"
        />
        <Select value={filter.level} onValueChange={(v) => setFilter({ ...filter, level: v ?? "" })}>
          <SelectTrigger size="sm" className="w-[110px] text-xs">
            {LEVEL_LABEL[filter.level] ?? "All levels"}
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {LEVEL_LABEL[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sources.length > 1 && (
          <Select value={filter.source} onValueChange={(v) => setFilter({ ...filter, source: v ?? "" })}>
            <SelectTrigger size="sm" className="w-[150px] font-mono text-xs">
              {filter.source || "All files"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All files</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {channels.length > 1 && (
          <Select value={filter.channel} onValueChange={(v) => setFilter({ ...filter, channel: v ?? "" })}>
            <SelectTrigger size="sm" className="w-[120px] font-mono text-xs">
              {filter.channel || "All channels"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All channels</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="tnum ml-auto font-mono text-xs text-muted-foreground/60">
          {visible.length}/{lines.length}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div>
          {visible.map((l) => (
            <LogRow key={l.id} l={l} query={filter.text} />
          ))}
          {visible.length === 0 && (
            <p className="px-4 py-16 text-center text-xs text-muted-foreground/60">
              {lines.length === 0
                ? "No logs yet — write to storage/logs, or start debugd with --logs <path>."
                : "No matches."}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function LogRow({ l, query }: { l: LogLine; query: string }) {
  const [open, setOpen] = useState(false);
  const hasDetail = l.detail.trim().length > 0;
  const rowClass = "flex w-full items-baseline gap-3 px-4 py-2 text-left font-mono text-xs border-b border-border/30 hover:bg-accent/15 transition-colors";
  const inner = (
    <>
      <span className="tnum w-36 shrink-0 text-muted-foreground/50">{l.time}</span>
      <span className={`w-24 shrink-0 font-semibold uppercase tracking-wider text-[10px] ${levelColor(l.level)}`}>
        {l.channel}.{l.level || "—"}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground/90 font-medium tracking-tight">
        <Highlight text={l.message} query={query} />
      </span>
      {hasDetail && (
        <span className={`shrink-0 text-muted-foreground/45 transition-transform duration-100 ${open ? "rotate-90 text-timing" : ""}`}>
          ›
        </span>
      )}
    </>
  );
  return (
    <div className="last:border-b-0">
      {hasDetail ? (
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={rowClass}>
          {inner}
        </button>
      ) : (
        <div className={rowClass}>{inner}</div>
      )}
      {open && hasDetail && (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-muted/20 border-b border-border/20 px-4 py-3 pl-[10.75rem] font-mono text-[11px] leading-relaxed text-muted-foreground">
          <Highlight text={l.detail} query={query} />
        </pre>
      )}
    </div>
  );
}

// Wraps case-insensitive matches of query in a subtle <mark>. Content is plain
// text rendered by React (escaped) — no dangerouslySetInnerHTML, no XSS.
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  return (
    <>
      {splitHighlight(text, query).map((seg, i) =>
        seg.match ? (
          <mark key={i} className="rounded-[2px] bg-timing/25 text-foreground">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}
