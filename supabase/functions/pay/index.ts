// Razorpay payments for Khyal. ONE self-contained file (the Supabase dashboard editor uploads a single file). Deploy with "Verify JWT" OFF:
// Razorpay's webhook carries no Supabase login, and every action below proves itself (phone number, payment signature, admin login or webhook signature).
//
// POST { action: 'health' }                                                  -> is Razorpay configured, test or live
// POST { action: 'order',  order_id, phone }                                 -> create/reuse the Razorpay order, returns what Checkout needs
// POST { action: 'verify', order_id, phone, razorpay_* }                     -> the browser reports a finished payment; we re-check it with Razorpay
// POST { action: 'refund', order_id }  + admin login                         -> full refund of an online order
// POST (header x-razorpay-signature)                                          -> Razorpay's webhook: payment.captured / payment.authorized / order.paid
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY are provided by Supabase).
// Money rule: a payment is believed only after Razorpay's own API says it is captured, for the exact amount of the order. The browser is never trusted.

const RZP = 'https://api.razorpay.com/v1';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = new TextEncoder();

class Fail extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function safeEqual(a, b) { // constant-time
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------- the two services we talk to ----------
async function dbq(c, path, init = {}) { // Supabase REST with the service role: this function is the only thing that writes payment state
  const key = c.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await c.f(`${c.env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers } });
  const t = await r.text(); const j = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(`db ${r.status}: ${j?.message || t}`);
  return j;
}
const rpc = (c, name, args) => dbq(c, `rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });

async function rz(c, path, body, method = body ? 'POST' : 'GET') {
  const r = await c.f(RZP + path, {
    method, headers: { Authorization: 'Basic ' + btoa(`${c.env.RAZORPAY_KEY_ID}:${c.env.RAZORPAY_KEY_SECRET}`), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { // name the call, Razorpay's own code/field/reason, and the HTTP status: "invalid request" alone is impossible to act on
    const e = j?.error || {};
    throw new Error(`Razorpay ${method} ${path.replace(/(pay|order)_\w+/g, '$1_…')}: ${e.description || 'no description'}${e.field ? ` (field: ${e.field})` : ''}${e.reason ? ` [${e.reason}]` : ''}${e.code ? ` {${e.code}}` : ''} HTTP ${r.status} ${JSON.stringify(j).slice(0, 400)}`); // the raw body too: Razorpay puts source/step/metadata there
  }
  return j;
}

const need = (c) => { for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']) if (!c.env[k]) throw new Fail('Online payment is not set up yet.', 503); };

/** The order, if (and only if) the caller can prove it is theirs with the phone number used at checkout. */
async function owned(c, orderId, phone) {
  if (!UUID.test(String(orderId))) throw new Fail('Order not found.', 404);
  const [o] = await dbq(c, `orders?id=eq.${orderId}&select=id,number,status,payment_method,total,expires_at,phone,customer_name,email,rzp_order_id`);
  if (!o || o.phone !== String(phone ?? '').replace(/\s/g, '')) throw new Fail('Order not found.', 404); // same answer for "no such order" and "not yours"
  return o;
}

// ---------- settle: the one place money becomes an order status ----------
export async function settle(c, paymentId, expectRzpOrder) {
  let p = await rz(c, `/payments/${encodeURIComponent(paymentId)}`);
  if (expectRzpOrder && p.order_id !== expectRzpOrder) throw new Fail('Payment does not match this order.');
  if (p.status === 'authorized') p = await rz(c, `/payments/${p.id}/capture`, { amount: p.amount, currency: p.currency }); // works whatever the dashboard's auto-capture setting is
  if (p.status !== 'captured') return { status: p.status }; // created / failed / refunded: nothing to settle
  const [o] = await dbq(c, `orders?rzp_order_id=eq.${encodeURIComponent(p.order_id)}&select=id`);
  if (!o) return { status: 'unknown_order' }; // not one of ours: never refund what we cannot identify
  const result = await rpc(c, 'apply_payment', { p_order: o.id, p_rzp_order: p.order_id, p_payment: p.id, p_paise: p.amount });
  if (['late', 'duplicate', 'mismatch'].includes(result)) {
    try { await rz(c, `/payments/${p.id}/refund`, { amount: p.amount, notes: { reason: result } }); }
    catch (e) { const again = await rz(c, `/payments/${p.id}`); if (again.status !== 'refunded') throw e; } // a concurrent call may already have refunded it
    return { status: 'refunded', reason: result, order_id: o.id };
  }
  return { status: 'paid', result, order_id: o.id };
}

// ---------- actions ----------
async function createOrder(c, b) {
  need(c);
  const o = await owned(c, b.order_id, b.phone);
  if (o.payment_method !== 'prepaid') throw new Fail('This order is cash on delivery.');
  if (o.status !== 'pending') throw new Fail(o.status === 'paid' ? 'This order is already paid.' : 'This order can no longer be paid.');
  if (o.expires_at && new Date(o.expires_at).getTime() < Date.now() + 2 * 60e3) throw new Fail('Your hold on these items has run out. Please place the order again.', 410);
  let id = o.rzp_order_id;
  if (!id) {
    const made = await rz(c, '/orders', { amount: o.total * 100, currency: 'INR', receipt: `KH${o.number}`, notes: { order_id: o.id, number: String(o.number) } });
    // store it only if nobody else did first; if we lost the race, use theirs so a payment can never land on an unlinked Razorpay order
    const set = await dbq(c, `orders?id=eq.${o.id}&rzp_order_id=is.null`, { method: 'PATCH', body: JSON.stringify({ rzp_order_id: made.id }) });
    id = set.length ? made.id : (await dbq(c, `orders?id=eq.${o.id}&select=rzp_order_id`))[0].rzp_order_id;
  }
  return json({ key: c.env.RAZORPAY_KEY_ID, rzp_order_id: id, amount: o.total * 100, currency: 'INR', name: 'KHYAL', description: `Order #${o.number}`,
    prefill: { name: o.customer_name || '', email: o.email || '', contact: o.phone }, timeout: 1500 }); // checkout closes after 25 min, inside the 30 min stock hold
}

async function verify(c, b) {
  need(c);
  const o = await owned(c, b.order_id, b.phone);
  const { razorpay_payment_id: pid, razorpay_order_id: roid, razorpay_signature: sig } = b;
  if (!pid || !roid || !o.rzp_order_id || roid !== o.rzp_order_id) throw new Fail('Payment does not match this order.');
  if (!safeEqual(await hmacHex(c.env.RAZORPAY_KEY_SECRET, `${roid}|${pid}`), String(sig))) throw new Fail('Payment signature is invalid.');
  return json(await settle(c, pid, roid));
}

async function webhook(c, raw, sig) {
  if (!c.env.RAZORPAY_WEBHOOK_SECRET) throw new Fail('not configured', 503);
  if (!safeEqual(await hmacHex(c.env.RAZORPAY_WEBHOOK_SECRET, raw), sig)) throw new Fail('bad signature', 401);
  const ev = JSON.parse(raw);
  const id = ev?.payload?.payment?.entity?.id;
  if (!['payment.captured', 'payment.authorized', 'order.paid'].includes(ev.event) || !id) return json({ ok: true, ignored: ev.event });
  return json({ ok: true, ...(await settle(c, id)) }); // any thrown error becomes a 500 so Razorpay retries
}

async function refund(c, b, req) {
  need(c);
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = await c.f(`${c.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: c.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  const user = u.ok ? await u.json() : null;
  const admin = user?.id && (await dbq(c, `admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`)).length;
  if (!admin) throw new Fail('Admins only.', 403);
  if (!UUID.test(String(b.order_id))) throw new Fail('Order not found.', 404);
  const [o] = await dbq(c, `orders?id=eq.${b.order_id}&select=id,number,total,status,rzp_payment_id,refund_id`);
  if (!o) throw new Fail('Order not found.', 404);
  if (!o.rzp_payment_id) throw new Fail('This order was not paid online.');
  if (o.refund_id) throw new Fail('This order has already been refunded.');
  // Razorpay's own words are shown to the admin (they are not secrets); only customers get the generic message
  let rf;
  try {
    const pay = await rz(c, `/payments/${encodeURIComponent(o.rzp_payment_id)}`);
    if (pay.status === 'refunded' || (pay.amount_refunded || 0) >= pay.amount) { // already refunded at Razorpay (an earlier attempt, or from their dashboard): just record it
      rf = (await rz(c, `/payments/${pay.id}/refunds`)).items?.[0];
      if (!rf) throw new Fail('Razorpay says this payment was refunded, but returned no refund record. Check the Razorpay dashboard.', 502);
    } else {
      if (pay.status !== 'captured') throw new Fail(`Razorpay shows this payment as "${pay.status}", so it cannot be refunded.`, 409);
      rf = await rz(c, `/payments/${pay.id}/refund`, { amount: o.total * 100 });
    }
  } catch (e) { console.error('pay refund', o.number, e.message); throw e instanceof Fail ? e : new Fail(e.message, 502); } // logged too, so it shows in the function logs
  try {
    await dbq(c, `orders?id=eq.${o.id}`, { method: 'PATCH', body: JSON.stringify({ refund_id: rf.id, refund_amount: o.total, refunded_at: new Date().toISOString() }) });
  } catch (e) { throw new Fail(`The refund went through at Razorpay (${rf.id}) but could not be saved here: ${e.message}. Press Refund again to record it.`, 502); }
  return json({ refund_id: rf.id, amount: o.total });
}

export async function handle(req, env, f = fetch) {
  const c = { env, f };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: true });
  try {
    const raw = await req.text();
    const sig = req.headers.get('x-razorpay-signature');
    if (sig) return await webhook(c, raw, sig);
    const b = JSON.parse(raw || '{}');
    switch (b.action) {
      case 'health': return json({ configured: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET), mode: String(env.RAZORPAY_KEY_ID || '').startsWith('rzp_live') ? 'live' : 'test' });
      case 'order': return await createOrder(c, b);
      case 'verify': return await verify(c, b);
      case 'refund': return await refund(c, b, req);
      default: throw new Fail('Unknown action.');
    }
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, e.status);
    console.error('pay', e); // details stay in the function logs; the caller only learns that it failed (Razorpay retries webhooks on 5xx)
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

if (typeof Deno !== 'undefined') Deno.serve((req) => handle(req, Deno.env.toObject()));
