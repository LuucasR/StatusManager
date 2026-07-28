import { Alert, Box, Button, Container, Paper, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const result = await api<{ employee: { employeeNumber: number } }>("/auth/register", { method: "POST", body: JSON.stringify(form) });
      setMessage(`Solicitud enviada. Tu número de empleado es ${result.employee.employeeNumber}. Podrás ingresar cuando un administrador apruebe tu cuenta.`);
      setForm({ name: "", email: "", password: "" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Box className="auth-shell"><Container maxWidth="sm"><Paper className="auth-card" elevation={0}>
      <Typography className="eyebrow">NUEVA CUENTA</Typography><Typography variant="h4">Solicitá tu acceso</Typography>
      <Typography color="text.secondary">Un administrador revisará y aprobará el alta.</Typography>
      <Stack component="form" onSubmit={submit} spacing={2.2} sx={{ mt: 4 }}>
        {error && <Alert severity="error">{error}</Alert>}{message && <Alert severity="success">{message}</Alert>}
        <TextField label="Nombre completo" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <TextField label="Contraseña" type="password" helperText="Mínimo 8 caracteres" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Button type="submit" size="large" variant="contained" disabled={loading}>
          {loading ? "Enviando..." : "Enviar solicitud"}
        </Button>
        <Typography align="center" variant="body2"><Link to="/">Volver al inicio</Link></Typography>
      </Stack>
    </Paper></Container></Box>
  );
}
