export type SqlToken = { value: string; kind: "keyword" | "string" | "number" | "text" };

const KEYWORDS = new Set(
  (
    "select distinct from where and or not in is null like between exists " +
    "join inner left right outer full on as group by having order asc desc limit offset " +
    "insert into values update set delete union all count sum avg min max case when then else end"
  ).split(" "),
);

// Match, in priority order: single-quoted strings (incl. '' escapes), words,
// numbers, or any other run. Greedy/global so concatenating values is lossless.
const TOKEN = /('(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|[^A-Za-z_'\d]+)/g;

/** Splits SQL into typed tokens for highlighting. Pure and lossless — joining
 *  the token values reproduces the input exactly. */
export function tokenizeSql(sql: string): SqlToken[] {
  const out: SqlToken[] = [];
  for (const [value] of sql.matchAll(TOKEN)) {
    const kind = classify(value);
    const prev = out[out.length - 1];
    if (prev && prev.kind === kind) {
      prev.value += value; // coalesce adjacent same-kind runs (fewer spans)
    } else {
      out.push({ value, kind });
    }
  }
  return out;
}

function classify(value: string): SqlToken["kind"] {
  if (value[0] === "'") return "string";
  if (/^\d/.test(value)) return "number";
  if (/^[A-Za-z_]/.test(value) && KEYWORDS.has(value.toLowerCase())) return "keyword";
  return "text";
}
