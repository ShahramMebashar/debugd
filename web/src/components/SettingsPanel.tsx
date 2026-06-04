import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { Meta } from "@/types";

export function SettingsPanel({ meta, onChanged }: { meta: Meta | null; onChanged: (m: Meta) => void }) {
  const [path, setPath] = useState(meta?.logs_path ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the field in sync if the server-side path changes underneath us.
  useEffect(() => setPath(meta?.logs_path ?? ""), [meta?.logs_path]);

  const save = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs_path: value }),
      });
      if (!res.ok) {
        setError((await res.text()).trim() || `request failed (${res.status})`);
        return;
      }
      onChanged((await res.json()) as Meta);
    } catch {
      setError("could not reach the debugd server");
    } finally {
      setBusy(false);
    }
  };

  const dirty = (meta?.logs_path ?? "") !== path;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-8 py-8">
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Log reader</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Point debugd at your app's <code className="font-mono">storage/logs</code> directory. It tails every{" "}
          <code className="font-mono">*.log</code> live — saved and applied immediately, no restart.
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && dirty && save(path)}
            placeholder="/path/to/your-app/storage/logs"
            className="h-9 flex-1 font-mono text-xs"
            spellCheck={false}
          />
          <button
            onClick={() => save(path)}
            disabled={busy || !dirty}
            className="h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {meta?.logs_path && (
            <button
              onClick={() => {
                setPath("");
                save("");
              }}
              disabled={busy}
              className="h-9 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              Clear
            </button>
          )}
        </div>
        {error && <p className="font-mono text-xs text-rose-500">{error}</p>}
        <p className="text-[11px] text-muted-foreground/70">
          A <code className="font-mono">--logs</code> flag or launching debugd from a project root (which auto-detects{" "}
          <code className="font-mono">./storage/logs</code>) overrides this saved path — so the right app always wins.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Server</h2>
        <dl className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4 sm:divide-y-0">
          <Stat label="Version" value={meta?.version ?? "…"} />
          <Stat label="Listen" value={meta?.addr ?? "…"} />
          <Stat label="Trace buffer" value={meta ? String(meta.buffer) : "…"} />
          <Stat label="N+1 threshold" value={meta ? String(meta.n_plus_one) : "…"} />
        </dl>
        <p className="text-[11px] text-muted-foreground/70">
          These are set at launch via flags/env (<code className="font-mono">--addr</code>,{" "}
          <code className="font-mono">--buffer</code>, <code className="font-mono">--n-plus-one</code>).
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="tnum mt-1 truncate font-mono text-sm text-foreground">{value}</div>
    </div>
  );
}
