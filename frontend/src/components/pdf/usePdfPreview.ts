import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { openPdfNatively, usesNativePdf } from "./pdfFile";

/**
 * Downloads a protected PDF and leaves it ready for an <iframe>.
 *
 * On Android there is no iframe to leave it ready for: the WebView cannot
 * render a PDF and ignores <a download>, so the blob URL is useless. That fork
 * lives here, in the one place both report screens already share, rather than
 * in each of them - `url` simply stays empty on native and the preview dialog,
 * which opens on Boolean(url), never appears.
 *
 * Two details worth keeping:
 *  - the live URL is kept in a ref: reading it from the closure inside a
 *    useCallback would capture stale state and leave the previous blob unrevoked;
 *  - it revokes on unmount.
 */
export function usePdfPreview() {
  const [url, setUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const urlRef = useRef("");
  // Kept so download() can re-open the report on native without paying for a
  // second round trip to the server.
  const blobRef = useRef<Blob | null>(null);

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
        blobRef.current = blob;
        setFilename(name);

        // Straight to the OS viewer: there is nothing on the phone that can
        // display it in-page, so a preview dialog would only be a blank box.
        if (usesNativePdf()) {
          await openPdfNatively(blob, name);
          return;
        }

        revoke();
        const href = URL.createObjectURL(blob);
        urlRef.current = href;
        setUrl(href);
      } finally {
        setLoading(false);
      }
    },
    [revoke]
  );

  const close = useCallback(() => {
    revoke();
    blobRef.current = null;
    setUrl("");
    setFilename("");
  }, [revoke]);

  const download = useCallback(() => {
    if (usesNativePdf()) {
      // Already written out by open(); this just shows it again.
      if (blobRef.current) void openPdfNatively(blobRef.current, filename);
      return;
    }
    if (!urlRef.current) return;
    const anchor = document.createElement("a");
    anchor.href = urlRef.current;
    anchor.download = filename;
    anchor.click();
  }, [filename]);

  return { url, filename, loading, open, close, download };
}
