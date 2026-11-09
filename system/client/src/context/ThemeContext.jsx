import React, { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";

const STORAGE_KEY = "petstore-theme";

const ThemeContext = createContext(null);

function getPreferredTheme() {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => getPreferredTheme());

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
    const meta = document.getElementById("theme-color-meta");
    if (meta) {
      meta.setAttribute("content", theme === "light" ? "#f1f5f9" : "#0f172a");
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      isDark: theme === "dark",
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme داخل ThemeProvider");
  return ctx;
}
