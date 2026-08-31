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
import { STATE_META, type TaskState } from "../tasks/types";
import { t } from "../../i18n";

export type AssignableTask = {
  id: number;
  title: string;
  state: TaskState;
  startsAt: string;
  endsAt: string;
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
