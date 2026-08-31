import { DownloadRounded } from "@mui/icons-material";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import { t } from "../../i18n";

type Props = {
  url: string;
  title?: string;
  onClose: () => void;
  onDownload: () => void;
};

export default function PdfPreviewDialog({ url, title, onClose, onDownload }: Props) {
  const heading = title ?? t("pdf.previewTitle");
  return (
    <Dialog open={Boolean(url)} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{heading}</DialogTitle>

      <DialogContent sx={{ p: { xs: 1, sm: 2 } }}>
        <Box
          component="iframe"
          title={heading}
          src={url}
          sx={{
            width: "100%",
            height: { xs: "68vh", md: "76vh" },
            border: 0,
            borderRadius: 1,
            bgcolor: "grey.100",
          }}
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button variant="contained" startIcon={<DownloadRounded />} onClick={onDownload}>
          {t("pdf.download")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
