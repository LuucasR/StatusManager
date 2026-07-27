import { AccessTimeRounded, ArrowForwardRounded } from "@mui/icons-material";
import { Alert, Box, Button, Container, Paper, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function LoginPage() {
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const data = await api<{ token: string }>("/auth/login", {
        method: "POST", body: JSON.stringify({ employeeNumber, password }),
      });
      localStorage.setItem("token", data.token);
      window.location.assign("/dashboard");
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  return (
    <Box className="auth-shell">
      <Container maxWidth="lg">
        <Box className="auth-grid">
          <Box className="brand-panel">
            <Box className="brand-mark"><AccessTimeRounded /></Box>
            <Typography className="eyebrow">STATUS MANAGER - Heroic Spirit Games</Typography>
            <Typography variant="h2">Tu jornada,<br />en tiempo real.</Typography>
            <Typography color="text.secondary" className="hero-copy">
             Registrá tu actividad, mantenete en contacto con tu equipo y accedé a tu historial desde cualquier dispositivo.
            </Typography>
          </Box>
          <Paper className="auth-card" elevation={0}>
            <Typography variant="h4">Bienvenido</Typography>
            <Typography color="text.secondary">Ingresá con los datos que te asignó tu administrador.</Typography>
            <Stack component="form" onSubmit={submit} spacing={2.4} sx={{ mt: 4 }}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField label="Número de empleado" inputMode="numeric" value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} required />
              <TextField label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Button type="submit" size="large" variant="contained" endIcon={<ArrowForwardRounded />} disabled={loading}>
                {loading ? "Ingresando…" : "Iniciar sesión"}
              </Button>
              <Typography align="center" variant="body2">¿Todavía no tenés cuenta? <Link to="/registro">Solicitar acceso</Link></Typography>
            </Stack>
          </Paper>
        </Box>
      </Container>
    </Box>
  );
}
