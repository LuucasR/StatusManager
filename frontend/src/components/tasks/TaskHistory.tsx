import { useState } from "react";
import { Avatar, Box, Button, Chip, Stack, Typography } from "@mui/material";
import { formatCommentDate } from "./datetime";
import {
  STATE_META,
  TASK_COLORS,
  participantColor,
  taskColorLabel,
  type Task,
  type TaskColor,
  type TaskEvent,
  type TaskState,
} from "./types";
import { t, tf, hasTranslation } from "../../i18n";

/** Lines shown before "Show all": the latest ones are what people come for. */
const COLLAPSED = 8;

const stateLabel = (state: string | null) =>
  state && state in STATE_META ? STATE_META[state as TaskState].label : (state ?? "");

/** One history line as a sentence, in the current language. */
function describe(event: TaskEvent) {
  const actor = event.actorName ?? t("taskHistory.someone");
  const vars = {
    actor,
    target: event.targetName ?? t("taskHistory.someone"),
    item: event.itemText ?? "",
    old: event.detail ?? "",
    state: stateLabel(event.type === "AUTO_COMPLETED" ? "DONE" : event.detail),
  };

  switch (event.type) {
    case "EDITED":
      return tf("taskHistory.EDITED", {
        actor,
        fields: (event.detail ?? "")
          .split(",")
          .map((field) => {
            const key = `taskHistory.field.${field}`;
            return hasTranslation(key) ? t(key) : field;
          })
          .join(", "),
      });
    case "COLOR_CHANGED":
      return event.detail && (TASK_COLORS as readonly string[]).includes(event.detail)
        ? tf("taskHistory.COLOR_CHANGED", { actor, color: taskColorLabel(event.detail as TaskColor) })
        : tf("taskHistory.COLOR_CLEARED", { actor });
    case "PARTICIPANT_REMOVED":
      if (event.detail === "DEACTIVATED") {
        return tf("taskHistory.PARTICIPANT_REMOVED.deactivated", vars);
      }
      break;
  }

  // Lines backfilled from before the history existed have no author.
  const noActor = `taskHistory.${event.type}.noActor`;
  if (!event.actorName && hasTranslation(noActor)) return tf(noActor, vars);

  const key = `taskHistory.${event.type}`;
  return hasTranslation(key) ? tf(key, vars) : event.type;
}

/**
 * Who takes part in the task (and since when), and everything that happened to
 * it, newest first. Fed by the detail response, so it refreshes with the rest
 * of the dialog.
 */
export default function TaskHistory({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false);
  const history = task.history ?? [];

  // Newest first, so the first "added" line found is the current stint.
  const joinedAt = new Map<number, string>();
  for (const event of history) {
    if (event.type === "PARTICIPANT_ADDED" && event.targetId && !joinedAt.has(event.targetId)) {
      joinedAt.set(event.targetId, event.createdAt);
    }
  }
  const current = new Set(task.participants.map((person) => person.id));
  const former = [
    ...new Map(
      history
        .filter(
          (event) =>
            (event.type === "PARTICIPANT_ADDED" || event.type === "PARTICIPANT_REMOVED") &&
            event.targetId &&
            !current.has(event.targetId) &&
            event.targetName
        )
        .map((event) => [event.targetId, event.targetName!])
    ).values(),
  ];

  const shown = expanded ? history : history.slice(0, COLLAPSED);

  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {t("taskHistory.title")}
      </Typography>

      <Box
        sx={{
          mt: 1,
          border: "1px solid var(--border)",
          borderRadius: "14px",
          p: 1.5,
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
          {t("taskHistory.participants")}
        </Typography>
        {task.participants.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("taskHistory.noParticipants")}
          </Typography>
        ) : (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 0.5 }}>
            {task.participants.map((person) => {
              const since = joinedAt.get(person.id);
              return (
                <Chip
                  key={person.id}
                  size="small"
                  avatar={
                    <Avatar sx={{ bgcolor: participantColor(person.id), color: "#fff !important" }}>
                      {person.name.slice(0, 1).toUpperCase()}
                    </Avatar>
                  }
                  label={
                    since
                      ? `${person.name} · ${tf("taskHistory.since", { date: formatCommentDate(since) })}`
                      : person.name
                  }
                />
              );
            })}
          </Stack>
        )}
        {former.length > 0 && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75 }}>
            {tf("taskHistory.former", { names: former.join(", ") })}
          </Typography>
        )}

        <Box sx={{ borderTop: "1px solid var(--border)", mt: 1.5, pt: 1 }}>
          {history.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("taskHistory.empty")}
            </Typography>
          ) : (
            <Stack component="ol" spacing={0.75} sx={{ listStyle: "none", m: 0, p: 0 }}>
              {shown.map((event) => (
                <Stack
                  key={event.id}
                  component="li"
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "flex-start" }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      flexShrink: 0,
                      mt: 0.75,
                      bgcolor: event.actorId ? participantColor(event.actorId) : "text.disabled",
                    }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                      {describe(event)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatCommentDate(event.createdAt)}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          )}

          {history.length > COLLAPSED && (
            <Button size="small" onClick={() => setExpanded((value) => !value)} sx={{ mt: 0.5 }}>
              {expanded
                ? t("taskHistory.showLess")
                : tf("taskHistory.showAll", { count: history.length })}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
