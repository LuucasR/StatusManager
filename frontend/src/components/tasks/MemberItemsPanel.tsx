import { CheckCircleRounded, RadioButtonUncheckedRounded } from "@mui/icons-material";
import { Box, ButtonBase, Paper, Stack, Typography } from "@mui/material";
import { EMPTY_CHECKLIST_FILTERS, filterChecklist } from "./checklistFilter";
import type { TaskFilters } from "./taskFilter";
import { STATE_META, compareBoardOrder, type Task, type TaskParticipant } from "./types";
import { t, tf } from "../../i18n";

type Props = {
  /** The tasks the filter bar left on screen. */
  tasks: Task[];
  filters: TaskFilters;
  /** To name the people picked. */
  members: TaskParticipant[];
  onOpen: (task: Task) => void;
};

/**
 * Next to the board while people are picked in the filter bar: per task, the
 * checklist items those people are in charge of. Same rule as the checklist
 * filter - every one of them, and nobody else with "only those people".
 */
export default function MemberItemsPanel({ tasks, filters, members, onOpen }: Props) {
  const itemFilters = {
    ...EMPTY_CHECKLIST_FILTERS,
    members: filters.members,
    onlyMembers: filters.onlyMembers,
  };
  const groups = [...tasks]
    .sort(compareBoardOrder)
    .map((task) => ({ task, items: filterChecklist(task.checklist, itemFilters) }))
    .filter((group) => group.items.length > 0);
  const names = filters.members
    .map((id) => members.find((member) => member.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <Paper variant="outlined" className="member-items-panel">
      <Box sx={{ px: 2, pt: 1.75, pb: 1.25, borderBottom: 1, borderColor: "divider" }}>
        <Typography sx={{ fontWeight: 800 }}>{t("taskFilter.itemsTitle")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {names} · {tf("taskFilter.itemsCount", { count })}
        </Typography>
      </Box>

      <Box className="member-items-body">
        {groups.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            {t("taskFilter.itemsEmpty")}
          </Typography>
        )}

        {groups.map(({ task, items }) => {
          const meta = STATE_META[task.state];
          const done = items.filter((item) => item.done).length;
          return (
            <Box key={task.id} sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
              <ButtonBase
                onClick={() => onOpen(task)}
                sx={{ width: "100%", justifyContent: "flex-start", gap: 1, borderRadius: 1, textAlign: "left" }}
              >
                <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: meta.accent, flex: "none" }} />
                <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
                  {task.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flex: "none" }}>
                  {done}/{items.length}
                </Typography>
              </ButtonBase>

              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {items.map((item) => (
                  <Stack key={item.id} direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                    {item.done ? (
                      <CheckCircleRounded fontSize="small" color="success" sx={{ mt: "1px" }} />
                    ) : (
                      <RadioButtonUncheckedRounded fontSize="small" color="disabled" sx={{ mt: "1px" }} />
                    )}
                    <Typography
                      variant="body2"
                      color={item.done ? "text.secondary" : "text.primary"}
                      sx={{ textDecoration: item.done ? "line-through" : "none", wordBreak: "break-word" }}
                    >
                      {item.text}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
