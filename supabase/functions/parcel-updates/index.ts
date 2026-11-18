// Self-contained on purpose: the Supabase dashboard editor uploads one file per function, so nothing here may be imported from another file.
// Shiprocket calls this on every tracking update. Deploy with --no-verify-jwt: Shiprocket sends no Supabase login,
// so the shared secret in the x-api-key header is the lock. Set the same value in Shiprocket > Settings > API > Webhooks.

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
const same = (a: string, b: string) => { // constant-time compare
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true }); // Shiprocket may probe the URL when you save it
  const token = Deno.env.get('SHIPROCKET_WEBHOOK_TOKEN');
  if (!token || !same(req.headers.get('x-api-key') ?? '', token)) return json({ error: 'unauthorised' }, 401);
  try {
    const p = await req.json();
    const awb = String(p.awb ?? p.awb_code ?? '');
    if (!awb) return json({ ok: true, ignored: 'no awb' });
    const label = p.current_status ?? p.shipment_status ?? '';
    const scans = (Array.isArray(p.scans) ? p.scans : []).map((s: any) => ({ at: when(s.date), activity: s.activity || s.status || s['sr-status-label'], location: s.location, status: s['sr-status-label'] || s.status }));
    if (!scans.length && label) scans.push({ at: when(p.current_timestamp), activity: label, location: '', status: label });
    const db = admin();
    const { data: cur } = await db.from('shipments').select('status').eq('awb', awb).maybeSingle();
    const { error } = await db.rpc('apply_shipment_update', {
      p_awb: awb, p_status: normalise(label, cur?.status ?? 'created'), p_status_label: label || null, p_events: scans,
      p_etd: p.etd ? when(p.etd) : null, p_courier: p.courier_name ?? '',
    });
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    console.error('shiprocket webhook', e);
    return json({ error: 'bad payload' }, 400);
  }
});
