// Compress an image File client-side until it fits under `maxBytes`.
// Strategy: scale down the longest edge, then walk JPEG quality down.
// Returns the original File if it already fits, or a new File when compressed.
// Throws when the file is not an image we can decode (caller decides).

export const MAX_ATTACHMENT_BYTES = 100 * 1024; // 100 KB — must match backend.

// MIMEs the browser canvas can decode reliably. HEIC/HEIF are excluded because
// most desktop browsers can't decode them — we detect them separately so the UI
// can give a clear error instead of silently failing.
const COMPRESSIBLE_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/bmp"];
const COMPRESSIBLE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];

function extOf(name: string): string {
  const m = /\.([^.]+)$/.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

/** True if we can probably decode this file in <canvas> and re-encode as JPEG. */
export function isCompressibleImage(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime && COMPRESSIBLE_MIMES.includes(mime)) return true;
  // Some sources (iOS share sheet, drag-from-app) drop the mime — fall back to extension.
  if (!mime || mime === "application/octet-stream") {
    return COMPRESSIBLE_EXTS.includes(extOf(file.name));
  }
  // image/* with an unknown subtype (e.g. tiff) — try anyway, the canvas decode will reject.
  return mime.startsWith("image/") && !mime.includes("heic") && !mime.includes("heif");
}

async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) {
          reject(new Error("Image vide ou format non supporté"));
          return;
        }
        resolve(img);
      };
      img.onerror = () => reject(new Error("Image illisible (format non supporté ?)"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      type,
      quality,
    );
  });
}

export async function compressImageToBudget(
  file: File,
  maxBytes = MAX_ATTACHMENT_BYTES,
): Promise<File> {
  if (file.size <= maxBytes) return file;
  if (!isCompressibleImage(file)) return file;

  const img = await fileToImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  // Aggressive ladder so 12 MP phone photos still land under 100 KB.
  // Cap longest edge progressively; combine with descending JPEG quality.
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const targets = [1600, 1280, 1024, 800, 640, 480, 360, 240, 160];
  const qualities = [0.82, 0.7, 0.6, 0.5, 0.42, 0.35, 0.28, 0.22];
  const outType = "image/jpeg";
  const baseName = (file.name || "image").replace(/\.[^.]+$/, "");

  let best: Blob | null = null;

  for (const target of targets) {
    const scale = Math.min(1, target / longest);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#fff"; // flatten transparency for JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    for (const q of qualities) {
      let blob: Blob;
      try { blob = await canvasToBlob(canvas, outType, q); } catch { continue; }
      if (blob.size <= maxBytes) {
        return new File([blob], `${baseName}.jpg`, { type: outType, lastModified: Date.now() });
      }
      if (!best || blob.size < best.size) best = blob;
    }
    // Early exit: once we're already producing tiny blobs, stop scaling further.
    if (best && best.size <= maxBytes * 1.2 && target <= 320) break;
  }

  if (best) return new File([best], `${baseName}.jpg`, { type: outType, lastModified: Date.now() });
  return file;
}
