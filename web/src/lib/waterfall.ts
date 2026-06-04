const MIN_WIDTH = 0.5; // percent — keep sub-millisecond queries visible

/** Geometry for one waterfall bar, as percentages of the request duration.
 *  Guarantees a minimum width and never overflows the track. */
export function bar(offsetMs: number, durationMs: number, totalMs: number): {
  left: number;
  width: number;
} {
  const total = totalMs > 0 ? totalMs : 1; // avoid divide-by-zero on empty traces
  const left = clamp((offsetMs / total) * 100, 0, 100);
  const width = clamp(Math.max((durationMs / total) * 100, MIN_WIDTH), 0, 100 - left);
  return { left, width };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}
