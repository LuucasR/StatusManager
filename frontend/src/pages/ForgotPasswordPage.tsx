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
import { Link } from "react-router-dom";
import { api } from "../api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
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
      const result = await api<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email, password }),
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
          <Typography className="eyebrow">RECUPERAR ACCESO</Typography>
          <Typography variant="h4">¿Olvidaste tu contraseña?</Typography>
          <Typography color="text.secondary">
            Ingresá el email de tu cuenta y elegí la contraseña nueva. Un
            administrador revisará la solicitud.
          </Typography>

          <Stack component="form" onSubmit={submit} spacing={2.2} sx={{ mt: 4 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {message && <Alert severity="success">{message}</Alert>}
            <TextField
              label="Email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <TextField
              label="Nueva contraseña"
              type="password"
              required
              helperText="Entre 8 y 72 caracteres"
              slotProps={{
                htmlInput: { minLength: 8, maxLength: 72 },
              }}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <TextField
              label="Repetir nueva contraseña"
              type="password"
              required
              slotProps={{
                htmlInput: { minLength: 8, maxLength: 72 },
              }}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            <Button
              type="submit"
              size="large"
              variant="contained"
              disabled={loading}
            >
              {loading ? "Enviando..." : "Enviar solicitud"}
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
