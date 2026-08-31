import { Alert, Box, Button, Container, Paper, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { t, tf } from "../i18n";

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
      setMessage(tf("register.submitted", { number: result.employee.employeeNumber }));
      setForm({ name: "", email: "", password: "" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Box className="auth-shell"><Container maxWidth="sm"><Paper className="auth-card" elevation={0}>
      <Typography className="eyebrow">{t("register.eyebrow")}</Typography><Typography variant="h4">{t("register.title")}</Typography>
      <Typography color="text.secondary">{t("register.subtitle")}</Typography>
      <Stack component="form" onSubmit={submit} spacing={2.2} sx={{ mt: 4 }}>
        {error && <Alert severity="error">{error}</Alert>}{message && <Alert severity="success">{message}</Alert>}
        <TextField label={t("register.fullName")} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField label={t("common.email")} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <TextField label={t("common.password")} type="password" helperText={t("register.passwordHint")} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Button type="submit" size="large" variant="contained" disabled={loading}>
          {loading ? t("common.sending") : t("register.submit")}
        </Button>
        <Typography align="center" variant="body2"><Link to="/">{t("register.backHome")}</Link></Typography>
      </Stack>
    </Paper></Container></Box>
  );
}
