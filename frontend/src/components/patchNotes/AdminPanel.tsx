import { LockOpenRounded, LockRounded, PictureAsPdfRounded, PublicRounded, RocketLaunchRounded, UndoRounded } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { t, tf } from "../../i18n";
import {
  formatMs,
  type PatchWeek,
  type PatchWeekStatus,
  type WeekInsights,
} from "./patchNotesApi";

type Props = {
  week: PatchWeek;
  insights: WeekInsights | null;
  pdfLoading: boolean;
  onSaveHeader: (patch: { title: string | null; summary: string; version: string | null }) => Promise<void>;
  onStatus: (status: PatchWeekStatus) => Promise<void>;
  onPdf: (mode: "internal" | "public") => void;
};

/** Staff review: header, workflow, what is missing, team time and the PDFs. */
export default function AdminPanel({ week, insights, pdfLoading, onSaveHeader, onStatus, onPdf }: Props) {
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seeded whenever another tab (or the realtime refresh) changes the week.
  useEffect(() => {
    setTitle(week.title ?? "");
    setVersion(week.version ?? "");
    setSummary(week.summary);
  }, [week.weekStart, week.title, week.version, week.summary]);

  const published = week.status === "PUBLISHED";
  const dirty =
    title !== (week.title ?? "") || version !== (week.version ?? "") || summary !== week.summary;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
        {t("patchNotes.adminTitle")}
      </Typography>

      <Stack spacing={2}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label={t("patchNotes.version")}
            placeholder="v0.4.2"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            disabled={published}
            sx={{ width: { sm: 180 } }}
          />
          <TextField
            label={t("patchNotes.weekTitle")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={published}
            fullWidth
          />
        </Stack>
        <TextField
          label={t("patchNotes.summary")}
          placeholder={t("patchNotes.summaryPlaceholder")}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          disabled={published}
          multiline
          minRows={3}
        />

        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          <Button
            variant="contained"
            disabled={!dirty || busy || published}
            onClick={() =>
              run(() => onSaveHeader({ title: title.trim() || null, summary, version: version.trim() || null }))
            }
          >
            {busy ? t("common.saving") : t("patchNotes.saveHeader")}
          </Button>

          {week.status === "DRAFT" && (
            <Button startIcon={<LockRounded />} disabled={busy} onClick={() => run(() => onStatus("CLOSED"))}>
              {t("patchNotes.closeWeek")}
            </Button>
          )}
          {week.status === "CLOSED" && (
            <>
              <Button startIcon={<LockOpenRounded />} disabled={busy} onClick={() => run(() => onStatus("DRAFT"))}>
                {t("patchNotes.reopenWeek")}
              </Button>
              <Button
                variant="contained"
                color="success"
                startIcon={<RocketLaunchRounded />}
                disabled={busy || dirty || !week.version}
                onClick={() => run(() => onStatus("PUBLISHED"))}
              >
                {t("patchNotes.publish")}
              </Button>
            </>
          )}
          {published && (
            <Button startIcon={<UndoRounded />} disabled={busy} onClick={() => run(() => onStatus("CLOSED"))}>
              {t("patchNotes.unpublish")}
            </Button>
          )}

          <Box sx={{ flex: 1 }} />

          <Button startIcon={<PictureAsPdfRounded />} disabled={pdfLoading} onClick={() => onPdf("internal")}>
            {t("patchNotes.pdfInternal")}
          </Button>
          <Button startIcon={<PublicRounded />} disabled={pdfLoading} onClick={() => onPdf("public")}>
            {t("patchNotes.pdfPublic")}
          </Button>
        </Stack>
        {week.status === "CLOSED" && !week.version && (
          <Typography variant="body2" color="text.secondary">
            {t("patchNotes.versionNeeded")}
          </Typography>
        )}

        {insights && insights.missingAuthors.length > 0 && (
          <Alert severity="warning">
            {tf("patchNotes.missingAuthors", {
              names: insights.missingAuthors.map((person) => person.name).join(", "),
            })}
          </Alert>
        )}
        {insights && insights.undocumentedTasks.length > 0 && (
          <Alert severity="info">
            {tf("patchNotes.undocumentedTasks", {
              tasks: insights.undocumentedTasks.map((task) => task.title).join(", "),
            })}
          </Alert>
        )}

        {insights && (
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              {t("patchNotes.timePerTask")}
            </Typography>
            {insights.taskTimes.length === 0 ? (
              <Typography color="text.secondary">{t("patchNotes.noTime")}</Typography>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t("common.task")}</TableCell>
                      <TableCell>{t("patchNotes.who")}</TableCell>
                      <TableCell align="right">{t("common.duration")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {insights.taskTimes.map((task) => (
                      <TableRow key={task.key}>
                        <TableCell>
                          {task.taskId != null ? `#${task.taskId} ` : ""}
                          {task.title}
                          {insights.undocumentedTasks.some((missing) => missing.key === task.key) && (
                            <Chip size="small" label={t("patchNotes.noNotes")} sx={{ ml: 1 }} />
                          )}
                        </TableCell>
                        <TableCell>
                          {task.byEmployee.map((person) => `${person.name} ${formatMs(person.ms)}`).join(", ")}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                          {formatMs(task.totalMs)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Paper>
  );
}
