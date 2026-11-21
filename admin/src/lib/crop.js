// The maths of the photo cropper, kept apart from the UI so it can be tested. Offsets (x, y) are where the photo's top-left corner sits
// inside the frame, in frame pixels (0 or negative); s is the zoom (frame pixels per photo pixel).

/** The largest frame of shape ratio (width / height) that fits inside maxW x maxH. */
export function fitFrame(ratio, maxW, maxH) {
  let w = maxW, h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  return { w, h };
}
/** Smallest zoom at which the photo still covers the whole frame (no empty edges). */
export const minScale = (nw, nh, fw, fh) => Math.max(fw / nw, fh / nh);
/** Keep the photo covering the frame while it is dragged or zoomed. */
export const clampOffset = (x, y, nw, nh, s, fw, fh) => ({ x: Math.min(0, Math.max(fw - nw * s, x)), y: Math.min(0, Math.max(fh - nh * s, y)) });
/** The part of the original photo, in its own pixels, that the frame is showing. */
export const sourceRect = (x, y, s, fw, fh) => ({ sx: 0 - x / s, sy: 0 - y / s, sw: fw / s, sh: fh / s });
/** Size of the saved file: the cropped part at full resolution, but at most `max` pixels on its long side. */
export function outputSize(sw, sh, max = 2400) {
  const k = Math.min(1, max / Math.max(sw, sh));
  return { w: Math.round(sw * k), h: Math.round(sh * k) };
}
/** Zoom about the frame's centre so the middle of what you see stays put. */
export function zoomAt(view, s2, nw, nh, fw, fh) {
  const cx = (fw / 2 - view.x) / view.s, cy = (fh / 2 - view.y) / view.s;
  return { s: s2, ...clampOffset(fw / 2 - cx * s2, fh / 2 - cy * s2, nw, nh, s2, fw, fh) };
}
