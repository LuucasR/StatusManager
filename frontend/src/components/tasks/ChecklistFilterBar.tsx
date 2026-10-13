import { FilterAltOffRounded, SearchRounded } from "@mui/icons-material";
import {
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
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
  type ChecklistMemberFilter,
} from "./checklistFilter";
import type { TaskParticipant } from "./types";
import { t, tf } from "../../i18n";

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
        <FormControl size="small" sx={{ minWidth: { sm: 220 } }}>
          <InputLabel>{t("checklistFilter.member")}</InputLabel>
          <Select
            value={String(value.member)}
            label={t("checklistFilter.member")}
            onChange={(event) => {
              const raw = event.target.value;
              const member: ChecklistMemberFilter =
                raw === "all" || raw === "none" ? raw : Number(raw);
              set({ member, onlyMember: typeof member === "number" && value.onlyMember });
            }}
          >
            <MenuItem value="all">{t("common.all")}</MenuItem>
            <MenuItem value="none">{t("checklistFilter.nobody")}</MenuItem>
            {members.map((member) => (
              <MenuItem key={member.id} value={String(member.id)}>
                {member.name}
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
              checked={value.onlyMember}
              disabled={typeof value.member !== "number"}
              onChange={(event) => set({ onlyMember: event.target.checked })}
            />
          }
          label={<Typography variant="body2">{t("checklistFilter.onlyMember")}</Typography>}
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
