import { FilterAltOffRounded, SearchRounded } from "@mui/icons-material";
import {
  Button,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  EMPTY_CHECKLIST_FILTERS,
  hasChecklistFilters,
  type ChecklistFilters,
} from "./checklistFilter";
import type { TaskParticipant } from "./types";
import { t, tf } from "../../i18n";

const NOBODY = "none";

type Props = {
  value: ChecklistFilters;
  onChange: (next: ChecklistFilters) => void;
  /** Everybody in charge of at least one item, the options of the member filter. */
  members: TaskParticipant[];
  shown: number;
  total: number;
};

/** Search and filters above a task's checklist, applied on the client. */
export default function ChecklistFilterBar({ value, onChange, members, shown, total }: Props) {
  const set = (patch: Partial<ChecklistFilters>) => onChange({ ...value, ...patch });
  // The Select works on strings; "nobody" rides along as a sentinel key.
  const selected = value.unassigned ? [NOBODY] : value.members.map(String);
  const statuses = [
    { key: "all", label: t("common.all") },
    { key: "open", label: t("checklistFilter.open") },
    { key: "done", label: t("checklistFilter.done") },
  ] as const;

  return (
    <Stack spacing={1.5} sx={{ mb: 1.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField
          size="small"
          fullWidth
          placeholder={t("checklistFilter.search")}
          value={value.query}
          onChange={(event) => set({ query: event.target.value })}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <FormControl size="small" sx={{ minWidth: { sm: 240 }, maxWidth: { sm: 320 } }}>
          <InputLabel>{t("checklistFilter.member")}</InputLabel>
          <Select<string[]>
            multiple
            value={selected}
            label={t("checklistFilter.member")}
            onChange={(event) => {
              const raw = event.target.value;
              const next = typeof raw === "string" ? raw.split(",") : raw;
              // "Nobody" and people exclude each other: whichever was picked last wins.
              if (next.includes(NOBODY) && !value.unassigned) {
                return set({ members: [], unassigned: true, onlyMembers: false });
              }
              const ids = next.filter((key) => key !== NOBODY).map(Number);
              set({
                members: ids,
                unassigned: false,
                onlyMembers: ids.length > 0 && value.onlyMembers,
              });
            }}
            renderValue={(keys) =>
              keys.includes(NOBODY)
                ? t("checklistFilter.nobody")
                : keys
                    .map((key) => members.find((member) => String(member.id) === key)?.name ?? key)
                    .join(", ")
            }
          >
            <MenuItem value={NOBODY}>
              <Checkbox size="small" checked={value.unassigned} />
              <ListItemText primary={t("checklistFilter.nobody")} />
            </MenuItem>
            {members.map((member) => (
              <MenuItem key={member.id} value={String(member.id)}>
                <Checkbox size="small" checked={value.members.includes(member.id)} />
                <ListItemText primary={member.name} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ alignItems: "center", flexWrap: "wrap" }}
      >
        {statuses.map((status) => (
          <Chip
            key={status.key}
            size="small"
            label={status.label}
            color={value.status === status.key ? "primary" : "default"}
            variant={value.status === status.key ? "filled" : "outlined"}
            onClick={() => set({ status: status.key })}
          />
        ))}

        <FormControlLabel
          sx={{ ml: 0.5 }}
          control={
            <Switch
              size="small"
              checked={value.onlyMembers}
              disabled={value.members.length === 0}
              onChange={(event) => set({ onlyMembers: event.target.checked })}
            />
          }
          label={
            <Typography variant="body2">
              {value.members.length > 1
                ? t("checklistFilter.onlyMembers")
                : t("checklistFilter.onlyMember")}
            </Typography>
          }
        />

        <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
          {tf("checklistFilter.count", { shown, total })}
        </Typography>
        <Button
          size="small"
          startIcon={<FilterAltOffRounded />}
          disabled={!hasChecklistFilters(value)}
          onClick={() => onChange(EMPTY_CHECKLIST_FILTERS)}
        >
          {t("checklistFilter.clear")}
        </Button>
      </Stack>
    </Stack>
  );
}
