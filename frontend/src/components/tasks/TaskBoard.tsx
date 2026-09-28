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
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Box } from "@mui/material";
import { useMemo, useState } from "react";
import TaskCard from "./TaskCard";
import TaskColumn from "./TaskColumn";
import { canManageTasks, isAdminRole } from "../roles";
import {
  STATE_ORDER,
  canMoveTask,
  compareBoardOrder,
  type Task,
  type TaskColor,
  type TaskState,
} from "./types";

type Props = {
  tasks: Task[];
  meId?: number;
  role?: string;
  onOpen: (task: Task) => void;
  onMove: (taskId: number, state: TaskState) => void;
  /** A column's task ids in their new order. Managers only. */
  onReorder: (state: TaskState, taskIds: number[], moved?: { taskId: number; from: TaskState }) => void;
  onPin: (task: Task, pinned: boolean) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onColor: (task: Task, color: TaskColor | null) => void;
};

export default function TaskBoard({
  tasks,
  meId,
  role,
  onOpen,
  onMove,
  onReorder,
  onPin,
  onEdit,
  onDelete,
  onColor,
}: Props) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const canManage = canManageTasks(role);

  const sensors = useSensors(
    // A small threshold stops a click on the card being read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Sorted here too, not only by the backend: an optimistic reorder or move has
  // to land in the right spot before the reload confirms it.
  const columns = useMemo(() => {
    const sorted = [...tasks].sort(compareBoardOrder);
    return Object.fromEntries(
      STATE_ORDER.map((state) => [state, sorted.filter((task) => task.state === state)])
    ) as Record<TaskState, Task[]>;
  }, [tasks]);

  function handleDragStart(event: DragStartEvent) {
    setActiveTask(tasks.find((task) => task.id === Number(event.active.id)) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    // Dropped back onto itself: nothing moved.
    if (over.id === active.id) return;

    const taskId = Number(active.id);
    const origin = active.data.current?.state as TaskState | undefined;
    // Dropped on a column's empty space, or on one of its cards.
    const target = (
      STATE_ORDER.includes(over.id as TaskState) ? over.id : over.data.current?.state
    ) as TaskState | undefined;
    if (!origin || !target || !STATE_ORDER.includes(target)) return;

    // Only board managers decide the order everybody sees; a participant's drag
    // is a move between columns, exactly as before.
    if (!canManage) {
      if (target !== origin) onMove(taskId, target);
      return;
    }

    const ids = columns[target].map((task) => task.id).filter((id) => id !== taskId);
    const overIndex = ids.indexOf(Number(over.id));
    let insertAt = overIndex < 0 ? ids.length : overIndex;
    // Within the same column, dragging downwards has to land AFTER the card
    // it was dropped on, or moving one place down would be a no-op.
    if (target === origin && overIndex >= 0) {
      const from = columns[origin].findIndex((task) => task.id === taskId);
      const to = columns[origin].findIndex((task) => task.id === Number(over.id));
      if (from < to) insertAt = overIndex + 1;
    }
    ids.splice(insertAt, 0, taskId);

    if (target === origin) {
      const before = columns[origin].map((task) => task.id);
      if (before.every((id, index) => id === ids[index])) return;
      onReorder(target, ids);
    } else {
      onReorder(target, ids, { taskId, from: origin });
    }
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
          const columnTasks = columns[state];
          return (
            <TaskColumn
              key={state}
              state={state}
              count={columnTasks.length}
              // The source column does not light up: dropping there is a no-op.
              dropHint={Boolean(activeTask) && activeTask?.state !== state}
            >
              <SortableContext
                items={columnTasks.map((task) => task.id)}
                strategy={verticalListSortingStrategy}
              >
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    canMove={canMoveTask(task, meId, role)}
                    canEdit={canManage}
                    canColor={isAdminRole(role)}
                    onOpen={onOpen}
                    onMove={onMove}
                    onPin={onPin}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onColor={onColor}
                  />
                ))}
              </SortableContext>
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
