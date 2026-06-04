/** Whether a log's context holds anything worth showing (an empty array — what
 *  request()->all() becomes with no input — or an empty object counts as none). */
export function hasContext(ctx: unknown): boolean {
  if (ctx === null || ctx === undefined || ctx === "") return false;
  if (Array.isArray(ctx)) return ctx.length > 0;
  if (typeof ctx === "object") return Object.keys(ctx as object).length > 0;
  return true;
}

export function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
