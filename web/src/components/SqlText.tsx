import { tokenizeSql } from "@/lib/sql";

const COLOR: Record<string, string> = {
  keyword: "text-sky-700 dark:text-sky-300 font-medium",
  string: "text-emerald-700 dark:text-emerald-300",
  number: "text-amber-700 dark:text-amber-300",
  text: "text-foreground/85",
};

/** Renders SQL with lightweight keyword/literal highlighting. `block` wraps for
 *  the expanded view; inline (default) stays on one line for the list row. */
export function SqlText({ sql, block = false }: { sql: string; block?: boolean }) {
  const tokens = tokenizeSql(sql);
  return (
    <code className={`font-mono ${block ? "whitespace-pre-wrap break-words leading-relaxed" : "whitespace-nowrap"}`}>
      {tokens.map((t, i) => (
        <span key={i} className={COLOR[t.kind]}>
          {t.value}
        </span>
      ))}
    </code>
  );
}
