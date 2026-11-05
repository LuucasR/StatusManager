import {
  Box,
  Chip,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { formatRange } from "../tasks/datetime";
import { STATE_META, type ChecklistPriority, type TaskState } from "../tasks/types";
import { LabelChip } from "../tasks/ChecklistLabel";
import { PriorityChip } from "../tasks/ChecklistPriority";
import { t } from "../../i18n";

/** A checklist item still pending, offered when declaring work on its task. */
export type AssignableItem = {
  id: number;
  text: string;
  label: string | null;
  priority: ChecklistPriority | null;
  /** The caller is one of the people in charge of it. */
  mine: boolean;
};

export type AssignableTask = {
  id: number;
  title: string;
  state: TaskState;
  startsAt: string;
  endsAt: string;
  /** Pending checklist items, in checklist order. Empty = nothing to pick. */
  items: AssignableItem[];
};

/** <Select> value for working on something that is not on the board. */
export const NO_TASK = "none";

type Props = {
  tasks: AssignableTask[];
  loading: boolean;
  /** null = "no task"; a number = the chosen id. */
  value: number | null;
  onChange: (taskId: number | null) => void;
};

/**
 * Picker for the task declared when switching to "Working".
 *
 * The "no task" option is deliberate and not a free escape hatch: without it,
 * someone who takes part in a task starting next month would be forced to book
 * today's work against it, and that dirty data pollutes the summary forever.
 * Choosing it requires a comment (enforced by the dialog that contains this).
 */
export default function WorkingTaskSelect({ tasks, loading, value, onChange }: Props) {
  const empty = !loading && tasks.length === 0;

  return (
    <FormControl fullWidth disabled={loading || empty}>
      <InputLabel>{loading ? t("taskSelect.loading") : t("common.task")}</InputLabel>
      <Select
        value={value === null ? NO_TASK : String(value)}
        label={loading ? t("taskSelect.loading") : t("common.task")}
        onChange={(e) => onChange(e.target.value === NO_TASK ? null : Number(e.target.value))}
        renderValue={(selected) => {
          if (selected === NO_TASK) return t("taskSelect.noTask");
          return tasks.find((task) => String(task.id) === selected)?.title ?? t("common.task");
        }}
      >
        <MenuItem value={NO_TASK}>{t("taskSelect.noTask")}</MenuItem>
        {tasks.map((task) => (
          <MenuItem key={task.id} value={String(task.id)}>
            <Stack sx={{ py: 0.25 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography sx={{ fontWeight: 600 }}>{task.title}</Typography>
                <Chip
                  size="small"
                  label={STATE_META[task.state].label}
                  sx={{
                    height: 18,
                    fontSize: 10,
                    fontWeight: 700,
                    bgcolor: STATE_META[task.state].soft,
                    color: STATE_META[task.state].ink,
                  }}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {formatRange(task.startsAt, task.endsAt)}
              </Typography>
            </Stack>
          </MenuItem>
        ))}
      </Select>

      <FormHelperText component="div">
        {empty ? (
          <Box>{t("taskSelect.empty")}</Box>
        ) : (
          <Box>{t("taskSelect.help")}</Box>
        )}
      </FormHelperText>
    </FormControl>
  );
}

type ItemProps = {
  items: AssignableItem[];
  value: number | null;
  onChange: (itemId: number) => void;
};

/**
 * Picker for the checklist item of the chosen task. Mandatory whenever the task
 * still has pending items (the backend enforces it too): the per-item time
 * breakdown in the summary is built from this choice. The caller's own items
 * come first; anyone on the task can still pick any of them.
 */
export function WorkingItemSelect({ items, value, onChange }: ItemProps) {
  const ordered = [...items.filter((item) => item.mine), ...items.filter((item) => !item.mine)];
  const selected = value !== null && items.some((item) => item.id === value) ? String(value) : "";

  return (
    <FormControl fullWidth required>
      <InputLabel>{t("itemSelect.label")}</InputLabel>
      <Select
        value={selected}
        label={t("itemSelect.label")}
        onChange={(e) => onChange(Number(e.target.value))}
        renderValue={(id) => items.find((item) => String(item.id) === id)?.text ?? ""}
      >
        {ordered.map((item) => (
          <MenuItem key={item.id} value={String(item.id)} sx={{ whiteSpace: "normal" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, py: 0.25 }}>
              <Typography sx={{ fontWeight: item.mine ? 700 : 400 }}>{item.text}</Typography>
              {item.mine && (
                <Chip size="small" color="primary" label={t("itemSelect.mine")} sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
              )}
              <LabelChip label={item.label} />
              <PriorityChip priority={item.priority} />
            </Stack>
          </MenuItem>
        ))}
      </Select>
      <FormHelperText>{t("itemSelect.help")}</FormHelperText>
    </FormControl>
  );
}
