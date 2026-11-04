import { LocalOfferOutlined, LocalOfferRounded } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  IconButton,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useRef, useState, type ReactNode } from "react";
import { labelColor } from "./checklistLabels";
import { t, tf } from "../../i18n";

/** Matches the backend's limit (task-validation.ts). */
const MAX_LABEL = 40;

/** The item's label as a small chip; nothing when it has none. */
export function LabelChip({ label }: { label?: string | null }) {
  if (!label) return null;
  const color = labelColor(label);
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<LocalOfferRounded sx={{ color: `${color} !important`, fontSize: "14px !important" }} />}
      label={label}
      sx={{ borderColor: color, fontWeight: 700, maxWidth: 160 }}
    />
  );
}

/**
 * The box that gathers the items sharing a label: the label on top, the items
 * inside, a coloured edge so neighbouring boxes read apart.
 */
export function LabelGroupBox({
  label,
  done,
  total,
  children,
}: {
  label: string;
  done: number;
  total: number;
  children: ReactNode;
}) {
  const color = labelColor(label);
  return (
    <Box
      sx={{
        border: 1,
        borderColor: alpha(color, 0.45),
        borderLeft: `4px solid ${color}`,
        borderRadius: 1.5,
        bgcolor: alpha(color, 0.06),
        px: 1.25,
        pt: 0.75,
        pb: 0.5,
        my: 0.75,
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.25 }}>
        <LocalOfferRounded sx={{ fontSize: 16, color }} />
        <Typography variant="body2" sx={{ fontWeight: 800, flex: 1, minWidth: 0 }} noWrap>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {done}/{total}
        </Typography>
      </Stack>
      {children}
    </Box>
  );
}

type PickerProps = {
  value: string | null;
  /** Labels already used in this checklist, offered first. */
  options: string[];
  onChange: (value: string | null) => void;
  disabled?: boolean;
};

/**
 * A tag button that opens a small box to type or pick the label. A button
 * rather than a field, for the same reason as the priority flag: the editor row
 * already carries the text and the people in charge.
 */
export function LabelPicker({ value, options, onChange, disabled }: PickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tooltip = value ? tf("checklistLabel.current", { label: value }) : t("checklistLabel.none");

  const open = (target: HTMLElement) => {
    setDraft(value ?? "");
    setAnchor(target);
  };
  const commit = (next: string | null) => {
    const trimmed = next?.trim().slice(0, MAX_LABEL) ?? "";
    onChange(trimmed || null);
    setAnchor(null);
  };

  return (
    <>
      <Tooltip title={tooltip}>
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            aria-label={tooltip}
            onClick={(event) => open(event.currentTarget)}
          >
            {value ? (
              <LocalOfferRounded fontSize="small" sx={{ color: labelColor(value) }} />
            ) : (
              <LocalOfferOutlined fontSize="small" sx={{ color: "text.disabled" }} />
            )}
          </IconButton>
        </span>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => commit(draft)}
        // The popover moves focus to itself once it has opened, so autoFocus on
        // the field loses: focus it after the transition instead.
        slotProps={{ transition: { onEntered: () => inputRef.current?.focus() } }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Stack spacing={1} sx={{ p: 1.5, width: 260 }}>
          <Autocomplete
            freeSolo
            size="small"
            options={options}
            inputValue={draft}
            onInputChange={(_, next) => setDraft(next.slice(0, MAX_LABEL))}
            onChange={(_, next) => {
              // Picking an option, or Enter on typed text.
              if (typeof next === "string") commit(next);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                inputRef={inputRef}
                label={t("checklistLabel.field")}
                placeholder={t("checklistLabel.placeholder")}
              />
            )}
          />
          <Typography variant="caption" color="text.secondary">
            {t("checklistLabel.hint")}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
            {value && (
              <Button size="small" color="inherit" onClick={() => commit(null)}>
                {t("checklistLabel.remove")}
              </Button>
            )}
            <Button size="small" variant="contained" onClick={() => commit(draft)}>
              {t("checklistLabel.apply")}
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}
