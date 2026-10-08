import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  systemTheme,
  themeFromDocument,
} from "../app/theme";
import type { ThemeName } from "../styles/theme-tokens";

interface ThemeContextValue {
  theme: ThemeName;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<ThemeName>(themeFromDocument);
  const [hasStoredTheme, setHasStoredTheme] = useState(() => readStoredTheme() !== null);

  useEffect(() => {
    if (hasStoredTheme) return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => {
      const nextTheme = systemTheme();
      setTheme(nextTheme);
      applyTheme(nextTheme);
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [hasStoredTheme]);

  const toggle = useCallback(() => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    storeTheme(nextTheme);
    applyTheme(nextTheme);
    setHasStoredTheme(true);
    setTheme(nextTheme);
  }, [theme]);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
};
