// Newsletter sign-up for the storefront: saves the address, adds it to a Resend audience (optional) and sends the WELCOME EMAIL through Resend.
// The email's subject, layout and wording are edited in the admin (Emails page, stored in site_content key 'emails'); this file only renders them.
// ONE self-contained file (the Supabase dashboard editor uploads a single file). Deploy with "Verify JWT" OFF, like the sign-up form it replaces,
// which was open to anyone as well. The welcome email goes out only the FIRST time an address signs up, so repeating the form cannot be used to mail someone.
//
// POST { email, name? }                                   -> { ok: true, already?: true, emailed?: boolean }
// POST { action: 'test', to, template? } + admin login    -> sends the saved (or the unsaved draft) template to `to`, so the admin can see the real thing
//
// Secrets: RESEND_API_KEY (re_...), RESEND_FROM  e.g.  KHYAL <hello@khyal.store>   (the domain must be verified in Resend),
//          optional RESEND_REPLY_TO (where customers' replies go), optional RESEND_AUDIENCE_ID, optional SITE_URL (the shop link in the email).
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are provided by Supabase.

// ---- email template (this block is copied to admin/src/lib/emailHtml.js; a test fails if the two drift apart) ----
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BLOCKS = ['heading', 'text', 'button', 'image', 'divider'];
const cut = (s, n) => String(s ?? '').slice(0, n);

/** What the welcome email looks like until someone edits it in the admin. */
export const DEFAULT_WELCOME = {
  subject: 'Welcome to KHYAL',
  preheader: 'Special offers and new drops will reach you first.',
  logo: '',          // empty: the KHYAL wordmark; or the https address of an uploaded logo
  accent: '#111111', // button colour
  blocks: [
    { type: 'text', text: 'Hi {{first_name}},' },
    { type: 'text', text: 'Thank you for joining. Special offers and new drops will reach you first.' },
    { type: 'button', label: 'Shop now', link: '/' },
  ],
  footer: 'You are receiving this because you signed up at {{site}}. If that was not you, reply to this email and we will remove you.',
};

/** Whatever arrives (from the database or the admin's draft) becomes a safe template: known block types only, capped sizes, a valid colour. */
export function cleanTemplate(t) {
  const d = DEFAULT_WELCOME; t = t && typeof t === 'object' ? t : {};
  const blocks = (Array.isArray(t.blocks) ? t.blocks : d.blocks).filter((b) => b && BLOCKS.includes(b.type)).slice(0, 20)
    .map((b) => ({ type: b.type, text: cut(b.text, 2000), label: cut(b.label, 60), link: cut(b.link, 500), src: cut(b.src, 500), alt: cut(b.alt, 200) }));
  return { subject: cut(t.subject ?? d.subject, 150).trim() || d.subject, preheader: cut(t.preheader ?? d.preheader, 150), logo: cut(t.logo, 500),
    accent: /^#[0-9a-f]{6}$/i.test(t.accent) ? t.accent : d.accent, blocks, footer: cut(t.footer ?? d.footer, 600) };
}

const httpsUrl = (u) => /^https:\/\/[^\s"<>]+$/i.test(u || '');
/** A link someone typed: https:// is kept, /path joins the shop address, anything else (javascript:, mailto: ...) falls back to the shop. */
const link = (to, shop) => { const t = String(to || '').trim(); return /^https?:\/\/[^\s"<>]+$/i.test(t) ? t : /^\/(?!\/)[^\s"<>]*$/.test(t) ? shop.replace(/\/$/, '') + t : shop; };

/** Renders a template to { subject, html, text }. Variables: {{name}} {{first_name}} {{shop_url}} {{site}}. Everything is HTML-escaped after the variables are filled in. */
export function renderEmail(template, vars) {
  const t = cleanTemplate(template);
  const shop = vars.shop_url || 'https://khyal.store';
  const v = { name: vars.name || '', first_name: (vars.name || '').trim().split(/\s+/)[0] || 'there', shop_url: shop, site: shop.replace(/^https?:\/\//, '').replace(/\/$/, '') };
  const fill = (s) => String(s ?? '').replace(/\{\{\s*(name|first_name|shop_url|site)\s*\}\}/g, (_, k) => v[k]);
  const h = (s) => esc(fill(s)).replace(/\n/g, '<br>');
  const parts = t.blocks.map((b) => {
    if (b.type === 'heading') return `<h1 style="font-size:24px;font-weight:400;line-height:1.25;margin:0 0 18px">${h(b.text)}</h1>`;
    if (b.type === 'text') return `<p style="margin:0 0 18px">${h(b.text)}</p>`;
    if (b.type === 'button') return `<p style="margin:10px 0 30px"><a href="${esc(link(fill(b.link), shop))}" style="background:${t.accent};color:#fff;text-decoration:none;font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding:14px 26px;display:inline-block">${h(b.label || 'Shop now')}</a></p>`;
    if (b.type === 'image') return httpsUrl(b.src) ? `<p style="margin:0 0 22px"><img src="${esc(b.src)}" alt="${esc(fill(b.alt))}" style="width:100%;height:auto;display:block;border:0"></p>` : '';
    return '<hr style="border:0;border-top:1px solid #e4e4e4;margin:26px 0">';
  }).join('\n');
  const head = httpsUrl(t.logo) ? `<img src="${esc(t.logo)}" alt="KHYAL" height="44" style="height:44px;display:block;margin:0 0 32px">` : '<p style="font-size:22px;font-weight:600;letter-spacing:.3em;margin:0 0 32px">KHYAL</p>';
  const html = `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${h(t.preheader)}</div>
<div style="font-family:Helvetica,Arial,sans-serif;color:#111;max-width:520px;margin:0 auto;padding:40px 24px;line-height:1.6">
${head}
${parts}
<p style="font-size:12px;color:#777;margin:34px 0 0">${h(t.footer)}</p></div>`;
  const text = [...t.blocks.map((b) => (b.type === 'button' ? `${fill(b.label || 'Shop now')}: ${link(fill(b.link), shop)}` : b.type === 'divider' ? '---' : b.type === 'image' ? '' : fill(b.text))).filter(Boolean), '', fill(t.footer)].join('\n\n');
  return { subject: fill(t.subject), html, text };
}
// ---- end of shared email template ----

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const svc = (env) => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` });

/** The welcome template saved in the admin; any problem reading it falls back to the built-in one, so a sign-up always gets an email. */
async function loadTemplate(env, f) {
  try {
    const r = await f(`${env.SUPABASE_URL}/rest/v1/site_content?key=eq.emails&select=value`, { headers: svc(env) });
    const rows = r.ok ? await r.json() : [];
    return cleanTemplate(rows?.[0]?.value?.welcome);
  } catch { return cleanTemplate(null); }
}

const sendMail = (env, f, to, m) => f('https://api.resend.com/emails', {
  method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'khyal-subscribe/1' },
  body: JSON.stringify({ from: env.RESEND_FROM, to: [to], ...(env.RESEND_REPLY_TO ? { reply_to: env.RESEND_REPLY_TO } : {}), ...m }), // replies land in this inbox, e.g. a Gmail address now, hello@khyal.store after Google Workspace
});

async function testSend(env, f, req, b) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = await f(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  const user = u.ok ? await u.json() : null;
  const admin = user?.id && (await (await f(`${env.SUPABASE_URL}/rest/v1/admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, { headers: svc(env) })).json()).length;
  if (!admin) return json({ error: 'Admins only.' }, 403);
  const to = String(b.to ?? '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(to) || to.length > 254) return json({ error: 'Enter a valid email address to send the test to.' }, 400);
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return json({ error: 'Resend is not set up: add RESEND_API_KEY and RESEND_FROM in Supabase secrets.' }, 503);
  const tpl = b.template ? cleanTemplate(b.template) : await loadTemplate(env, f);
  const m = renderEmail(tpl, { name: 'Asha Rao', shop_url: env.SITE_URL || 'https://khyal.store' });
  const r = await sendMail(env, f, to, { ...m, subject: `[Test] ${m.subject}` });
  if (!r.ok) { const t = await r.text(); console.error('resend test', r.status, t); return json({ error: `Resend refused it (${r.status}): ${t.slice(0, 300)}` }, 502); } // the admin may see Resend's reason
  return json({ ok: true });
}

export async function handle(req, env, f = fetch) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: true });
  try {
    const b = await req.json().catch(() => ({}));
    if (b.action === 'test') return await testSend(env, f, req, b);
    const email = String(b.email ?? '').trim().toLowerCase(), name = String(b.name ?? '').trim().slice(0, 100);
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return json({ error: 'Enter a valid email address.' }, 400);

    const ins = await f(`${env.SUPABASE_URL}/rest/v1/newsletter_subscribers`, {
      method: 'POST', headers: { ...svc(env), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ email, name: name || null }),
    });
    if (ins.status === 409) return json({ ok: true, already: true }); // already on the list: same answer, no email, nothing to probe
    if (!ins.ok) { console.error('subscribe insert', ins.status, await ins.text()); return json({ error: 'Something went wrong. Please try again.' }, 500); }

    // new subscriber: Resend is best effort, a Resend problem must never lose the sign-up
    let emailed = false;
    if (env.RESEND_API_KEY && env.RESEND_FROM) {
      try {
        if (env.RESEND_AUDIENCE_ID) {
          const a = await f(`https://api.resend.com/audiences/${encodeURIComponent(env.RESEND_AUDIENCE_ID)}/contacts`, {
            method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'khyal-subscribe/1' },
            body: JSON.stringify({ email, first_name: name.split(/\s+/)[0] || undefined, unsubscribed: false }),
          });
          if (!a.ok) console.error('resend audience', a.status, await a.text());
        }
        const m = renderEmail(await loadTemplate(env, f), { name, shop_url: env.SITE_URL || 'https://khyal.store' });
        const r = await sendMail(env, f, email, m);
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
