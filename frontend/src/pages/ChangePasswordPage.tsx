import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { api } from "../api";

/**
 * Forced password change. Reached right after logging in with a temporary
 * password an admin dictated, and it is a dead end on purpose: every other
 * endpoint answers 403 PASSWORD_CHANGE_REQUIRED until this succeeds, so a
 * temporary password can never be used as a working credential.
 */
export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmation) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    try {
      // The change invalidates every token issued before it, including the one
      // that authorised this request, so the response carries a fresh one.
      const result = await api<{ token: string }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      localStorage.setItem("token", result.token);
      window.location.assign("/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <Box className="auth-shell">
      <Container maxWidth="sm">
        <Paper className="auth-card" elevation={0}>
          <Typography className="eyebrow">SEGURIDAD</Typography>
          <Typography variant="h4">Elegí una contraseña nueva</Typography>
          <Typography color="text.secondary">
            Estás usando una contraseña temporal. Cambiala para poder seguir.
          </Typography>

          <Stack component="form" onSubmit={submit} spacing={2.2} sx={{ mt: 4 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Contraseña temporal"
              type="password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <TextField
              label="Nueva contraseña"
              type="password"
              required
              helperText="Entre 8 y 72 caracteres"
              slotProps={{ htmlInput: { minLength: 8, maxLength: 72 } }}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <TextField
              label="Repetir nueva contraseña"
              type="password"
              required
              slotProps={{ htmlInput: { minLength: 8, maxLength: 72 } }}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            <Button
              type="submit"
              size="large"
              variant="contained"
              disabled={loading}
            >
              {loading ? "Guardando..." : "Guardar y entrar"}
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
