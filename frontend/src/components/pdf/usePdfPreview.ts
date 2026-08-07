import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Descarga un PDF protegido y lo deja listo para un <iframe>.
 *
 * Existe una copia inline de esta lógica en pages/DashboardPage.tsx (~305-345),
 * pendiente de migrar: allá `openPdfPreview` además hace setError() y cierra su
 * diálogo de configuración, así que no es un lift-and-shift.
 *
 * Dos diferencias a favor de esta versión:
 *  - la URL viva se guarda en un ref: leerla del closure dentro de un
 *    useCallback capturaría estado viejo y dejaría el blob anterior sin revocar;
 *  - revoca al desmontar (el dashboard no lo hace y filtra el blob al navegar).
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

  /** Propaga el error con throw: quien llama decide qué hacer (401, alert...). */
  const open = useCallback(
    async (target: string, name: string) => {
      setLoading(true);
      try {
        const response = await fetch(target, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message ?? "No se pudo generar el PDF");
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
