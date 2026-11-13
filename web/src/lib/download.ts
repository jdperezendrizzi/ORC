// Descargar un archivo generado en el navegador (siempre lo guarda, en el
// celular y en la compu), y escudo para los PDF.

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function crestDataUrl(): Promise<string | null> {
  try {
    const blob = await (await fetch("/crest.png")).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Comparte el archivo con el menú del sistema; si no se puede, lo descarga. */
export async function shareOrDownload(file: File, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return "shared";
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
  }
  downloadBlob(file, file.name);
  return "downloaded";
}
