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
import { t } from "../i18n";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      // Email only. This form used to ask for the password the employee wanted,
      // which the backend then stored unhashed and showed to the admin. The
      // admin now generates a temporary one and dictates it.
      const result = await api<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
      setEmail("");
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
          <Typography className="eyebrow">{t("forgot.eyebrow")}</Typography>
          <Typography variant="h4">{t("auth.forgotPassword")}</Typography>
          <Typography color="text.secondary">
            {t("forgot.subtitle")}
          </Typography>

          <Stack component="form" onSubmit={submit} spacing={2.2} sx={{ mt: 4 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {message && <Alert severity="success">{message}</Alert>}
            <TextField
              label={t("common.email")}
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button
              type="submit"
              size="large"
              variant="contained"
              disabled={loading}
            >
              {loading ? t("common.sending") : t("register.submit")}
            </Button>
            <Typography align="center" variant="body2">
              <Link to="/">{t("auth.backToSignIn")}</Link>
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
