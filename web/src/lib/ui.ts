/** Method → accent color class (text). Verbs colored like a real HTTP console. */
export function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "text-sky-600 dark:text-sky-400";
    case "POST":
      return "text-emerald-600 dark:text-emerald-400";
    case "PUT":
    case "PATCH":
      return "text-amber-600 dark:text-amber-400";
    case "DELETE":
      return "text-rose-600 dark:text-rose-400";
    default:
      return "text-muted-foreground";
  }
}

/** Log level → text color class. Case-insensitive (file logs are UPPERCASE,
 *  request logs lowercase). */
export function levelColor(level: string): string {
  const l = level.toLowerCase();
  if (["error", "critical", "alert", "emergency"].includes(l)) return "text-rose-600 dark:text-rose-400";
  if (l === "warning") return "text-amber-600 dark:text-amber-400";
  if (l === "info" || l === "notice") return "text-sky-600 dark:text-sky-400";
  if (l === "debug") return "text-violet-600 dark:text-violet-400";
  return "text-muted-foreground/60";
}

/** Status → dot/text color class by class (2xx/3xx/4xx/5xx). */
export function statusColor(status: number): string {
  if (status >= 500) return "text-rose-600 dark:text-rose-400";
  if (status >= 400) return "text-amber-600 dark:text-amber-400";
  if (status >= 300) return "text-violet-600 dark:text-violet-400";
  return "text-emerald-600 dark:text-emerald-400";
}
