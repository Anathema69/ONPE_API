import { Moon, Sun } from "lucide-react";
import clsx from "clsx";

type Theme = "light" | "dark";

interface Props {
  theme: Theme;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: Props) {
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? "Cambiar a vista clara" : "Cambiar a vista oscura"}
      className={clsx(
        "fixed top-4 right-4 z-50",
        "w-11 h-11 flex items-center justify-center",
        "border transition-colors font-mono text-xs",
        isDark
          ? "border-[var(--color-terminal-rule)] bg-[var(--color-terminal-bg)] text-[var(--color-terminal-fg)] hover:border-[var(--color-terminal-fg)]"
          : "border-[var(--color-rule)] bg-[var(--color-paper)] text-[var(--color-ink)] hover:border-[var(--color-ink)]"
      )}
    >
      {isDark ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
    </button>
  );
}
