import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_PALETTE,
  TOKENS,
  buildTheme,
  isPaletteId,
  type PaletteId,
  type ThemeMode,
} from "./theme";
import { StatusBar, Style } from "@capacitor/status-bar";
import { isNative } from "../native/platform";

const STORAGE_KEY = "theme-mode";
const PALETTE_KEY = "theme-palette";

type ThemeModeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  /** The colour palette, chosen per device like the mode. */
  palette: PaletteId;
  setPalette: (palette: PaletteId) => void;
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

function initialPalette(): PaletteId {
  try {
    const stored = localStorage.getItem(PALETTE_KEY);
    if (isPaletteId(stored)) return stored;
  } catch {
    // Blocked storage: the default palette.
  }
  return DEFAULT_PALETTE;
}

export default function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [palette, setPaletteState] = useState<PaletteId>(initialPalette);

  const setPalette = useCallback((next: PaletteId) => {
    setPaletteState(next);
    try {
      localStorage.setItem(PALETTE_KEY, next);
    } catch {
      // Same as the mode: not remembering it must not block choosing it.
    }
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembering the choice must not stop the user making it.
    }
  }, []);

  // Publishes the tokens to :root so index.css can style everything MUI does
  // not reach (the task board, the chat window, the auth shell). A layout
  // effect, so a stored palette is on :root before the first paint instead of
  // flashing the default one.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const tokens = TOKENS[palette][mode];
    for (const [name, value] of Object.entries(tokens)) {
      root.style.setProperty(name, value);
    }
    // Lets the browser paint native widgets (scrollbars, date pickers, form
    // controls) to match. Without it a dark page keeps white scrollbars.
    root.style.colorScheme = mode;

    // Same idea one layer out, for the app: the Android status bar is not part
    // of the page, so it keeps its own colours and dark mode would otherwise
    // put black icons on a near-black bar. Style.Dark means "dark background,
    // light icons", which is the opposite of how it reads.
    if (isNative()) {
      void StatusBar.setStyle({ style: mode === "dark" ? Style.Dark : Style.Light });
      void StatusBar.setBackgroundColor({ color: tokens["--surface"] });
    }
  }, [mode, palette]);

  const theme = useMemo(() => buildTheme(mode, palette), [mode, palette]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      toggle: () => setMode(mode === "dark" ? "light" : "dark"),
      palette,
      setPalette,
    }),
    [mode, setMode, palette, setPalette]
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
