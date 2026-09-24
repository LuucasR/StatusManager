import { AddRounded, DeleteRounded, DownloadRounded, EditRounded } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { isAdminRole } from "../components/roles";
import type { AppOutletContext } from "../layouts/AppLayout";
import { t } from "../i18n";
import { useOnReconnect, useSocketEvent } from "../realtime/useSocketEvent";
import UtilityDialog from "../components/downloads/UtilityDialog";
import {
  createUtility,
  deleteUtility,
  listUtilities,
  updateUtility,
  type Utility,
  type UtilityInput,
} from "../components/downloads/downloadsApi";

/**
 * Company tools. Everyone downloads; admins keep the list. The download is a
 * plain link to wherever the installer is hosted, so the browser (or, in the
 * Android app, the system browser) streams it straight from there rather than
 * buffering a ~1 GB file in memory the way the PDF previews do.
 */
export default function DownloadsPage() {
  const { me } = useOutletContext<AppOutletContext>();
  const admin = isAdminRole(me?.role);

  const [utilities, setUtilities] = useState<Utility[] | null>(null);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Utility | null>(null);

  const load = useCallback(async () => {
    try {
      setUtilities(await listUtilities());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSocketEvent("downloads:changed", () => void load());
  useOnReconnect(() => void load());

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(utility: Utility) {
    setEditing(utility);
    setDialogOpen(true);
  }

  async function submit(input: UtilityInput) {
    if (editing) await updateUtility(editing.id, input);
    else await createUtility(input);
    setDialogOpen(false);
    await load();
  }

  async function remove(utility: Utility) {
    if (!window.confirm(t("downloads.confirmDelete"))) return;
    try {
      await deleteUtility(utility.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // The role decides the edit controls, so wait for it rather than flash the
  // employee view at an admin.
  if (!me || !utilities) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        {error ? <Alert severity="error">{error}</Alert> : <CircularProgress />}
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">{t("downloads.eyebrow")}</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("downloads.title")}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {admin ? t("downloads.subtitleAdmin") : t("downloads.subtitle")}
          </Typography>
        </Box>
        {admin && (
          <Button variant="contained" startIcon={<AddRounded />} onClick={openNew}>
            {t("downloads.add")}
          </Button>
        )}
      </Box>

      {utilities.length === 0 ? (
        <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
          <Typography color="text.secondary">{t("downloads.empty")}</Typography>
        </Paper>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            mt: 3,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
          }}
        >
          {utilities.map((utility) => (
            <Paper
              key={utility.id}
              className="status-card"
              elevation={0}
              sx={{ p: 3, display: "flex", flexDirection: "column", gap: 1.5 }}
            >
              <Stack direction="row" sx={{ alignItems: "flex-start", gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, flex: 1, wordBreak: "break-word" }}>
                  {utility.name}
                </Typography>
                {admin && (
                  <Stack direction="row">
                    <Tooltip title={t("common.edit")}>
                      <IconButton size="small" onClick={() => openEdit(utility)}>
                        <EditRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("common.delete")}>
                      <IconButton size="small" onClick={() => void remove(utility)}>
                        <DeleteRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                )}
              </Stack>

              {(utility.version || utility.platform || utility.sizeLabel) && (
                <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                  {utility.version && <Chip size="small" label={utility.version} />}
                  {utility.platform && <Chip size="small" variant="outlined" label={utility.platform} />}
                  {utility.sizeLabel && <Chip size="small" variant="outlined" label={utility.sizeLabel} />}
                </Stack>
              )}

              {utility.description && (
                <Typography color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                  {utility.description}
                </Typography>
              )}

              <Button
                variant="contained"
                startIcon={<DownloadRounded />}
                component="a"
                href={utility.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ mt: "auto", alignSelf: "flex-start" }}
              >
                {t("downloads.download")}
              </Button>
            </Paper>
          ))}
        </Box>
      )}

      {admin && (
        <UtilityDialog
          open={dialogOpen}
          utility={editing}
          onClose={() => setDialogOpen(false)}
          onSubmit={submit}
        />
      )}
    </Container>
  );
}
