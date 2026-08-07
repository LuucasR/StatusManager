import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Box } from "@mui/material";
import { useState } from "react";
import TaskCard from "./TaskCard";
import TaskColumn from "./TaskColumn";
import { canManageTasks } from "../roles";
import { STATE_ORDER, canMoveTask, type Task, type TaskState } from "./types";

type Props = {
  tasks: Task[];
  meId?: number;
  role?: string;
  onOpen: (task: Task) => void;
  onMove: (taskId: number, state: TaskState) => void;
  onPin: (task: Task, pinned: boolean) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
};

export default function TaskBoard({
  tasks,
  meId,
  role,
  onOpen,
  onMove,
  onPin,
  onEdit,
  onDelete,
}: Props) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    // Un umbral chico evita que un click en la tarjeta se interprete como drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveTask(tasks.find((task) => task.id === Number(event.active.id)) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const target = over.id as TaskState;
    const origin = active.data.current?.state as TaskState | undefined;
    if (!STATE_ORDER.includes(target) || target === origin) return;

    onMove(Number(active.id), target);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveTask(null)}
      onDragEnd={handleDragEnd}
    >
      <Box className="task-board">
        {STATE_ORDER.map((state) => {
          const columnTasks = tasks.filter((task) => task.state === state);
          return (
            <TaskColumn
              key={state}
              state={state}
              count={columnTasks.length}
              // La columna origen no se ilumina: soltar ahí es un no-op.
              dropHint={Boolean(activeTask) && activeTask?.state !== state}
            >
              {columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  canMove={canMoveTask(task, meId, role)}
                  canEdit={canManageTasks(role)}
                  onOpen={onOpen}
                  onMove={onMove}
                  onPin={onPin}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </TaskColumn>
          );
        })}
      </Box>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,0,0,1)" }}>
        {activeTask ? (
          <TaskCard task={activeTask} canMove canEdit={false} overlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
