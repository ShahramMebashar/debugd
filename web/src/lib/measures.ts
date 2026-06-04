import type { Measure } from "../types";

export interface MeasureSegment {
  group: string; // "" for standalone benchmarks
  items: Measure[];
}

/** Groups a flat measures list into segments: standalone benches stay singletons,
 *  and consecutive spans sharing a (non-empty) group become one cluster — one
 *  concurrently() batch. */
export function segmentMeasures(measures: Measure[]): MeasureSegment[] {
  const segments: MeasureSegment[] = [];
  for (const m of measures) {
    const group = m.group || "";
    const last = segments[segments.length - 1];
    if (group && last && last.group === group) {
      last.items.push(m);
    } else {
      segments.push({ group, items: [m] });
    }
  }
  return segments;
}
