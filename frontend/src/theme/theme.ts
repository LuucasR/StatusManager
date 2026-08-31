import { createTheme } from "@mui/material/styles";

export type ThemeMode = "light" | "dark";

/**
 * Design tokens per mode.
 *
 * These are the single source of truth for both MUI and index.css: the provider
 * writes each one onto :root as a CSS custom property, so the stylesheet never
 * hardcodes a neutral again. Semantic colours (the per-status hues) deliberately
 * stay out of here — they carry meaning and are shared by both modes.
 */
export const TOKENS: Record<ThemeMode, Record<string, string>> = {
  light: {
    "--bg": "#f5f6fa",
    "--surface": "#ffffff",
    "--surface-2": "#f7f8fc",
    "--border": "#e8e9f1",
    "--border-strong": "#dcdeeb",
    "--accent": "#5b5ce2",
    "--accent-soft": "#ecebff",
    "--text": "#17182f",
    "--muted": "#6d7087",
    "--faint": "#9296ab",
    "--shadow": "rgba(36, 38, 84, .08)",
    "--shadow-strong": "rgba(36, 38, 84, .18)",
    "--auth-glow": "#e8e7ff",
    "--auth-bg": "#f7f7fb",
  },
  dark: {
    "--bg": "#0e0f1a",
    "--surface": "#171930",
    "--surface-2": "#1e2039",
    "--border": "#262a45",
    "--border-strong": "#333861",
    "--accent": "#8b8cf0",
    "--accent-soft": "#242653",
    "--text": "#e6e7f2",
    "--muted": "#a2a5bd",
    "--faint": "#8589a3",
    "--shadow": "rgba(0, 0, 0, .45)",
    "--shadow-strong": "rgba(0, 0, 0, .65)",
    "--auth-glow": "#1d1f42",
    "--auth-bg": "#0b0c16",
  },
};

export function buildTheme(mode: ThemeMode) {
  const token = TOKENS[mode];
  return createTheme({
    palette: {
      mode,
      primary: { main: token["--accent"] },
      background: { default: token["--bg"], paper: token["--surface"] },
      text: { primary: token["--text"], secondary: token["--muted"] },
      divider: token["--border"],
    },
    typography: {
      fontFamily: '"Inter", "Segoe UI", sans-serif',
      h2: { fontWeight: 800, letterSpacing: "-0.045em" },
      h3: { fontWeight: 750, letterSpacing: "-0.035em" },
      h4: { fontWeight: 750, letterSpacing: "-0.025em" },
      button: { fontWeight: 700, textTransform: "none" },
    },
    shape: { borderRadius: 14 },
    components: {
      MuiButton: { styleOverrides: { root: { borderRadius: 10, paddingInline: 20 } } },
      MuiPaper: {
        styleOverrides: { root: { border: `1px solid ${token["--border"]}`, backgroundImage: "none" } },
      },
      MuiTextField: { defaultProps: { fullWidth: true } },
    },
  });
}

export default buildTheme("light");
