import { AccessTimeRounded } from "@mui/icons-material";
import { Box, Container, Paper, Typography } from "@mui/material";
import ServerAddressForm from "../components/ServerAddressForm";
import { switchServer } from "../serverConfig";
import { t } from "../i18n";

/**
 * First launch of the app: nothing can happen until it knows which server it is
 * talking to.
 *
 * Wears the same shell as the auth screens on purpose - it is effectively the
 * step before signing in, and looking like a different app would read as an
 * error rather than as setup.
 */
export default function ServerSetupPage() {
  return (
    <Box className="auth-shell">
      <Container maxWidth="sm">
        <Paper className="auth-card" elevation={0}>
          <Box className="brand-mark">
            <AccessTimeRounded />
          </Box>

          <Typography variant="h4">{t("server.title")}</Typography>
          <Typography color="text.secondary" sx={{ mb: 4 }}>
            {t("server.intro")}
          </Typography>

          <ServerAddressForm onAccepted={switchServer} />
        </Paper>
      </Container>
    </Box>
  );
}
