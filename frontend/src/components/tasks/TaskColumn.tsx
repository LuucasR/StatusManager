import { useDroppable } from "@dnd-kit/core";
import { Chip, Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { STATE_LABELS, type TaskState } from "./types";

type Props = {
  state: TaskState;
  count: number;
  children: ReactNode;
};

export default function TaskColumn({ state, count, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: state });

  return (
    <Paper
      ref={setNodeRef}
      elevation={0}
      className={`task-column${isOver ? " over" : ""}`}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: ".04em" }}>
          {STATE_LABELS[state].toUpperCase()}
        </Typography>
        <Chip size="small" label={count} />
      </Stack>

      <Stack spacing={1.5}>
        {count === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: "center" }}>
            Sin tareas
          </Typography>
        ) : (
          children
        )}
      </Stack>
    </Paper>
  );
}
