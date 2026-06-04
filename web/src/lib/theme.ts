import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

const KEY = "debugd-theme";
const ORDER: ThemeMode[] = ["system", "light", "dark"];

/** Pure cycle: system → light → dark → system. */
export function nextMode(mode: ThemeMode): ThemeMode {
  return ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
}

export function getStoredMode(): ThemeMode {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Apply a mode: toggle the `dark` class on <html> and persist the choice. */
export function applyMode(mode: ThemeMode): void {
  const dark = mode === "dark" || (mode === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem(KEY, mode);
}

/** Theme state hook. Re-applies on change, and follows the OS while on `system`. */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(getStoredMode);

  useEffect(() => {
    applyMode(mode);
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyMode("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  return [mode, setMode] as const;
}
