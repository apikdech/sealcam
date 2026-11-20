// Bounds a photo's size before QR decoding: big phone photos would otherwise
// need a 100-200 MB canvas, and iOS Safari draws canvases above ~16.7 M px blank.

/** Size that fits `max` on the long side, keeping the aspect ratio; never upscales. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const k = max / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
