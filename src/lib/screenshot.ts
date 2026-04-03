import { toCanvas } from "html-to-image";

/**
 * Captures the current page as a canvas using html-to-image.
 * Returns a canvas element that can be used for annotation.
 */
export async function captureScreenshot(): Promise<HTMLCanvasElement> {
  const canvas = await toCanvas(document.body, {
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    filter: (el: Element) => {
      // Ignore the feedback dialog and Radix portals
      if (el.getAttribute?.("role") === "dialog") return false;
      if (el.getAttribute?.("data-radix-portal") !== null && el.hasAttribute?.("data-radix-portal")) return false;
      return true;
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
