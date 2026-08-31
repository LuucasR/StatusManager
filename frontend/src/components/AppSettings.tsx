import {
  CheckRounded,
  DarkModeRounded,
  LightModeRounded,
  TranslateRounded,
} from "@mui/icons-material";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import { useState } from "react";
import { LANGUAGES, LANGUAGE_NAMES, t } from "../i18n";
import { useI18n } from "../i18n/I18nProvider";
import { useThemeMode } from "../theme/ThemeModeProvider";

/**
 * Language picker and light/dark switch.
 *
 * Rendered in the app bar for authenticated pages and floated over the auth
 * shell for the login/register screens, so somebody who cannot read the default
 * language can change it before signing in rather than after.
 */
export default function AppSettings({ floating = false }: { floating?: boolean }) {
  const { language, setLanguage } = useI18n();
  const { mode, toggle } = useThemeMode();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  const nextModeLabel =
    mode === "dark" ? t("settings.theme.light") : t("settings.theme.dark");

  return (
    <Box
      sx={
        floating
          ? { position: "fixed", top: 16, right: 16, zIndex: 10, display: "flex", gap: 0.5 }
          : { display: "flex", gap: 0.5 }
      }
    >
      <Tooltip title={t("settings.language")}>
        <IconButton
          color="inherit"
          onClick={(event) => setAnchor(event.currentTarget)}
          aria-label={t("settings.language")}
          aria-haspopup="menu"
        >
          <TranslateRounded />
        </IconButton>
      </Tooltip>

      {/* Sun when it is dark (click to go light), moon when it is light. The icon
          shows the destination, which is what people reach for. */}
      <Tooltip title={nextModeLabel}>
        <IconButton color="inherit" onClick={toggle} aria-label={nextModeLabel}>
          {mode === "dark" ? <LightModeRounded /> : <DarkModeRounded />}
        </IconButton>
      </Tooltip>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {LANGUAGES.map((value) => (
          <MenuItem
            key={value}
            selected={value === language}
            onClick={() => {
              setLanguage(value);
              setAnchor(null);
            }}
          >
            <ListItemIcon>
              {value === language ? <CheckRounded fontSize="small" /> : null}
            </ListItemIcon>
            <ListItemText>{LANGUAGE_NAMES[value]}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
