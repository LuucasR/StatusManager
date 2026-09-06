import { Alert, Button, Stack, TextField } from "@mui/material";
import { useState } from "react";
import { checkServer, type ServerCheck } from "../serverConfig";
import { t, type TranslationKey } from "../i18n";

/**
 * Maps a rejection to a catalogue key rather than to wording, the same rule the
 * API errors follow: the message can be reworded without touching this file.
 */
const PROBLEM_KEYS = {
  "invalid-url": "server.invalidUrl",
  unreachable: "server.unreachable",
  "not-a-server": "server.notAServer",
  "database-down": "server.databaseDown",
} as const satisfies Record<Exclude<ServerCheck, "ok">, TranslationKey>;

type Props = {
  /** Receives the normalised address once it has answered. */
  onAccepted: (url: string) => void;
  initialValue?: string;
};

/**
 * Asks for a server address and refuses to hand back one that does not answer.
 *
 * Shared by the first-launch screen and the settings dialog so the validation
 * and the keyboard handling exist once - the two entry points differ only in
 * what surrounds them.
 */
export default function ServerAddressForm({ onAccepted, initialValue = "" }: Props) {
  const [value, setValue] = useState(initialValue);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<Exclude<ServerCheck, "ok"> | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setProblem(null);
    setChecking(true);
    try {
      const { result, url } = await checkServer(value);
      // Narrowed in this order so the failure branch keeps "ok" out of the
      // problem state; checkServer only omits the url when it did not succeed.
      if (result !== "ok") {
        setProblem(result);
        return;
      }
      if (url) onAccepted(url);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Stack component="form" onSubmit={submit} spacing={2.2}>
      {problem && <Alert severity="error">{t(PROBLEM_KEYS[problem])}</Alert>}

      <TextField
        label={t("server.field")}
        helperText={t("server.hint")}
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
        // Android keyboards capitalise and autocorrect the first word by
        // default, which quietly turns an address into something unresolvable.
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <Button type="submit" size="large" variant="contained" disabled={checking}>
        {checking ? t("server.checking") : t("server.connect")}
      </Button>
    </Stack>
  );
}
