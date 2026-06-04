import type { LogLine } from "../types";

export interface LogFilter {
  text: string; // substring of message/detail/channel, case-insensitive
  level: string; // exact level, case-insensitive; "" = all
  channel: string; // exact channel; "" = all
  source: string; // exact file (e.g. messaging.log); "" = all
}

/** Pure AND-combination of the active predicates — kept out of the component so
 *  it is unit-testable and re-runs cheaply on every keystroke. */
export function filterLogs(lines: LogLine[], f: LogFilter): LogLine[] {
  const text = f.text.trim().toLowerCase();
  const level = f.level.toLowerCase();
  return lines.filter((l) => {
    if (level && l.level.toLowerCase() !== level) return false;
    if (f.channel && l.channel !== f.channel) return false;
    if (f.source && l.source !== f.source) return false;
    if (text) {
      const hay = `${l.message}\n${l.detail}\n${l.channel}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}
