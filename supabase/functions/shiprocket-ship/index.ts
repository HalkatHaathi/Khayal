// Self-contained on purpose: the Supabase dashboard editor uploads one file per function, so nothing here may be imported from another file.
// Admin-only. { action: 'create', order_id, weight, length, breadth, height }  books the shipment with Shiprocket (safe to call again: it resumes where it stopped)
//             { action: 'refresh', order_id }                                    pulls the latest tracking now

// Shared Shiprocket client + status mapping for the Edge Functions. Runs on Supabase (Deno); secrets come from `supabase secrets set`.
// Endpoint paths follow Shiprocket's public API (apiv2.shiprocket.in/v1/external). Field names were written from their API reference
// and must be confirmed against your account on the first real shipment (see README, "Shiprocket").
import { createClient } from 'npm:@supabase/supabase-js@2';

const BASE = 'https://apiv2.shiprocket.in/v1/external';
let cached: { token: string; at: number } | null = null; // per function instance; tokens last days, we refresh after 8

export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function login(): Promise<string> {
  const email = Deno.env.get('SHIPROCKET_EMAIL'), password = Deno.env.get('SHIPROCKET_PASSWORD');
  if (!email || !password) throw new Error('Shiprocket is not set up: SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD are missing.');
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error(`Shiprocket login failed: ${j.message || r.status}. Use the API user's credentials, not your normal login.`);
  cached = { token: j.token, at: Date.now() };
  return j.token;
}

export async function sr(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = cached && Date.now() - cached.at < 8 * 3600e3 ? cached.token : await login();
    const r = await fetch(`${BASE}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.status === 401 && attempt === 0) { cached = null; continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = j.errors ? Object.values(j.errors).flat().join(' ') : '';
      throw new Error(`Shiprocket: ${j.message || r.status}${detail ? ` (${detail})` : ''}`);
    }
    return j;
  }
  throw new Error('Shiprocket: could not sign in.');
}

export type Status = 'created' | 'awaiting_pickup' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'attention' | 'rto' | 'cancelled';

/** Shiprocket's status wording -> the handful of states the shop shows. Unknown wording keeps the current state. */
export function normalise(label: string | null | undefined, fallback: Status = 'created'): Status {
  const s = (label || '').toLowerCase();
  if (!s) return fallback;
  if (s.includes('rto')) return 'rto';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('undelivered') || s.includes('ndr') || s.includes('lost') || s.includes('damag') || s.includes('exception')) return 'attention';
  if (s.includes('out for delivery')) return 'out_for_delivery';
  if (s.includes('delivered')) return 'delivered';
  if (s.includes('picked up') || s.includes('in transit') || s.includes('shipped') || s.includes('reached') || s.includes('dispatched') || s.includes('transit')) return 'in_transit';
  if (s.includes('pickup') || s.includes('awb') || s.includes('manifest') || s.includes('ready to ship')) return 'awaiting_pickup';
  return fallback;
}

/** Shiprocket timestamps are India time without a zone ("2024-05-01 14:30:00"); anything with a zone already is left alone. */
export function when(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return new Date().toISOString();
  const d = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s) ? new Date(s.replace(' ', 'T') + '+05:30') : new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

// ---------- function ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // only a signed-in admin may call this; the database decides (public.is_admin), not the browser
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: ok } = await asUser.rpc('is_admin');
    if (ok !== true) return json({ error: 'Admins only.' }, 403);

    const b = await req.json();
    const db = admin();
    const { data: order } = await db.from('orders').select('*, order_items(*)').eq('id', b.order_id).maybeSingle();
    if (!order) return json({ error: 'Order not found.' }, 404);
    const { data: existing } = await db.from('shipments').select('*').eq('order_id', order.id).maybeSingle();

    if (b.action === 'refresh') {
      if (!existing?.awb) return json({ error: 'This order has no tracking number yet.' }, 400);
      return json(await refresh(db, existing));
    }
    if (b.action !== 'create') return json({ error: 'Unknown action.' }, 400);
    if (!['confirmed', 'paid'].includes(order.status)) return json({ error: 'Only confirmed or paid orders can be shipped.' }, 400);

    const dim = (v: unknown, min: number, max: number, what: string) => { const n = Number(v); if (!(n >= min && n <= max)) throw new Error(`${what} must be between ${min} and ${max}.`); return n; };
    const weight = dim(b.weight, 0.05, 50, 'Weight (kg)'), length = dim(b.length, 1, 200, 'Length (cm)'), breadth = dim(b.breadth, 1, 200, 'Breadth (cm)'), height = dim(b.height, 1, 200, 'Height (cm)');

    // 1. the order in Shiprocket
    let sh = existing;
    if (!sh?.sr_shipment_id) {
      const a = order.shipping_address || {};
      const { data: st } = await db.from('shop_settings').select('shiprocket_pickup').maybeSingle();
      const email = order.email || Deno.env.get('SHIPROCKET_FALLBACK_EMAIL');
      if (!email) throw new Error('This order has no email. Set the SHIPROCKET_FALLBACK_EMAIL secret (Shiprocket requires one).');
      const [first, ...rest] = String(a.name || order.customer_name || 'Customer').trim().split(/\s+/);
      const res = await sr('/orders/create/adhoc', {
        order_id: `KH-${order.number}`, // our reference, must be unique in Shiprocket
        order_date: new Date(order.created_at).toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 16),
        pickup_location: st?.shiprocket_pickup || 'Primary',
        billing_customer_name: first, billing_last_name: rest.join(' '), billing_address: a.line1, billing_address_2: a.line2 || '',
        billing_city: a.city, billing_pincode: a.pincode, billing_state: a.state, billing_country: 'India', billing_email: email, billing_phone: a.phone || order.phone,
        shipping_is_billing: true,
        order_items: order.order_items.map((i: any) => ({ name: [i.name, i.size].filter(Boolean).join(' - '), sku: `${String(i.product_id || i.name).slice(0, 8)}-${i.size}`, units: i.qty, selling_price: i.unit_price })),
        payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
        sub_total: order.total, // for COD this is the amount the courier collects: confirm on your first COD parcel
        length, breadth, height, weight,
      });
      if (!res.shipment_id) throw new Error(`Shiprocket did not create the shipment: ${res.message || JSON.stringify(res).slice(0, 200)}`);
      const row = { order_id: order.id, sr_order_id: res.order_id, sr_shipment_id: res.shipment_id, status: 'created' as Status, updated_at: new Date().toISOString() };
      await db.from('shipments').upsert(row);
      sh = row as any;
    }

    // 2. a courier and tracking number (Shiprocket picks the recommended courier)
    if (!sh!.awb) {
      const res = await sr('/courier/assign/awb', { shipment_id: sh!.sr_shipment_id });
      const d = res.response?.data ?? res.data ?? res;
      const awb = d.awb_code || d.awb;
      if (!awb) throw new Error(`The order is in Shiprocket but no courier could be assigned: ${res.message || d.message || 'check your wallet balance and the pincode'}. Press Create again after fixing it.`);
      sh = { ...sh!, awb, courier: d.courier_name || null, status: 'awaiting_pickup' };
      await db.from('shipments').update({ awb, courier: sh.courier, status: 'awaiting_pickup', updated_at: new Date().toISOString() }).eq('order_id', order.id);
      await db.from('orders').update({ courier: sh.courier, tracking_number: awb }).eq('id', order.id);
    }

    // 3. pickup and label: best effort, the shipment already exists if either fails
    const notes: string[] = [];
    try { await sr('/courier/generate/pickup', { shipment_id: [sh!.sr_shipment_id] }); } catch (e) { notes.push(`Pickup not scheduled: ${(e as Error).message}`); }
    try {
      const l = await sr('/courier/generate/label', { shipment_id: [sh!.sr_shipment_id] });
      if (l.label_url) await db.from('shipments').update({ label_url: l.label_url }).eq('order_id', order.id);
    } catch (e) { notes.push(`Label not generated: ${(e as Error).message}`); }

    const { data: out } = await db.from('shipments').select('*').eq('order_id', order.id).maybeSingle();
    return json({ shipment: out, notes });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

async function refresh(db: ReturnType<typeof admin>, sh: any) {
  const res = await sr(`/courier/track/awb/${encodeURIComponent(sh.awb)}`);
  const td = res.tracking_data ?? {};
  const acts = (td.shipment_track_activities ?? []).map((a: any) => ({ at: when(a.date), activity: a.activity || a.status || a['sr-status-label'], location: a.location, status: a['sr-status-label'] || a.status }));
  const label = td.shipment_track?.[0]?.current_status || acts[0]?.status;
  const etd = td.etd ? when(td.etd) : null;
  await db.rpc('apply_shipment_update', { p_awb: sh.awb, p_status: normalise(label, sh.status), p_status_label: label ?? null, p_events: acts, p_etd: etd, p_courier: td.shipment_track?.[0]?.courier_name ?? '' });
  const { data } = await db.from('shipments').select('*').eq('order_id', sh.order_id).maybeSingle();
  return { shipment: data, events: acts.length };
}
