import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ROLE_META, ROLE_ORDER, type Role } from "../roles";

type Target = { id: number; employeeNumber: number; name: string; role?: string };

type Props = {
  employee: Target | null;
  onClose: () => void;
  onChanged: (message: string) => void;
};

export default function ChangeRoleDialog({ employee, onClose, onChanged }: Props) {
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!employee) return;
    setRole((employee.role as Role) ?? "EMPLOYEE");
    setError("");
  }, [employee]);

  async function submit() {
    if (!employee) return;
    setError("");
    setSaving(true);
    try {
      await api(`/admin/employees/${employee.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      onChanged(`${employee.name} ahora es ${ROLE_META[role].label}.`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(employee)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Cambiar rol</DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Typography variant="body2" color="text.secondary">
            {employee?.name} · #{employee?.employeeNumber}
          </Typography>

          <FormControl fullWidth>
            <InputLabel>Rol</InputLabel>
            <Select value={role} label="Rol" onChange={(e) => setRole(e.target.value as Role)}>
              {ROLE_ORDER.map((value) => (
                <MenuItem key={value} value={value}>
                  {ROLE_META[value].label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography variant="caption" color="text.secondary">
            {ROLE_META[role].help}
          </Typography>

          <Alert severity="info" variant="outlined">
            El cambio se aplica en su próximo inicio de sesión: la sesión abierta
            conserva los permisos viejos hasta que vuelva a entrar.
          </Alert>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={saving || role === employee?.role}
        >
          {saving ? "Guardando..." : "Guardar rol"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
