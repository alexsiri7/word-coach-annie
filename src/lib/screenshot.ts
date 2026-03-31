/**
 * Captures the current page as a canvas using html2canvas.
 * Returns a canvas element that can be used for annotation.
 */
export async function captureScreenshot(): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(document.body, {
    useCORS: true,
    logging: false,
    // Scale down to keep file sizes reasonable
    scale: Math.min(window.devicePixelRatio, 2),
    // Ignore the feedback dialog itself
    ignoreElements: (el) => {
      return el.getAttribute("role") === "dialog" ||
        el.getAttribute("data-radix-portal") !== null;
    },
  });
  return canvas;
}

/**
 * Converts a canvas to a compressed JPEG data URL.
 */
export function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  quality = 0.85
): string {
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Extracts the base64 content from a data URL (strips the prefix).
 */
export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(",")[1];
}
