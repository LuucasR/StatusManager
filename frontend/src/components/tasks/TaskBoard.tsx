import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Box } from "@mui/material";
import TaskCard from "./TaskCard";
import TaskColumn from "./TaskColumn";
import { STATE_ORDER, canMoveTask, type Task, type TaskState } from "./types";

type Props = {
  tasks: Task[];
  meId?: number;
  role?: string;
  onOpen: (task: Task) => void;
  onMove: (taskId: number, state: TaskState) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
};

export default function TaskBoard({ tasks, meId, role, onOpen, onMove, onEdit, onDelete }: Props) {
  const sensors = useSensors(
    // Un umbral chico evita que un click en la tarjeta se interprete como drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const target = over.id as TaskState;
    const origin = active.data.current?.state as TaskState | undefined;
    if (!STATE_ORDER.includes(target) || target === origin) return;

    onMove(Number(active.id), target);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <Box className="task-board">
        {STATE_ORDER.map((state) => {
          const columnTasks = tasks.filter((task) => task.state === state);
          return (
            <TaskColumn key={state} state={state} count={columnTasks.length}>
              {columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  canMove={canMoveTask(task, meId, role)}
                  canEdit={role === "ADMIN"}
                  onOpen={onOpen}
                  onMove={onMove}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </TaskColumn>
          );
        })}
      </Box>
    </DndContext>
  );
}
