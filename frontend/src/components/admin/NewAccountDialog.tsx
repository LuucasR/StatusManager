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
import { t } from "../../i18n";

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
    if (name.trim().length < 2) return setError(t("account.nameRequired"));
    if (!email.trim()) return setError(t("account.emailRequired"));
    if (password.length < 8) return setError(t("account.passwordTooShort"));

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
      <DialogTitle>{t("account.newTitle")}</DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label={t("register.fullName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <TextField
            label={t("common.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <TextField
            label={t("account.initialPassword")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText={t("account.passwordHint")}
          />

          <FormControl fullWidth>
            <InputLabel>{t("common.role")}</InputLabel>
            <Select value={role} label={t("common.role")} onChange={(e) => setRole(e.target.value as Role)}>
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
          {saving ? t("account.creating") : t("account.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
