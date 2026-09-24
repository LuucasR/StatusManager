import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { useEffect, useState, type ChangeEvent } from "react";
import { t } from "../../i18n";
import type { Utility, UtilityInput } from "./downloadsApi";

type Props = {
  open: boolean;
  /** null = new download. */
  utility: Utility | null;
  onClose: () => void;
  onSubmit: (input: UtilityInput) => Promise<void>;
};

const EMPTY: UtilityInput = {
  name: "",
  description: "",
  version: "",
  url: "",
  sizeLabel: "",
  platform: "",
  position: 0,
};

export default function UtilityDialog({ open, utility, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<UtilityInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(
      utility
        ? {
            name: utility.name,
            description: utility.description,
            version: utility.version,
            url: utility.url,
            sizeLabel: utility.sizeLabel,
            platform: utility.platform,
            position: utility.position,
          }
        : EMPTY
    );
    setError("");
  }, [open, utility]);

  const set = (field: keyof UtilityInput) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({
      ...current,
      [field]: field === "position" ? Number(event.target.value) || 0 : event.target.value,
    }));

  const url = form.url.trim();
  // Mirrors the backend schema, which enforces it regardless.
  const valid = form.name.trim().length > 0 && url.startsWith("https://");

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        version: form.version.trim(),
        url,
        sizeLabel: form.sizeLabel.trim(),
        platform: form.platform.trim(),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{utility ? t("downloads.edit") : t("downloads.new")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label={t("downloads.name")}
            value={form.name}
            onChange={set("name")}
            slotProps={{ htmlInput: { maxLength: 120 } }}
            autoFocus
            required
          />
          <TextField
            label={t("downloads.url")}
            value={form.url}
            onChange={set("url")}
            placeholder="https://"
            helperText={t("downloads.urlHelp")}
            error={url.length > 0 && !url.startsWith("https://")}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
            required
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label={t("downloads.version")}
              value={form.version}
              onChange={set("version")}
              slotProps={{ htmlInput: { maxLength: 40 } }}
              fullWidth
            />
            <TextField
              label={t("downloads.platform")}
              value={form.platform}
              onChange={set("platform")}
              placeholder="Windows"
              slotProps={{ htmlInput: { maxLength: 40 } }}
              fullWidth
            />
            <TextField
              label={t("downloads.size")}
              value={form.sizeLabel}
              onChange={set("sizeLabel")}
              placeholder="850 MB"
              slotProps={{ htmlInput: { maxLength: 40 } }}
              fullWidth
            />
          </Stack>
          <TextField
            label={t("downloads.description")}
            value={form.description}
            onChange={set("description")}
            multiline
            minRows={3}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
          />
          <TextField
            label={t("downloads.position")}
            type="number"
            value={form.position}
            onChange={set("position")}
            helperText={t("downloads.positionHelp")}
            slotProps={{ htmlInput: { min: 0, max: 10000 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" onClick={submit} disabled={saving || !valid}>
          {saving ? t("common.saving") : t("downloads.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
