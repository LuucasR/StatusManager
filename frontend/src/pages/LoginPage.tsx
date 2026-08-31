import { AccessTimeRounded, ArrowForwardRounded } from "@mui/icons-material";
import { Alert, Box, Button, Container, Paper, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { t } from "../i18n";

export default function LoginPage() {
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const data = await api<{ token: string; mustChangePassword?: boolean }>("/auth/login", {
        method: "POST", body: JSON.stringify({ employeeNumber, password }),
      });
      localStorage.setItem("token", data.token);
      // Temporary password from an admin-approved reset: the token is only good
      // for /auth/change-password until it is replaced.
      window.location.assign(data.mustChangePassword ? "/change-password" : "/dashboard");
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  return (
    <Box className="auth-shell">
      <Container maxWidth="lg">
        <Box className="auth-grid">
          <Box className="brand-panel">
            <Box className="brand-mark"><AccessTimeRounded /></Box>
            <Typography className="eyebrow">STATUS MANAGER - Heroic Spirit Games</Typography>
            <Typography variant="h2">{t("auth.brandTagline1")}<br />{t("auth.brandTagline2")}</Typography>
            <Typography color="text.secondary" className="hero-copy">
              {t("auth.heroCopy")}
            </Typography>
          </Box>
          <Paper className="auth-card" elevation={0}>
            <Typography variant="h4">{t("auth.welcome")}</Typography>
            <Typography color="text.secondary">{t("auth.signInHint")}</Typography>
            <Stack component="form" onSubmit={submit} spacing={2.4} sx={{ mt: 4 }}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField label={t("common.employeeNumber")} inputMode="numeric" value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} required />
              <TextField label={t("common.password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Typography align="right" variant="body2">
                <Link to="/forgot-password">{t("auth.forgotPassword")}</Link>
              </Typography>
              <Button type="submit" size="large" variant="contained" endIcon={<ArrowForwardRounded />} disabled={loading}>
                {loading ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
              <Typography align="center" variant="body2">{t("auth.noAccount")} <Link to="/register">{t("auth.requestAccess")}</Link></Typography>
            </Stack>
          </Paper>
        </Box>
      </Container>
    </Box>
  );
}
