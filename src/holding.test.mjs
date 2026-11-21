// node --test src/holding.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { allowed, isActive, remaining } from './holding.js';

const H = { on: true, keepInfo: true, keepTrack: true, autoLift: false, date: '' };
test('off means off; on means on; autoLift ends it at the launch time', () => {
  assert.equal(isActive({ ...H, on: false }), false); assert.equal(isActive(H), true); assert.equal(isActive(undefined), false);
  const d = '2026-12-01T10:00:00Z', before = Date.parse(d) - 1, after = Date.parse(d);
  assert.equal(isActive({ ...H, date: d, autoLift: true }, before), true);
  assert.equal(isActive({ ...H, date: d, autoLift: true }, after), false);        // launch time reached: the store opens by itself
  assert.equal(isActive({ ...H, date: d, autoLift: false }, after + 1e9), true);  // without autoLift only the admin's switch ends it
  assert.equal(isActive({ ...H, date: 'garbage', autoLift: true }, Date.now()), true); // an unreadable date never opens the store by accident
});
test('shop pages are closed, the holding page and sign-in are open', () => {
  for (const p of ['/products/x', '/collections/sale', '/cart', '/search', '/collections/new-arrivals/products/a']) assert.equal(allowed(p, H), false, p);
  for (const p of ['/', '/account', '/account/login', '/account/register', '/account/reset']) assert.equal(allowed(p, H), true, p);
});
test('info pages and order tracking follow their switches', () => {
  for (const p of ['/about', '/contact', '/policies/shipping', '/pages/anything']) { assert.equal(allowed(p, H), true, p); assert.equal(allowed(p, { ...H, keepInfo: false }), false, p); }
  for (const p of ['/track', '/order/abc']) { assert.equal(allowed(p, H), true, p); assert.equal(allowed(p, { ...H, keepTrack: false }), false, p); }
  assert.equal(allowed('/aboutx', H), false);                                       // not a prefix trick
});
test('remaining splits the time and goes null when it is over or invalid', () => {
  const now = Date.parse('2026-12-01T00:00:00Z');
  assert.deepEqual(remaining('2026-12-03T04:05:06Z', now), { d: 2, h: 4, m: 5, s: 6 });
  assert.equal(remaining('2026-11-30T00:00:00Z', now), null); assert.equal(remaining('', now), null); assert.equal(remaining('nope', now), null);
});
