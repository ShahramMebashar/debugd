/** Merge a freshly-fetched seed into the already-live list (newest-first),
 *  without dropping live items that streamed in before the seed resolved.
 *  Live items win on duplicate keys; the result is capped to `max`. */
export function mergeSeed<T>(live: T[], seed: T[], keyOf: (t: T) => string | number, max: number): T[] {
  const have = new Set(live.map(keyOf));
  return [...live, ...seed.filter((s) => !have.has(keyOf(s)))].slice(0, max);
}
