// node --test admin/src/lib/crop.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampOffset, fitFrame, minScale, outputSize, sourceRect, zoomAt } from './crop.js';

test('fitFrame keeps the ratio and fits inside the box', () => {
  assert.deepEqual(fitFrame(2, 500, 400), { w: 500, h: 250 });
  assert.deepEqual(fitFrame(0.5, 500, 400), { w: 200, h: 400 });
  const f = fitFrame(1905 / 667, 560, 480); assert.ok(Math.abs(f.w / f.h - 1905 / 667) < 1e-9 && f.w <= 560 && f.h <= 480);
});
test('minScale makes the photo cover the frame on both axes', () => {
  assert.equal(minScale(4000, 3000, 400, 400), 400 / 3000); // landscape photo, square frame: height decides
  assert.equal(minScale(3000, 4000, 400, 400), 400 / 3000);
});
test('clampOffset never shows empty space', () => {
  const s = 0.2, nw = 2000, nh = 1000, fw = 400, fh = 200; // photo is exactly 400 x 200 at this zoom
  assert.deepEqual(clampOffset(50, 50, nw, nh, s, fw, fh), { x: 0, y: 0 });       // dragged too far right/down
  assert.deepEqual(clampOffset(-999, -999, nw, nh, s, fw, fh), { x: 0, y: 0 });   // nothing to spare, so no movement at all
  const z = clampOffset(-999, -999, nw, nh, 0.4, fw, fh); assert.deepEqual(z, { x: -400, y: -200 }); // zoomed 2x: can move by 400 x 200
});
test('sourceRect maps what the frame shows back to the original photo', () => {
  assert.deepEqual(sourceRect(0, 0, 0.5, 400, 300), { sx: 0, sy: 0, sw: 800, sh: 600 });
  assert.deepEqual(sourceRect(-100, -50, 0.5, 400, 300), { sx: 200, sy: 100, sw: 800, sh: 600 });
});
test('outputSize keeps small crops as they are and caps big ones', () => {
  assert.deepEqual(outputSize(800, 600), { w: 800, h: 600 });
  assert.deepEqual(outputSize(4800, 3200), { w: 2400, h: 1600 });
});
test('zoomAt keeps the centre of the view where it was', () => {
  const nw = 2000, nh = 1000, fw = 400, fh = 200; const s = minScale(nw, nh, fw, fh);
  const v = { s, x: 0, y: 0 }; const centreBefore = sourceRect(v.x, v.y, v.s, fw, fh);
  const z = zoomAt(v, s * 2, nw, nh, fw, fh); const r = sourceRect(z.x, z.y, z.s, fw, fh);
  assert.ok(Math.abs((r.sx + r.sw / 2) - (centreBefore.sx + centreBefore.sw / 2)) < 1e-6);
  assert.ok(Math.abs(r.sw - centreBefore.sw / 2) < 1e-6);
});
