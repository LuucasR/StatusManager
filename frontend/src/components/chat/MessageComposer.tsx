import { LockOutlined, SendRounded } from "@mui/icons-material";
import { Box, IconButton, Stack, TextField, Typography } from "@mui/material";
import { useState, type KeyboardEvent } from "react";

type Props = {
  disabled?: boolean;
  /** Motivo del bloqueo; si viene, reemplaza al campo de texto. */
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
    // Se limpia antes: el envío es optimista y así se puede seguir escribiendo.
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
    // isComposing: sin esto, confirmar un acento o un IME con Enter manda el
    // mensaje a medio escribir. En español pasa todo el tiempo.
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
          placeholder="Escribí un mensaje…"
          multiline
          maxRows={4}
          size="small"
          disabled={disabled}
        />
        <IconButton
          color="primary"
          onClick={() => void submit()}
          disabled={disabled || !body.trim()}
          aria-label="Enviar mensaje"
        >
          <SendRounded />
        </IconButton>
      </Stack>
    </Box>
  );
}
