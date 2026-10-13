import { DeleteRounded, DownloadRounded, EditRounded } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import type { Utility } from "./downloadsApi";
import { t } from "../../i18n";

/** Characters of the description shown on the card; the rest is behind "Read more". */
const DESCRIPTION_LIMIT = 140;
/** Lines the description box always takes, with or without text, so every card matches. */
const DESCRIPTION_LINES = 4;
const NAME_LINES = 2;

/**
 * Cuts at the last space before the limit so no word is chopped in half.
 * Line breaks count too: a short text spread over many lines would overflow
 * the fixed box just the same.
 */
function preview(text: string) {
  const flat = text.replace(/\s*\n+\s*/g, " ").trim();
  const lines = text.split("\n").filter((line) => line.trim()).length;
  if (flat.length <= DESCRIPTION_LIMIT && lines <= DESCRIPTION_LINES) {
    return { text, truncated: false };
  }
  const cut = flat.slice(0, DESCRIPTION_LIMIT);
  const space = cut.lastIndexOf(" ");
  return { text: `${(space > DESCRIPTION_LIMIT * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`, truncated: true };
}

/** Fixed height of N lines of a Typography variant, plus the clamp that enforces it. */
const clampLines = (lines: number, lineHeight: number) => ({
  display: "-webkit-box",
  WebkitBoxOrient: "vertical" as const,
  WebkitLineClamp: lines,
  overflow: "hidden",
  lineHeight,
  height: `${lines * lineHeight}em`,
  wordBreak: "break-word" as const,
});

function Chips({ utility, wrap }: { utility: Utility; wrap: boolean }) {
  return (
    <Stack
      direction="row"
      sx={{ gap: 1, flexWrap: wrap ? "wrap" : "nowrap", overflow: "hidden", minHeight: 24 }}
    >
      {utility.version && <Chip size="small" label={utility.version} />}
      {utility.platform && <Chip size="small" variant="outlined" label={utility.platform} />}
      {utility.sizeLabel && <Chip size="small" variant="outlined" label={utility.sizeLabel} />}
    </Stack>
  );
}

function DownloadButton({ utility }: { utility: Utility }) {
  return (
    <Button
      variant="contained"
      startIcon={<DownloadRounded />}
      component="a"
      href={utility.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {t("downloads.download")}
    </Button>
  );
}

type Props = {
  utility: Utility;
  admin: boolean;
  onEdit: (utility: Utility) => void;
  onDelete: (utility: Utility) => void;
};

/**
 * One tool. Every part of the card has a fixed height (name, chips,
 * description), so the grid lines up no matter how much text each tool has.
 * The full description opens in a dialog.
 */
export default function UtilityCard({ utility, admin, onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const description = preview(utility.description);

  return (
    <Paper
      className="status-card"
      elevation={0}
      sx={{ p: 3, display: "flex", flexDirection: "column", gap: 1.5, minWidth: 0 }}
    >
      <Stack direction="row" sx={{ alignItems: "flex-start", gap: 1 }}>
        <Tooltip title={utility.name} placement="top-start">
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, flex: 1, minWidth: 0, ...clampLines(NAME_LINES, 1.35) }}
          >
            {utility.name}
          </Typography>
        </Tooltip>
        {admin && (
          <Stack direction="row">
            <Tooltip title={t("common.edit")}>
              <IconButton size="small" onClick={() => onEdit(utility)}>
                <EditRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("common.delete")}>
              <IconButton size="small" onClick={() => onDelete(utility)}>
                <DeleteRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Stack>

      <Chips utility={utility} wrap={false} />

      <Box>
        <Typography
          color="text.secondary"
          sx={{ whiteSpace: "pre-wrap", ...clampLines(DESCRIPTION_LINES, 1.5) }}
        >
          {description.text}
        </Typography>
        {/* Always rendered so cards with and without it stay the same height. */}
        <Button
          size="small"
          onClick={() => setOpen(true)}
          sx={{ px: 0.5, minWidth: 0, visibility: description.truncated ? "visible" : "hidden" }}
        >
          {t("downloads.readMore")}
        </Button>
      </Box>

      <Box sx={{ mt: "auto" }}>
        <DownloadButton utility={utility} />
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ wordBreak: "break-word" }}>{utility.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Chips utility={utility} wrap />
            <Typography color="text.secondary" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {utility.description}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("common.close")}</Button>
          <DownloadButton utility={utility} />
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
