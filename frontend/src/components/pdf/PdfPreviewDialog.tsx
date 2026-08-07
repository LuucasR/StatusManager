import { DownloadRounded } from "@mui/icons-material";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";

type Props = {
  url: string;
  title?: string;
  onClose: () => void;
  onDownload: () => void;
};

export default function PdfPreviewDialog({ url, title = "Previsualización", onClose, onDownload }: Props) {
  return (
    <Dialog open={Boolean(url)} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{title}</DialogTitle>

      <DialogContent sx={{ p: { xs: 1, sm: 2 } }}>
        <Box
          component="iframe"
          title={title}
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
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="contained" startIcon={<DownloadRounded />} onClick={onDownload}>
          Descargar PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}
