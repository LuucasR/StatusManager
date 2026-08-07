import { useDroppable } from "@dnd-kit/core";
import { Box, Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { STATE_META, stateVars, type TaskState } from "./types";

type Props = {
  state: TaskState;
  count: number;
  /** true cuando se está arrastrando una tarjeta que viene de otra columna. */
  dropHint: boolean;
  children: ReactNode;
};

export default function TaskColumn({ state, count, dropHint, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: state });
  const meta = STATE_META[state];

  return (
    <Paper
      ref={setNodeRef}
      elevation={0}
      style={stateVars(state)}
      className={`task-column${isOver ? " over" : ""}`}
    >
      <Box className="task-column-head">
        <Box className="task-column-dot" />
        <Box component="span" className="task-column-title">
          {meta.label.toUpperCase()}
        </Box>
        <Box component="span" className="task-column-count">
          {count}
        </Box>
      </Box>

      <Box className="task-column-body">
        <Stack spacing={1.5}>
          {count === 0 && !(isOver && dropHint) ? (
            <Box className="task-column-empty">
              <meta.Icon sx={{ fontSize: 26, color: "var(--accent)", opacity: 0.35 }} />
              <Typography variant="caption">{meta.empty}</Typography>
            </Box>
          ) : (
            children
          )}

          {isOver && dropHint && (
            <Box className="task-drop-hint">Soltar en {meta.label}</Box>
          )}
        </Stack>
      </Box>
    </Paper>
  );
}
