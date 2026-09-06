import { Directory, Filesystem } from "@capacitor/filesystem";
import { FileOpener } from "@capacitor-community/file-opener";
import { isNative } from "../../native/platform";

/** True when PDFs have to go through the OS instead of the page. */
export const usesNativePdf = isNative;

/**
 * Filesystem.writeFile takes base64 text, not a Blob: the payload crosses the
 * JS/native bridge as JSON, so the bytes have to be encoded on the way. The
 * FileReader data URL is the cheapest correct conversion available inside a
 * WebView; only the "data:application/pdf;base64," prefix has to come off.
 */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

/**
 * Saves the report and hands it to whatever the phone uses to read PDFs.
 *
 * Android's WebView has no PDF renderer at all, so the blob-URL iframe the web
 * build previews in is a blank rectangle there, and `<a download>` is ignored
 * outright. Writing the file out and firing an intent is the only way a report
 * is readable on a phone.
 *
 * Directory.Cache rather than Documents: it needs no storage permission on any
 * API level, and these files are disposable views of a report the server can
 * regenerate at any time.
 *
 * FileOpener rather than a hand-rolled intent, because it hands over a
 * FileProvider content:// URI. Passing a raw file:// path to another app throws
 * FileUriExposedException on every modern Android.
 */
export async function openPdfNatively(blob: Blob, filename: string) {
  const { uri } = await Filesystem.writeFile({
    // Prefixed with the time so re-running a report never opens the copy from
    // the previous run, which is indistinguishable from the export failing.
    path: `${Date.now()}-${filename}`,
    data: await toBase64(blob),
    directory: Directory.Cache,
  });

  await FileOpener.open({ filePath: uri, contentType: "application/pdf" });
}
