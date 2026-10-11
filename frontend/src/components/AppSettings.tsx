import {
  CheckRounded,
  DarkModeRounded,
  DnsRounded,
  LightModeRounded,
  PaletteRounded,
  TranslateRounded,
  VolumeOffRounded,
  VolumeUpRounded,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { LANGUAGES, LANGUAGE_NAMES, t, tf } from "../i18n";
import { useI18n } from "../i18n/I18nProvider";
import { useThemeMode } from "../theme/ThemeModeProvider";
import { PALETTE_IDS, paletteSwatch } from "../theme/theme";
import ServerAddressForm from "./ServerAddressForm";
import { getApiUrl, isRuntimeConfigurable, switchServer } from "../serverConfig";
import { isSoundOn, playChime, requestNotificationPermission, setSoundOn } from "../alerts/attention";

/**
 * Language picker and light/dark switch.
 *
 * Rendered in the app bar for authenticated pages and floated over the auth
 * shell for the login/register screens, so somebody who cannot read the default
 * language can change it before signing in rather than after.
 */
export default function AppSettings({ floating = false }: { floating?: boolean }) {
  const { language, setLanguage } = useI18n();
  const { mode, toggle, palette, setPalette } = useThemeMode();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [paletteAnchor, setPaletteAnchor] = useState<null | HTMLElement>(null);
  const [serverOpen, setServerOpen] = useState(false);
  const [sound, setSound] = useState(isSoundOn);

  function toggleSound() {
    const next = !sound;
    setSoundOn(next);
    setSound(next);
    // A click is the gesture browsers want before asking; turning it on also
    // plays a sample so the person hears what they just enabled.
    if (next) {
      void requestNotificationPermission();
      playChime();
    }
  }

  const soundLabel = sound ? t("settings.sound.off") : t("settings.sound.on");

  // Only the app can change this. A web build has its API baked in, and a
  // control that cannot change anything is worse than no control.
  const canChangeServer = isRuntimeConfigurable();

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

      {/* Next to the language, as the other per-device appearance choice. */}
      <Tooltip title={t("settings.palette")}>
        <IconButton
          color="inherit"
          onClick={(event) => setPaletteAnchor(event.currentTarget)}
          aria-label={t("settings.palette")}
          aria-haspopup="menu"
        >
          <PaletteRounded />
        </IconButton>
      </Tooltip>

      {/* Sun when it is dark (click to go light), moon when it is light. The icon
          shows the destination, which is what people reach for. */}
      <Tooltip title={nextModeLabel}>
        <IconButton color="inherit" onClick={toggle} aria-label={nextModeLabel}>
          {mode === "dark" ? <LightModeRounded /> : <DarkModeRounded />}
        </IconButton>
      </Tooltip>

      {/* Only in the app bar: on the sign-in screens there is nothing to alert. */}
      {!floating && (
        <Tooltip title={soundLabel}>
          <IconButton color="inherit" onClick={toggleSound} aria-label={soundLabel}>
            {sound ? <VolumeUpRounded /> : <VolumeOffRounded />}
          </IconButton>
        </Tooltip>
      )}

      {canChangeServer && (
        <Tooltip title={t("server.change")}>
          <IconButton
            color="inherit"
            onClick={() => setServerOpen(true)}
            aria-label={t("server.change")}
          >
            <DnsRounded />
          </IconButton>
        </Tooltip>
      )}

      <Dialog open={serverOpen} onClose={() => setServerOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("server.change")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {tf("server.current", { url: getApiUrl() })}
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t("server.signsYouOut")}
          </Alert>
          <ServerAddressForm onAccepted={switchServer} initialValue={getApiUrl()} />
        </DialogContent>
      </Dialog>

      <Menu
        anchorEl={paletteAnchor}
        open={Boolean(paletteAnchor)}
        onClose={() => setPaletteAnchor(null)}
      >
        <Typography variant="overline" color="text.secondary" sx={{ px: 2, display: "block" }}>
          {t("settings.palette")}
        </Typography>
        {PALETTE_IDS.map((id) => {
          const swatch = paletteSwatch(id, mode);
          return (
            <MenuItem
              key={id}
              selected={id === palette}
              onClick={() => {
                setPalette(id);
                setPaletteAnchor(null);
              }}
              sx={{ gap: 1.5, minWidth: 220 }}
            >
              <Box
                aria-hidden
                className="palette-swatch"
                sx={{
                  background: `linear-gradient(135deg, ${swatch.accent} 0 50%, ${swatch.partner} 50% 100%)`,
                  outlineColor: swatch.ground,
                }}
              />
              <ListItemText>{t(`settings.palette.${id}` as "settings.palette.indigo")}</ListItemText>
              {id === palette && <CheckRounded fontSize="small" sx={{ color: "primary.main" }} />}
            </MenuItem>
          );
        })}
      </Menu>

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
