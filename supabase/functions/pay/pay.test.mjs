// Run: node --test supabase/functions/pay/pay.test.mjs   (Node 22+, no install). Razorpay and Supabase are replaced by an in-memory fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, hmacHex } from './index.ts';

const ENV = { RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 'keysecret', RAZORPAY_WEBHOOK_SECRET: 'whsecret', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon' };
const OID = '11111111-1111-1111-1111-111111111111';
const baseOrder = () => ({ id: OID, number: 1001, status: 'pending', payment_method: 'prepaid', total: 6150, expires_at: new Date(Date.now() + 20 * 60e3).toISOString(), phone: '9876543210', customer_name: 'Asha', email: null, rzp_order_id: null, rzp_payment_id: null, refund_id: null });

/** A fake world. `calls` records every outgoing request so tests can assert what was (not) done. */
function world(over = {}) {
  const w = { order: baseOrder(), payments: {}, applyResult: 'paid', admins: [], calls: [], rzpOrders: 0, ...over };
  w.fetch = async (url, init = {}) => {
    const u = String(url), m = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null;
    w.calls.push({ m, u, body });
    const res = (data, status = 200) => new Response(JSON.stringify(data), { status });
    if (u.includes('api.razorpay.com')) {
      const path = u.split('/v1')[1];
      if (path === '/orders') { w.rzpOrders++; return res({ id: `order_${w.rzpOrders}`, amount: body.amount }); }
      const pay = path.match(/^\/payments\/(\w+)(\/capture|\/refund)?$/);
      if (!pay) return res({ error: { description: 'bad path' } }, 400);
      const p = w.payments[pay[1]]; if (!p) return res({ error: { description: 'no such payment' } }, 400);
      if (pay[2] === '/capture') { p.status = 'captured'; return res(p); }
      if (pay[2] === '/refund') { if (p.status === 'refunded') return res({ error: { description: 'already refunded' } }, 400); p.status = 'refunded'; return res({ id: 'rfnd_1', amount: body.amount }); }
      return res(p);
    }
    if (u.includes('/auth/v1/user')) return init.headers.Authorization === 'Bearer adminjwt' ? res({ id: 'admin-1' }) : res({}, 401);
    if (u.includes('/rest/v1/rpc/apply_payment')) { w.applied = body; return res(w.applyResult); }
    if (u.includes('/rest/v1/admins')) return res(u.includes('admin-1') ? w.admins : []);
    if (u.includes('/rest/v1/orders')) {
      if (m === 'PATCH') {
        if (u.includes('rzp_order_id=is.null')) { if (w.order.rzp_order_id) return res([]); Object.assign(w.order, body); return res([w.order]); }
        Object.assign(w.order, body); return res([w.order]);
      }
      if (u.includes('rzp_order_id=eq.')) return res(w.order.rzp_order_id && u.includes(w.order.rzp_order_id) ? [w.order] : []);
      return res(u.includes(OID) ? [w.order] : []);
    }
    return res({}, 404);
  };
  return w;
}
const post = (w, body, headers = {}) => handle(new Request('https://f/pay', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers }), ENV, w.fetch);
const refunds = (w) => w.calls.filter((c) => c.u.endsWith('/refund'));
const captured = (id = 'pay_1', order = 'order_1', amount = 615000) => ({ id, order_id: order, status: 'captured', amount, currency: 'INR' });
const hook = async (w, event, id = 'pay_1', secret = ENV.RAZORPAY_WEBHOOK_SECRET) => {
  const raw = JSON.stringify({ event, payload: { payment: { entity: { id } } } });
  return post(w, raw, { 'x-razorpay-signature': await hmacHex(secret, raw) });
};

// ---------- health ----------
test('health reports configured + mode, never the keys', async () => {
  const r = await post(world(), { action: 'health' }); const j = await r.json();
  assert.deepEqual(j, { configured: true, mode: 'test' });
  const live = await handle(new Request('https://f', { method: 'POST', body: '{"action":"health"}' }), { ...ENV, RAZORPAY_KEY_ID: 'rzp_live_1' }, world().fetch);
  assert.equal((await live.json()).mode, 'live');
  const none = await handle(new Request('https://f', { method: 'POST', body: '{"action":"health"}' }), {}, world().fetch);
  assert.equal((await none.json()).configured, false);
});

// ---------- create order ----------
test('order: wrong phone looks exactly like no such order', async () => {
  const w = world(); const r = await post(w, { action: 'order', order_id: OID, phone: '9000000000' });
  assert.equal(r.status, 404); assert.equal(w.rzpOrders, 0);
  assert.equal((await post(w, { action: 'order', order_id: 'not-a-uuid', phone: '9876543210' })).status, 404);
});
test('order: creates a Razorpay order for the exact total in paise, stores it, returns checkout options', async () => {
  const w = world(); const r = await post(w, { action: 'order', order_id: OID, phone: '9876543210' }); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.amount, 615000); assert.equal(j.currency, 'INR'); assert.equal(j.key, 'rzp_test_abc');
  assert.equal(j.rzp_order_id, 'order_1'); assert.equal(w.order.rzp_order_id, 'order_1');
  assert.equal(JSON.stringify(j).includes('keysecret'), false);
});
test('order: asking twice reuses the same Razorpay order', async () => {
  const w = world(); await post(w, { action: 'order', order_id: OID, phone: '9876543210' });
  const j = await (await post(w, { action: 'order', order_id: OID, phone: '9876543210' })).json();
  assert.equal(w.rzpOrders, 1); assert.equal(j.rzp_order_id, 'order_1');
});
test('order: losing a creation race uses the stored Razorpay order, never an unlinked one', async () => {
  const w = world(); const real = w.fetch;
  w.fetch = async (u, i = {}) => { if (String(u).includes('api.razorpay.com/v1/orders')) w.order.rzp_order_id = 'order_winner'; return real(u, i); };
  const j = await (await post(w, { action: 'order', order_id: OID, phone: '9876543210' })).json();
  assert.equal(j.rzp_order_id, 'order_winner');
});
test('order: refuses expired holds, paid, cancelled and cash-on-delivery orders', async () => {
  for (const [patch, status] of [[{ expires_at: new Date(Date.now() + 30e3).toISOString() }, 410], [{ status: 'paid' }, 400], [{ status: 'cancelled' }, 400], [{ payment_method: 'cod' }, 400]]) {
    const w = world(); Object.assign(w.order, patch);
    assert.equal((await post(w, { action: 'order', order_id: OID, phone: '9876543210' })).status, status, JSON.stringify(patch));
    assert.equal(w.rzpOrders, 0);
  }
});
test('order: says so when Razorpay is not configured', async () => {
  const r = await handle(new Request('https://f', { method: 'POST', body: JSON.stringify({ action: 'order', order_id: OID, phone: '9876543210' }) }), { ...ENV, RAZORPAY_KEY_SECRET: '' }, world().fetch);
  assert.equal(r.status, 503);
});

// ---------- verify (browser says it paid) ----------
const verifyBody = async (over = {}, secret = ENV.RAZORPAY_KEY_SECRET) => {
  const body = { action: 'verify', order_id: OID, phone: '9876543210', razorpay_payment_id: 'pay_1', razorpay_order_id: 'order_1', ...over };
  body.razorpay_signature = over.razorpay_signature ?? await hmacHex(secret, `${body.razorpay_order_id}|${body.razorpay_payment_id}`);
  return body;
};
test('verify: a forged signature is rejected and nothing is settled', async () => {
  const w = world(); w.order.rzp_order_id = 'order_1'; w.payments.pay_1 = captured();
  const r = await post(w, await verifyBody({}, 'wrong-secret'));
  assert.equal(r.status, 400); assert.equal(w.applied, undefined);
});
test('verify: a signature from a different Razorpay order is rejected', async () => {
  const w = world(); w.order.rzp_order_id = 'order_1'; w.payments.pay_1 = captured();
  assert.equal((await post(w, await verifyBody({ razorpay_order_id: 'order_other' }))).status, 400); assert.equal(w.applied, undefined);
});
test('verify: valid signature but Razorpay says the payment is not captured -> not paid', async () => {
  const w = world(); w.order.rzp_order_id = 'order_1'; w.payments.pay_1 = { ...captured(), status: 'failed' };
  const j = await (await post(w, await verifyBody())).json();
  assert.equal(j.status, 'failed'); assert.equal(w.applied, undefined);
});
test('verify: a captured payment settles the order with Razorpay\'s own amount', async () => {
  const w = world(); w.order.rzp_order_id = 'order_1'; w.payments.pay_1 = captured();
  const j = await (await post(w, await verifyBody())).json();
  assert.equal(j.status, 'paid'); assert.deepEqual(w.applied, { p_order: OID, p_rzp_order: 'order_1', p_payment: 'pay_1', p_paise: 615000 }); assert.equal(refunds(w).length, 0);
});
test('verify: someone else\'s phone cannot settle this order', async () => {
  const w = world(); w.order.rzp_order_id = 'order_1'; w.payments.pay_1 = captured();
  assert.equal((await post(w, await verifyBody({ phone: '9000000000' }))).status, 404); assert.equal(w.applied, undefined);
});

// ---------- webhook ----------
test('webhook: bad or missing signature -> 401 and no outgoing calls at all', async () => {
  const w = world(); const r = await hook(w, 'payment.captured', 'pay_1', 'attacker-secret');
  assert.equal(r.status, 401); assert.equal(w.calls.length, 0);
  assert.equal((await post(w, '{"event":"payment.captured"}', { 'x-razorpay-signature': 'deadbeef' })).status, 401);
});
test('webhook: payment.captured settles the order even if the browser never came back', async () => {
  const w = world(); w.order.rzp_order_id = 'order_1'; w.payments.pay_1 = captured();
  const r = await hook(w, 'payment.captured'); assert.equal(r.status, 200); assert.equal(w.applied.p_order, OID); assert.equal(refunds(w).length, 0);
});
test('webhook: the payload is only a pointer, the amount comes from Razorpay (a spoofed amount in the body changes nothing)', async () => {
  const w = world(); w.order.rzp_order_id = 'order_1'; w.payments.pay_1 = captured();
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', amount: 1 } } } });
  await post(w, raw, { 'x-razorpay-signature': await hmacHex(ENV.RAZORPAY_WEBHOOK_SECRET, raw) });
  assert.equal(w.applied.p_paise, 615000);
});
test('webhook: authorized (not yet captured) payments are captured first, then settled', async () => {
  const w = world(); w.order.rzp_order_id = 'order_1'; w.payments.pay_1 = { ...captured(), status: 'authorized' };
  await hook(w, 'payment.authorized');
  assert.ok(w.calls.some((c) => c.u.endsWith('/capture') && c.body.amount === 615000)); assert.equal(w.applied.p_payment, 'pay_1');
});
test('webhook: unrelated events are acknowledged and ignored', async () => {
  const w = world(); const r = await hook(w, 'refund.processed'); assert.equal(r.status, 200); assert.equal(w.calls.length, 0);
});
test('webhook: the same event twice is harmless (already recorded -> no refund)', async () => {
  const w = world({ applyResult: 'already' }); w.order.rzp_order_id = 'order_1'; w.payments.pay_1 = captured();
  const j = await (await hook(w, 'payment.captured')).json(); assert.equal(j.result, 'already'); assert.equal(refunds(w).length, 0);
});

// ---------- the money-safety cases ----------
for (const reason of ['late', 'duplicate', 'mismatch']) {
  test(`settle: result "${reason}" refunds the full payment`, async () => {
    const w = world({ applyResult: reason }); w.order.rzp_order_id = 'order_1'; w.payments.pay_1 = captured();
    const j = await (await hook(w, 'payment.captured')).json();
    assert.equal(j.status, 'refunded'); assert.equal(refunds(w).length, 1); assert.equal(refunds(w)[0].body.amount, 615000); assert.equal(w.payments.pay_1.status, 'refunded');
  });
}
test('settle: a payment for an order we do not know is never refunded (we cannot identify it)', async () => {
  const w = world(); w.payments.pay_9 = captured('pay_9', 'order_unknown');
  const j = await (await hook(w, 'payment.captured', 'pay_9')).json(); assert.equal(j.status, 'unknown_order'); assert.equal(refunds(w).length, 0);
});
test('settle: two concurrent refunds of one late payment do not blow up (second sees it already refunded)', async () => {
  const w = world({ applyResult: 'late' }); w.order.rzp_order_id = 'order_1'; w.payments.pay_1 = captured();
  const [a, b] = await Promise.all([hook(w, 'payment.captured'), hook(w, 'payment.captured')]);
  assert.deepEqual([a.status, b.status], [200, 200]); assert.equal(w.payments.pay_1.status, 'refunded');
});
test('settle: a failing database makes the webhook answer 500 so Razorpay retries', async () => {
  const w = world(); w.order.rzp_order_id = 'order_1'; w.payments.pay_1 = captured(); const real = w.fetch;
  w.fetch = async (u, i) => (String(u).includes('rpc/apply_payment') ? new Response('{"message":"db down"}', { status: 500 }) : real(u, i));
  const r = await hook(w, 'payment.captured'); assert.equal(r.status, 500); assert.equal(JSON.stringify(await r.json()).includes('db down'), false); // details are not leaked
});

// ---------- refund (admin) ----------
test('refund: needs an admin login', async () => {
  const w = world(); w.order.rzp_payment_id = 'pay_1'; w.payments.pay_1 = captured();
  assert.equal((await post(w, { action: 'refund', order_id: OID })).status, 403);
  assert.equal((await post(w, { action: 'refund', order_id: OID }, { authorization: 'Bearer adminjwt' })).status, 403); // signed in but not in admins
  assert.equal(refunds(w).length, 0);
});
test('refund: an admin refunds the full amount once, and it is recorded', async () => {
  const w = world({ admins: [{ user_id: 'admin-1' }] }); w.order.rzp_payment_id = 'pay_1'; w.order.status = 'cancelled'; w.payments.pay_1 = captured();
  const r = await post(w, { action: 'refund', order_id: OID }, { authorization: 'Bearer adminjwt' }); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.amount, 6150); assert.equal(refunds(w)[0].body.amount, 615000); assert.equal(w.order.refund_id, 'rfnd_1'); assert.equal(w.order.refund_amount, 6150);
  const again = await post(w, { action: 'refund', order_id: OID }, { authorization: 'Bearer adminjwt' });
  assert.equal(again.status, 400); assert.equal(refunds(w).length, 1);
});
test('refund: an order that was never paid online cannot be refunded', async () => {
  const w = world({ admins: [{ user_id: 'admin-1' }] });
  assert.equal((await post(w, { action: 'refund', order_id: OID }, { authorization: 'Bearer adminjwt' })).status, 400);
});

test('unknown actions and non-POST are handled', async () => {
  assert.equal((await post(world(), { action: 'nope' })).status, 400);
  assert.equal((await handle(new Request('https://f', { method: 'GET' }), ENV, world().fetch)).status, 200);
});
