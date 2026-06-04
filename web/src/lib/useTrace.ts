import { useEffect, useState } from "react";
import type { Envelope } from "../types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; trace: Envelope }
  | { status: "error" };

/** Fetches the full trace on demand (GET /api/traces/{id}). The list/SSE only
 *  carry summaries, so detail is loaded lazily when a row is selected. */
export function useTrace(id: string | null): State {
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    if (!id) {
      setState({ status: "idle" });
      return;
    }
    let alive = true;
    setState({ status: "loading" });
    fetch(`/api/traces/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((trace: Envelope) => alive && setState({ status: "loaded", trace }))
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, [id]);

  return state;
}
