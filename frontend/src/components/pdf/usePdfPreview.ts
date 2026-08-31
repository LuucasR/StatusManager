import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../i18n";

/**
 * Downloads a protected PDF and leaves it ready for an <iframe>.
 *
 * An inline copy of this logic still lives in pages/DashboardPage.tsx, pending
 * migration: there `openPdfPreview` also calls setError() and closes its own
 * configuration dialog, so it is not a lift-and-shift.
 *
 * Two differences in this version's favour:
 *  - the live URL is kept in a ref: reading it from the closure inside a
 *    useCallback would capture stale state and leave the previous blob unrevoked;
 *  - it revokes on unmount (the dashboard does not, and leaks the blob on navigate).
 */
export function usePdfPreview() {
  const [url, setUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const urlRef = useRef("");

  const revoke = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
  }, []);

  useEffect(() => revoke, [revoke]);

  /** Rethrows: the caller decides what to do (401, alert...). */
  const open = useCallback(
    async (target: string, name: string) => {
      setLoading(true);
      try {
        const response = await fetch(target, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message ?? t("pdf.failed"));
        }

        const blob = await response.blob();
        revoke();
        const href = URL.createObjectURL(blob);
        urlRef.current = href;
        setUrl(href);
        setFilename(name);
      } finally {
        setLoading(false);
      }
    },
    [revoke]
  );

  const close = useCallback(() => {
    revoke();
    setUrl("");
    setFilename("");
  }, [revoke]);

  const download = useCallback(() => {
    if (!urlRef.current) return;
    const anchor = document.createElement("a");
    anchor.href = urlRef.current;
    anchor.download = filename;
    anchor.click();
  }, [filename]);

  return { url, filename, loading, open, close, download };
}
