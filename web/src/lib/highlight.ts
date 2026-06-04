export interface Segment {
  text: string;
  match: boolean;
}

/** Splits text into segments, marking case-insensitive occurrences of query.
 *  Lossless (segments rejoin to the input) and treats query literally (no regex
 *  injection). Returns a single plain segment when query is empty. */
export function splitHighlight(text: string, query: string): Segment[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, match: false }];

  const hay = text.toLowerCase();
  const out: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const at = hay.indexOf(q, i);
    if (at === -1) {
      out.push({ text: text.slice(i), match: false });
      break;
    }
    if (at > i) out.push({ text: text.slice(i, at), match: false });
    out.push({ text: text.slice(at, at + q.length), match: true });
    i = at + q.length;
  }
  return out;
}
