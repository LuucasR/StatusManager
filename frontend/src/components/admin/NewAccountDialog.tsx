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
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ROLE_META, ROLE_ORDER, type Role } from "../roles";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (message: string) => void;
};

export default function NewAccountDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPassword("");
    setRole("EMPLOYEE");
    setError("");
  }, [open]);

  async function submit() {
    setError("");
    if (name.trim().length < 2) return setError("Ingresá el nombre completo");
    if (!email.trim()) return setError("Ingresá un email");
    if (password.length < 8) return setError("La contraseña necesita al menos 8 caracteres");

    setSaving(true);
    try {
      const created = await api<{ employeeNumber: number; name: string }>("/admin/employees", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      });
      onCreated(
        `Cuenta creada: ${created.name} · legajo #${created.employeeNumber}. Pasale el legajo y la contraseña.`
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
      <DialogTitle>Nueva cuenta</DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Nombre completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <TextField
            label="Contraseña inicial"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText="Mínimo 8 caracteres. Se la tenés que pasar vos: la app no manda mails."
          />

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
            El legajo se asigna solo, y la cuenta queda activa: no hace falta aprobarla.
          </Alert>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={saving}>
          {saving ? "Creando..." : "Crear cuenta"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
