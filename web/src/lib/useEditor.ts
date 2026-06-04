import { useCallback, useEffect, useState } from "react";
import { DEFAULT_EDITOR } from "./editor";

const KEY = "debugd-editor";

// useEditor stores the chosen editor URL template in localStorage (a per-machine
// preference, like theme) and keeps every instance in sync within the tab.
export function useEditor() {
  const [template, setTemplate] = useState(() => localStorage.getItem(KEY) ?? DEFAULT_EDITOR);

  useEffect(() => {
    const sync = () => setTemplate(localStorage.getItem(KEY) ?? DEFAULT_EDITOR);
    window.addEventListener("debugd-editor", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("debugd-editor", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((t: string) => {
    localStorage.setItem(KEY, t);
    window.dispatchEvent(new Event("debugd-editor"));
  }, []);

  return [template, set] as const;
}
