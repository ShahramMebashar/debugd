import { useEffect, useRef, useState } from "react";
import { mergeSeed } from "./stream";
import type { LogLine } from "../types";

// useLogs mirrors useSSE for the log stream: seed from GET /api/logs, then
// subscribe to GET /events/logs (event "log"), prepend newest-first, dedup by
// id, capped to `max`.
export function useLogs(max = 2000) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const seen = useRef(new Set<number>());

  useEffect(() => {
    let alive = true;

    fetch("/api/logs")
      .then((r) => r.json())
      .then((initial: LogLine[]) => {
        if (!alive) return;
        const seed = initial ?? [];
        seed.forEach((l) => seen.current.add(l.id));
        // Merge, don't overwrite — events may have streamed in during the fetch.
        setLines((prev) => mergeSeed(prev, seed, (l) => l.id, max));
      })
      .catch(() => {});

    const es = new EventSource("/events/logs");
    es.addEventListener("log", (ev) => {
      const l = JSON.parse((ev as MessageEvent).data) as LogLine;
      if (seen.current.has(l.id)) return;
      seen.current.add(l.id);
      setLines((prev) => [l, ...prev].slice(0, max));
    });
    return () => {
      alive = false;
      es.close();
    };
  }, [max]);

  return lines;
}
