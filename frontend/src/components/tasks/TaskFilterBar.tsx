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
import { EMPTY_TASK_FILTERS, hasTaskFilters, type TaskFilters } from "./taskFilter";
import { STATE_META, STATE_ORDER, type TaskParticipant } from "./types";
import { t, tf } from "../../i18n";

const NOBODY = "none";

type Props = {
  value: TaskFilters;
  onChange: (next: TaskFilters) => void;
  /** Everybody taking part in at least one task, the options of the people filter. */
  members: TaskParticipant[];
  shown: number;
  total: number;
};

/** Search and filters above the task board, applied on the client. */
export default function TaskFilterBar({ value, onChange, members, shown, total }: Props) {
  const set = (patch: Partial<TaskFilters>) => onChange({ ...value, ...patch });
  // The Select works on strings; "nobody" rides along as a sentinel key.
  const selected = value.unassigned ? [NOBODY] : value.members.map(String);

  return (
    <Stack spacing={1.5} sx={{ mt: 3 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField
          size="small"
          fullWidth
          placeholder={t("taskFilter.search")}
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
        <FormControl size="small" sx={{ minWidth: { sm: 260 }, maxWidth: { sm: 360 } }}>
          <InputLabel>{t("taskFilter.member")}</InputLabel>
          <Select<string[]>
            multiple
            value={selected}
            label={t("taskFilter.member")}
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
                ? t("taskFilter.nobody")
                : keys
                    .map((key) => members.find((member) => String(member.id) === key)?.name ?? key)
                    .join(", ")
            }
          >
            <MenuItem value={NOBODY}>
              <Checkbox size="small" checked={value.unassigned} />
              <ListItemText primary={t("taskFilter.nobody")} />
            </MenuItem>
            {members.map((member) => (
              <MenuItem key={member.id} value={String(member.id)}>
                <Checkbox size="small" checked={value.members.includes(member.id)} />
                <ListItemText primary={`#${member.employeeNumber} - ${member.name}`} />
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
        <Chip
          size="small"
          label={t("common.all")}
          color={value.status === "all" ? "primary" : "default"}
          variant={value.status === "all" ? "filled" : "outlined"}
          onClick={() => set({ status: "all" })}
        />
        {STATE_ORDER.map((state) => (
          <Chip
            key={state}
            size="small"
            label={STATE_META[state].label}
            variant={value.status === state ? "filled" : "outlined"}
            onClick={() => set({ status: state })}
            sx={
              value.status === state
                ? { bgcolor: STATE_META[state].accent, color: "#fff" }
                : { borderColor: STATE_META[state].accent, color: STATE_META[state].ink }
            }
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
                ? t("taskFilter.onlyMembers")
                : t("taskFilter.onlyMember")}
            </Typography>
          }
        />

        <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
          {tf("taskFilter.count", { shown, total })}
        </Typography>
        <Button
          size="small"
          startIcon={<FilterAltOffRounded />}
          disabled={!hasTaskFilters(value)}
          onClick={() => onChange(EMPTY_TASK_FILTERS)}
        >
          {t("taskFilter.clear")}
        </Button>
      </Stack>
    </Stack>
  );
}
