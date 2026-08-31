import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../../api";
import type { TaskParticipant } from "../tasks/types";
import { t } from "../../i18n";

type Props = {
  open: boolean;
  meId?: number;
  onClose: () => void;
  onPick: (employeeId: number) => Promise<void>;
};

export default function NewDirectDialog({ open, meId, onClose, onPick }: Props) {
  const [employees, setEmployees] = useState<TaskParticipant[]>([]);
  const [selected, setSelected] = useState<TaskParticipant | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    // Same address book the board uses.
    api<TaskParticipant[]>("/activities/team")
      .then((team) => setEmployees(team.filter((e) => e.id !== meId)))
      .catch(() => setEmployees([]));
  }, [open, meId]);

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    try {
      await onPick(selected.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("chat.newMessage")}</DialogTitle>
      <DialogContent>
        <Autocomplete
          options={employees}
          value={selected}
          onChange={(_, value) => setSelected(value)}
          getOptionLabel={(option) => `#${option.employeeNumber} - ${option.name}`}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          renderInput={(params) => (
            <TextField {...params} label={t("common.employee")} placeholder={t("chat.searchEmployee")} autoFocus sx={{ mt: 1 }} />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={() => void confirm()} disabled={!selected || busy}>
          Abrir chat
        </Button>
      </DialogActions>
    </Dialog>
  );
}
