import { useEffect, useRef, useState } from "react";
import type { Summary } from "../types";

// useSSE is the single live-data primitive: subscribes to GET /events and
// prepends each incoming trace summary, capped to `max`. Plain React state —
// no store library at this scale (plan §2.4).
export function useSSE(max = 500) {
  const [traces, setTraces] = useState<Summary[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    // Seed with existing traces, then stream new ones.
    fetch("/api/traces")
      .then((r) => r.json())
      .then((initial: Summary[]) => {
        initial?.forEach((t) => seen.current.add(t.trace_id));
        setTraces(initial ?? []);
      })
      .catch(() => {});

    const es = new EventSource("/events");
    es.addEventListener("trace", (ev) => {
      const s = JSON.parse((ev as MessageEvent).data) as Summary;
      if (seen.current.has(s.trace_id)) return;
      seen.current.add(s.trace_id);
      setTraces((prev) => [s, ...prev].slice(0, max));
    });
    return () => es.close();
  }, [max]);

  return traces;
}
