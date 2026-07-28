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
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmation) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    try {
      const result = await api<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setMessage(result.message);
      setPassword("");
      setConfirmation("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box className="auth-shell">
      <Container maxWidth="sm">
        <Paper className="auth-card" elevation={0}>
          <Typography className="eyebrow">NUEVA CONTRASEÑA</Typography>
          <Typography variant="h4">Restablecé tu acceso</Typography>
          <Typography color="text.secondary">
            Elegí una contraseña de al menos 8 caracteres.
          </Typography>

          <Stack component="form" onSubmit={submit} spacing={2.2} sx={{ mt: 4 }}>
            {!token && (
              <Alert severity="error">
                El enlace de recuperación no contiene un token válido.
              </Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {message && <Alert severity="success">{message}</Alert>}
            <TextField
              label="Nueva contraseña"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              helperText="Mínimo 8 caracteres"
            />
            <TextField
              label="Repetir contraseña"
              type="password"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            <Button
              type="submit"
              size="large"
              variant="contained"
              disabled={
                loading ||
                !token ||
                password.length < 8 ||
                confirmation.length < 8
              }
            >
              {loading ? "Actualizando..." : "Cambiar contraseña"}
            </Button>
            <Typography align="center" variant="body2">
              <Link to="/">Volver al inicio de sesión</Link>
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
