import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import ParticipantSelect from "./ParticipantSelect";
import { fromLocalInputValue, toLocalInputValue } from "./datetime";
import type { Task, TaskParticipant } from "./types";
import type { TaskPayload } from "./tasksApi";

type Props = {
  open: boolean;
  task: Task | null;
  employees: TaskParticipant[];
  onClose: () => void;
  onSubmit: (payload: TaskPayload, taskId?: number) => Promise<void>;
};

/** Arranca mañana de 09:00 a 13:00 para no obligar a tipear todo. */
function defaultRange() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(13, 0, 0, 0);
  return {
    startsAt: toLocalInputValue(start.toISOString()),
    endsAt: toLocalInputValue(end.toISOString()),
  };
}

export default function TaskFormDialog({ open, task, employees, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSaving(false);

    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setStartsAt(toLocalInputValue(task.startsAt));
      setEndsAt(toLocalInputValue(task.endsAt));
      // Se reconstruye contra `employees` para que isOptionEqualToValue tenga
      // las mismas referencias que las opciones del Autocomplete.
      setParticipants(
        task.participants
          .map((participant) => employees.find((e) => e.id === participant.id) ?? participant)
      );
    } else {
      const range = defaultRange();
      setTitle("");
      setDescription("");
      setStartsAt(range.startsAt);
      setEndsAt(range.endsAt);
      setParticipants([]);
    }
  }, [open, task, employees]);

  async function submit() {
    setError("");

    if (title.trim().length < 3) return setError("El título necesita al menos 3 caracteres");
    if (!description.trim()) return setError("Explicá de qué trata la tarea");
    if (!startsAt || !endsAt) return setError("Indicá la fecha y hora de inicio y de fin");
    // Espejo de la validación del backend, para no depender del round-trip.
    if (new Date(endsAt) <= new Date(startsAt)) {
      return setError("La fecha de fin debe ser posterior a la de inicio");
    }
    if (participants.length === 0) return setError("Elegí al menos un participante");

    setSaving(true);
    try {
      await onSubmit(
        {
          title: title.trim(),
          description: description.trim(),
          startsAt: fromLocalInputValue(startsAt),
          endsAt: fromLocalInputValue(endsAt),
          participantIds: participants.map((participant) => participant.id),
        },
        task?.id
      );
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{task ? "Editar tarea" : "Nueva tarea"}</DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <TextField
            label="¿De qué trata la tarea?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={3}
          />

          <ParticipantSelect
            options={employees}
            value={participants}
            onChange={setParticipants}
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Inicio"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Fin"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startsAt } }}
            />
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={saving}>
          {saving ? "Guardando..." : task ? "Guardar cambios" : "Crear tarea"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
