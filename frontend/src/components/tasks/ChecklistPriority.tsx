import { FlagRounded, OutlinedFlagRounded } from "@mui/icons-material";
import { Chip, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from "@mui/material";
import { useState } from "react";
import {
  CHECKLIST_PRIORITIES,
  CHECKLIST_PRIORITY_COLOR,
  checklistPriorityLabel,
  type ChecklistPriority,
} from "./types";
import { t, tf } from "../../i18n";

/** The item's priority as a small coloured chip; nothing when it has none. */
export function PriorityChip({ priority }: { priority?: ChecklistPriority | null }) {
  if (!priority) return null;
  const color = CHECKLIST_PRIORITY_COLOR[priority];
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<FlagRounded sx={{ color: `${color} !important` }} />}
      label={checklistPriorityLabel(priority)}
      sx={{ borderColor: color, color, fontWeight: 700 }}
    />
  );
}

type PickerProps = {
  value: ChecklistPriority | null;
  onChange: (value: ChecklistPriority | null) => void;
  disabled?: boolean;
};

/**
 * A flag button that opens the priorities. A button rather than a select: the
 * editor row already carries the text and the people in charge, and a third
 * field would squeeze the text, which is what is being written.
 */
export function PriorityPicker({ value, onChange, disabled }: PickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = value
    ? tf("checklistPriority.current", { priority: checklistPriorityLabel(value) })
    : t("checklistPriority.none");

  const pick = (next: ChecklistPriority | null) => {
    onChange(next);
    setAnchor(null);
  };

  return (
    <>
      <Tooltip title={label}>
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            aria-label={label}
            onClick={(event) => setAnchor(event.currentTarget)}
          >
            {value ? (
              <FlagRounded fontSize="small" sx={{ color: CHECKLIST_PRIORITY_COLOR[value] }} />
            ) : (
              <OutlinedFlagRounded fontSize="small" sx={{ color: "text.disabled" }} />
            )}
          </IconButton>
        </span>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {CHECKLIST_PRIORITIES.map((priority) => (
          <MenuItem key={priority} dense selected={value === priority} onClick={() => pick(priority)}>
            <ListItemIcon>
              <FlagRounded fontSize="small" sx={{ color: CHECKLIST_PRIORITY_COLOR[priority] }} />
            </ListItemIcon>
            <ListItemText primary={checklistPriorityLabel(priority)} />
          </MenuItem>
        ))}
        <MenuItem dense selected={value === null} onClick={() => pick(null)}>
          <ListItemIcon>
            <OutlinedFlagRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t("checklistPriority.none")} />
        </MenuItem>
      </Menu>
    </>
  );
}
