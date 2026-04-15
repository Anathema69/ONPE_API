import { useEffect, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { ThemeToggle } from "./components/ThemeToggle";
import { loadData, type AppData } from "./lib/history";
import "../styles/fonts.css";
import "../styles/theme.css";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("onpe-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData()
      .then(setData)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    localStorage.setItem("onpe-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 font-mono text-sm bg-[var(--color-paper)] text-[var(--color-ink)]">
        Error cargando datos: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 font-mono text-sm bg-[var(--color-paper)] text-[var(--color-ink)]">
        Cargando…
      </div>
    );
  }

  return (
    <>
      <ThemeToggle theme={theme} onToggle={toggle} />
      <Dashboard theme={theme} data={data} />
    </>
  );
}
