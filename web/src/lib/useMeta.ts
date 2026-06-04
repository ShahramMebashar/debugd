import { useCallback, useEffect, useState } from "react";
import type { Meta } from "../types";

// useMeta fetches the server's current config (/api/meta) and exposes a refresh
// + optimistic setter so the settings panel can update it after a change.
export function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(null);

  const refresh = useCallback(() => {
    return fetch("/api/meta")
      .then((r) => r.json())
      .then((m: Meta) => setMeta(m))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { meta, setMeta, refresh };
}
