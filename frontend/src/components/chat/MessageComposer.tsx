import { LockOutlined, SendRounded } from "@mui/icons-material";
import { Box, IconButton, Stack, TextField, Typography } from "@mui/material";
import { useState, type KeyboardEvent } from "react";
import { t } from "../../i18n";

type Props = {
  disabled?: boolean;
  /** Reason it is blocked; when present, it replaces the text field. */
  blockedReason?: string | null;
  onSend: (body: string) => Promise<void>;
};

export default function MessageComposer({ disabled, blockedReason, onSend }: Props) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    // Cleared first: sending is optimistic, so typing can continue right away.
    setBody("");
    try {
      await onSend(text);
    } catch {
      setBody(text);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // isComposing: without this, confirming an accent or an IME with Enter sends
    // the half-written message. In Spanish that happens constantly.
    if (event.key !== "Enter" || event.shiftKey) return;
    if ((event.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return;
    event.preventDefault();
    void submit();
  }

  if (blockedReason) {
    return (
      <Stack direction="row" spacing={1} className="chat-blocked">
        <LockOutlined sx={{ fontSize: 18, color: "#8a5a10", flex: "none" }} />
        <Typography variant="caption" sx={{ color: "#8a5a10" }}>
          {blockedReason}
        </Typography>
      </Stack>
    );
  }

  return (
    <Box className="chat-composer">
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-end" }}>
        <TextField
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("chat.composerPlaceholder")}
          multiline
          maxRows={4}
          size="small"
          disabled={disabled}
        />
        <IconButton
          color="primary"
          onClick={() => void submit()}
          disabled={disabled || !body.trim()}
          aria-label={t("chat.send")}
        >
          <SendRounded />
        </IconButton>
      </Stack>
    </Box>
  );
}
