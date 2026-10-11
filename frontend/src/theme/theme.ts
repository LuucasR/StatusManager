import { createTheme } from "@mui/material/styles";

export type ThemeMode = "light" | "dark";

export const PALETTE_IDS = ["indigo", "ocean", "forest", "sunset", "orchid", "graphite"] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];
export const DEFAULT_PALETTE: PaletteId = "indigo";

export const isPaletteId = (value: unknown): value is PaletteId =>
  typeof value === "string" && (PALETTE_IDS as readonly string[]).includes(value);

/**
 * What a palette is made of. Everything else - the grounds, borders, text and
 * shadows - is derived from these, so every palette gets the same contrast
 * steps and a new one is four values rather than thirty.
 *
 * `hue`/`tint` colour the neutrals very slightly towards the accent, which is
 * what keeps a green palette from looking like a grey page with green buttons.
 */
type PaletteSpec = {
  /** Accent on a light ground. Chosen to hold white button text at ~4.5:1. */
  light: string;
  /** Accent on a dark ground: lighter, so it reads against near-black. */
  dark: string;
  /** Second stop of the accent gradient (buttons, brand mark). */
  partner: string;
  /** Hue of the neutrals, and how strongly they lean into it (0-100). */
  hue: number;
  tint: number;
};

const PALETTES: Record<PaletteId, PaletteSpec> = {
  indigo: { light: "#5450e0", dark: "#8f8cf7", partner: "#8b5cf6", hue: 238, tint: 22 },
  ocean: { light: "#0b72b5", dark: "#4fb5ee", partner: "#0d9488", hue: 205, tint: 26 },
  forest: { light: "#1b7f53", dark: "#4cc890", partner: "#4d7c0f", hue: 152, tint: 16 },
  sunset: { light: "#c4461f", dark: "#ff8f61", partner: "#d97706", hue: 22, tint: 22 },
  orchid: { light: "#a8318f", dark: "#e486d6", partner: "#7c3aed", hue: 312, tint: 18 },
  graphite: { light: "#3b4252", dark: "#b6bfd0", partner: "#64748b", hue: 220, tint: 10 },
};

/** Swatches for the picker: the accent and the ground it sits on. */
export function paletteSwatch(id: PaletteId, mode: ThemeMode) {
  const tokens = TOKENS[id][mode];
  return { accent: tokens["--accent"], partner: tokens["--accent-2"], ground: tokens["--bg"] };
}

// --- Colour arithmetic. Hex out, so MUI can still manipulate every value.

function hsl(h: number, s: number, l: number) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

function rgb(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** `amount` of `a` over `b`, like color-mix(in srgb, a amount, b). */
function mix(a: string, b: string, amount: number) {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const channel = (x: number, y: number) =>
    Math.round(x * amount + y * (1 - amount)).toString(16).padStart(2, "0");
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

function rgba(hex: string, alpha: number) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Design tokens for one palette in one mode.
 *
 * The single source of truth for both MUI and index.css: the provider writes
 * each one onto :root as a CSS custom property. `--accent-base` is the same
 * colour as `--accent` under a name nothing overrides locally - the task board
 * sets its own --accent per column, and anything that wants the palette's
 * accent inside one of those reads --accent-base.
 */
function tokensFor(spec: PaletteSpec, mode: ThemeMode): Record<string, string> {
  const { hue, tint } = spec;
  const semantic = {
    "--success": mode === "light" ? "#1f9d63" : "#46c98b",
    "--warning": mode === "light" ? "#b7791f" : "#f0b54a",
    "--danger": mode === "light" ? "#c0394b" : "#f07384",
  };

  if (mode === "light") {
    const accent = spec.light;
    const surface = "#ffffff";
    return {
      "--bg": hsl(hue, tint, 97.4),
      "--surface": surface,
      "--surface-2": hsl(hue, tint, 98.6),
      "--border": hsl(hue, tint, 91.5),
      "--border-strong": hsl(hue, tint, 85),
      "--accent": accent,
      "--accent-base": accent,
      "--accent-2": spec.partner,
      "--accent-soft": mix(accent, surface, 0.11),
      "--text": hsl(hue, Math.min(tint + 18, 40), 13),
      "--muted": hsl(hue, Math.min(tint, 14), 42),
      // Kept at or under L 44% so it holds 4.5:1 on white for empty states.
      "--faint": hsl(hue, Math.min(tint, 12), 44),
      "--shadow": rgba(hsl(hue, 40, 20), 0.07),
      "--shadow-strong": rgba(hsl(hue, 40, 20), 0.16),
      "--auth-glow": mix(accent, surface, 0.16),
      "--auth-bg": hsl(hue, tint, 98),
      "--grid-line": rgba(hsl(hue, 30, 20), 0.035),
      ...semantic,
    };
  }

  const accent = spec.dark;
  const surface = hsl(hue, Math.min(tint, 20), 11);
  return {
    "--bg": hsl(hue, Math.min(tint, 22), 7),
    "--surface": surface,
    "--surface-2": hsl(hue, Math.min(tint, 18), 14),
    "--border": hsl(hue, Math.min(tint, 16), 19),
    "--border-strong": hsl(hue, Math.min(tint, 16), 26),
    "--accent": accent,
    "--accent-base": accent,
    "--accent-2": spec.partner,
    "--accent-soft": mix(accent, surface, 0.2),
    "--text": hsl(hue, Math.min(tint, 20), 92),
    "--muted": hsl(hue, Math.min(tint, 12), 70),
    "--faint": hsl(hue, Math.min(tint, 10), 60),
    "--shadow": "rgba(0, 0, 0, 0.45)",
    "--shadow-strong": "rgba(0, 0, 0, 0.65)",
    "--auth-glow": mix(accent, surface, 0.14),
    "--auth-bg": hsl(hue, Math.min(tint, 22), 5),
    "--grid-line": rgba(accent, 0.05),
    ...semantic,
  };
}

export const TOKENS = Object.fromEntries(
  PALETTE_IDS.map((id) => [
    id,
    { light: tokensFor(PALETTES[id], "light"), dark: tokensFor(PALETTES[id], "dark") },
  ])
) as Record<PaletteId, Record<ThemeMode, Record<string, string>>>;

export function buildTheme(mode: ThemeMode, palette: PaletteId = DEFAULT_PALETTE) {
  const token = TOKENS[palette][mode];
  const accent = token["--accent"];
  const gradient = `linear-gradient(135deg, ${accent} 0%, ${mix(token["--accent-2"], accent, 0.45)} 100%)`;
  const softShadow = `0 1px 2px ${token["--shadow"]}, 0 8px 24px -12px ${token["--shadow-strong"]}`;

  return createTheme({
    palette: {
      mode,
      primary: { main: accent },
      success: { main: token["--success"] },
      warning: { main: token["--warning"] },
      error: { main: token["--danger"] },
      background: { default: token["--bg"], paper: token["--surface"] },
      text: { primary: token["--text"], secondary: token["--muted"] },
      divider: token["--border"],
    },
    typography: {
      fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
      h2: { fontWeight: 800, letterSpacing: "-0.045em" },
      h3: { fontWeight: 750, letterSpacing: "-0.035em" },
      h4: { fontWeight: 750, letterSpacing: "-0.025em" },
      h6: { letterSpacing: "-0.01em" },
      button: { fontWeight: 650, textTransform: "none", letterSpacing: 0 },
    },
    shape: { borderRadius: 14 },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 12,
            paddingInline: 18,
            transition: "all .18s ease",
            variants: [
              {
                // The primary call to action carries the palette's gradient.
                props: { variant: "contained", color: "primary" },
                style: {
                  backgroundImage: gradient,
                  boxShadow: `0 6px 18px -8px ${rgba(accent, 0.7)}`,
                  "&:hover": {
                    backgroundImage: gradient,
                    filter: "brightness(1.06)",
                    boxShadow: `0 10px 24px -10px ${rgba(accent, 0.8)}`,
                  },
                },
              },
              {
                props: { variant: "outlined", color: "primary" },
                style: { borderColor: token["--border-strong"] },
              },
            ],
          },
        },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiPaper: {
        styleOverrides: {
          root: { border: `1px solid ${token["--border"]}`, backgroundImage: "none" },
          elevation: { boxShadow: softShadow },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 20,
            boxShadow: `0 24px 64px -16px ${token["--shadow-strong"]}`,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { borderRadius: 14, boxShadow: `0 16px 40px -12px ${token["--shadow-strong"]}` },
        },
      },
      MuiPopover: { styleOverrides: { paper: { borderRadius: 14 } } },
      MuiChip: { styleOverrides: { root: { borderRadius: 9, fontWeight: 600 } } },
      MuiTooltip: { styleOverrides: { tooltip: { borderRadius: 8, fontWeight: 500 } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: token["--surface"],
            "& .MuiOutlinedInput-notchedOutline": { borderColor: token["--border-strong"] },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: token["--border"] },
          head: {
            color: token["--muted"],
            fontWeight: 700,
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: rgba(token["--surface"], 0.78),
            backdropFilter: "saturate(1.6) blur(14px)",
            borderBottom: `1px solid ${token["--border"]}`,
          },
        },
      },
      MuiSwitch: {
        styleOverrides: { track: { borderRadius: 999 } },
      },
      MuiTextField: { defaultProps: { fullWidth: true } },
    },
  });
}

export default buildTheme("light");
