// Copy of the email renderer in supabase/functions/subscribe/index.ts, used by the admin's live preview.
// Do not edit here: change the function file and copy the block between the two markers (supabase/functions/subscribe/subscribe.test.mjs fails if they differ).

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
