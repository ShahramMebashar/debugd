import { Monitor, Moon, Sun } from "lucide-react";
import { nextMode, useTheme, type ThemeMode } from "@/lib/theme";

const ICON: Record<ThemeMode, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/** Cycles System → Light → Dark; icon reflects the current mode. */
export function ThemeToggle() {
  const [mode, setMode] = useTheme();
  const Icon = ICON[mode];
  return (
    <button
      onClick={() => setMode(nextMode(mode))}
      title={`Theme: ${mode} (click to change)`}
      aria-label={`Theme: ${mode}`}
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  );
}
