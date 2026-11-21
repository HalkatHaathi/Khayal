// Newsletter sign-up for the storefront: saves the address, adds it to a Resend audience (optional) and sends a welcome email through Resend.
// ONE self-contained file (the Supabase dashboard editor uploads a single file). Deploy with "Verify JWT" OFF, like the sign-up form it replaces,
// which was open to anyone as well. The welcome email goes out only the FIRST time an address signs up, so repeating the form cannot be used to mail someone.
//
// POST { email, name? }  ->  { ok: true, already?: true, emailed?: boolean }
//
// Secrets: RESEND_API_KEY (re_...), RESEND_FROM  e.g.  KHYAL <hello@khyal.store>   (the domain must be verified in Resend; until then use  KHYAL <onboarding@resend.dev>,
//          which Resend only delivers to the account owner), optional RESEND_AUDIENCE_ID, optional SITE_URL (the shop link in the email).
//          SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function welcome(name, site) {
  const hello = name ? `Hi ${esc(name)},` : 'Hello,';
  const host = esc(String(site).replace(/^https?:\/\//, '').replace(/\/$/, ''));
  return {
    subject: 'Welcome to KHYAL',
    text: `${name ? `Hi ${name},` : 'Hello,'}\n\nThank you for joining. Special offers and new drops will reach you first.\n\nShop: ${site}\n\nYou are receiving this because you signed up at ${host}. If that was not you, reply to this email and we will remove you.`,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#111;max-width:520px;margin:0 auto;padding:40px 24px;line-height:1.6">
<p style="font-size:22px;font-weight:600;letter-spacing:.3em;margin:0 0 32px">KHYAL</p>
<p style="margin:0 0 16px">${hello}</p>
<p style="margin:0 0 28px">Thank you for joining. Special offers and new drops will reach you first.</p>
<p style="margin:0 0 36px"><a href="${esc(site)}" style="background:#111;color:#fff;text-decoration:none;font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding:14px 26px;display:inline-block">Shop now</a></p>
<p style="font-size:12px;color:#777;margin:0">You are receiving this because you signed up at ${host}. If that was not you, reply to this email and we will remove you.</p></div>`,
  };
}

export async function handle(req, env, f = fetch) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: true });
  try {
    const b = await req.json().catch(() => ({}));
    const email = String(b.email ?? '').trim().toLowerCase(), name = String(b.name ?? '').trim().slice(0, 100);
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return json({ error: 'Enter a valid email address.' }, 400);

    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const ins = await f(`${env.SUPABASE_URL}/rest/v1/newsletter_subscribers`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ email, name: name || null }),
    });
    if (ins.status === 409) return json({ ok: true, already: true }); // already on the list: same answer, no email, nothing to probe
    if (!ins.ok) { console.error('subscribe insert', ins.status, await ins.text()); return json({ error: 'Something went wrong. Please try again.' }, 500); }

    // new subscriber: Resend is best effort, a Resend problem must never lose the sign-up
    let emailed = false;
    if (env.RESEND_API_KEY && env.RESEND_FROM) {
      const rs = (path, body) => f(`https://api.resend.com${path}`, { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'khyal-subscribe/1' }, body: JSON.stringify(body) });
      try {
        if (env.RESEND_AUDIENCE_ID) {
          const a = await rs(`/audiences/${encodeURIComponent(env.RESEND_AUDIENCE_ID)}/contacts`, { email, first_name: name.split(/\s+/)[0] || undefined, unsubscribed: false });
          if (!a.ok) console.error('resend audience', a.status, await a.text());
        }
        const m = welcome(name, env.SITE_URL || 'https://khyal.store');
        const r = await rs('/emails', { from: env.RESEND_FROM, to: [email], ...m });
        emailed = r.ok;
        if (!r.ok) console.error('resend email', r.status, await r.text());
      } catch (e) { console.error('resend', e.message); }
    }
    return json({ ok: true, emailed });
  } catch (e) {
    console.error('subscribe', e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

if (typeof Deno !== 'undefined') Deno.serve((req) => handle(req, Deno.env.toObject()));
