import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { TOKENS, buildTheme, type ThemeMode } from "./theme";

const STORAGE_KEY = "theme-mode";

type ThemeModeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function useThemeMode() {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error("useThemeMode must be used inside <ThemeModeProvider>");
  return context;
}

/**
 * Initial mode: an explicit stored choice wins; otherwise follow the operating
 * system. Somebody who has their machine in dark mode should not be handed a
 * white screen just because the app defaults to light.
 */
function initialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Blocked storage: fall through to the system preference.
  }
  try {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {
    // matchMedia missing (very old browser or a test env): default to light.
  }
  return "light";
}

export default function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembering the choice must not stop the user making it.
    }
  }, []);

  // Publishes the tokens to :root so index.css can style everything MUI does
  // not reach (the task board, the chat window, the auth shell).
  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(TOKENS[mode])) {
      root.style.setProperty(name, value);
    }
    // Lets the browser paint native widgets (scrollbars, date pickers, form
    // controls) to match. Without it a dark page keeps white scrollbars.
    root.style.colorScheme = mode;
  }, [mode]);

  const theme = useMemo(() => buildTheme(mode), [mode]);

  const value = useMemo(
    () => ({ mode, setMode, toggle: () => setMode(mode === "dark" ? "light" : "dark") }),
    [mode, setMode]
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
