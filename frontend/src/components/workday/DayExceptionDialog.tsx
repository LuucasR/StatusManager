import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import { t, tf } from "../../i18n";
import { clearException, saveException, type WorkdayException } from "./workdayApi";

type Props = {
  /** "YYYY-MM-DD", or null when the dialog is closed. */
  date: string | null;
  current: WorkdayException | null;
  /** Falls back to these when the day does not override the hours. */
  defaultStart: string;
  defaultEnd: string;
  onClose: () => void;
  onChanged: () => void;
};

export default function DayExceptionDialog({
  date,
  current,
  defaultStart,
  defaultEnd,
  onClose,
  onChanged,
}: Props) {
  const [working, setWorking] = useState(true);
  const [customHours, setCustomHours] = useState(false);
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Reseeded whenever a different day is opened; without this the dialog would
  // show whatever the previously opened day had.
  useEffect(() => {
    if (!date) return;
    setError("");
    setWorking(current?.working ?? false);
    setCustomHours(Boolean(current?.startTime || current?.endTime));
    setStartTime(current?.startTime ?? defaultStart);
    setEndTime(current?.endTime ?? defaultEnd);
    setLabel(current?.label ?? "");
  }, [date, current, defaultStart, defaultEnd]);

  async function submit() {
    if (!date) return;
    setSaving(true);
    setError("");
    try {
      await saveException(date, {
        working,
        // Hours only mean something on a day that is actually open.
        startTime: working && customHours ? startTime : null,
        endTime: working && customHours ? endTime : null,
        label: label.trim() || null,
      });
      onChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    if (!date) return;
    setSaving(true);
    setError("");
    try {
      await clearException(date);
      onChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(date)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{date ? tf("workday.editDay", { date }) : ""}</DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <FormControlLabel
            control={
              <Switch checked={working} onChange={(e) => setWorking(e.target.checked)} />
            }
            label={t("workday.isWorking")}
          />

          {working && (
            <FormControlLabel
              control={
                <Switch
                  checked={customHours}
                  onChange={(e) => setCustomHours(e.target.checked)}
                />
              }
              label={t("workday.customHours")}
            />
          )}

          {working && customHours && (
            <Stack direction="row" spacing={2}>
              <TextField
                label={t("workday.startTime")}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label={t("workday.endTime")}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
          )}

          <TextField
            label={t("workday.label")}
            placeholder={t("workday.labelPlaceholder")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        {/* Only offered when there is something to clear. */}
        {current && (
          <Button color="error" disabled={saving} onClick={() => void clear()}>
            {t("workday.clearDay")}
          </Button>
        )}
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={saving} onClick={() => void submit()}>
          {saving ? t("common.saving") : t("common.saveChange")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
