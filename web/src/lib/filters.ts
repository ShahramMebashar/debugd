import type { Summary } from "../types";

export interface TraceFilter {
  path: string; // case-insensitive substring of the request path
  status: string; // status class as first digit ("2"/"4"/"5"), or "" for all
  nPlusOneOnly: boolean;
}

/** Pure AND-combination of the active predicates — kept out of components so it
 *  is trivially unit-testable and re-runs cheaply on every keystroke. */
export function filterTraces(traces: Summary[], f: TraceFilter): Summary[] {
  const path = f.path.trim().toLowerCase();
  return traces.filter((t) => {
    if (path && !t.path.toLowerCase().includes(path)) return false;
    if (f.status && !String(t.status).startsWith(f.status)) return false;
    if (f.nPlusOneOnly && t.n_plus_one === 0) return false;
    return true;
  });
}
