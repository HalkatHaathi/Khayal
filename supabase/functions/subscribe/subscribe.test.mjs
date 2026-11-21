// Run: node --test supabase/functions/subscribe/subscribe.test.mjs   Resend and Supabase are replaced by a fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_WELCOME, cleanTemplate, esc, handle, renderEmail } from './index.ts';

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon', RESEND_API_KEY: 're_secret', RESEND_FROM: 'KHYAL <hello@khyal.store>', RESEND_AUDIENCE_ID: 'aud_1', SITE_URL: 'https://khyal.store' };
function world({ existing = false, dbStatus, resendOk = true, saved, savedStatus = 200, admins = [] } = {}) {
  const w = { calls: [] };
  w.fetch = async (url, init = {}) => {
    const u = String(url), body = init.body ? JSON.parse(init.body) : null; w.calls.push({ u, body, headers: init.headers });
    if (u.includes('/rest/v1/newsletter_subscribers')) return new Response(dbStatus === 500 ? '{"message":"db down"}' : '', { status: dbStatus ?? (existing ? 409 : 201) });
    if (u.includes('/rest/v1/site_content')) return new Response(JSON.stringify(saved ? [{ value: { welcome: saved } }] : []), { status: savedStatus });
    if (u.includes('/auth/v1/user')) return init.headers.Authorization === 'Bearer adminjwt' ? new Response('{"id":"admin-1"}') : new Response('{}', { status: 401 });
    if (u.includes('/rest/v1/admins')) return new Response(JSON.stringify(u.includes('admin-1') ? admins : []));
    if (u.includes('api.resend.com')) return new Response(resendOk ? '{"id":"x"}' : '{"message":"domain not verified"}', { status: resendOk ? 200 : 403 });
    return new Response('{}', { status: 404 });
  };
  return w;
}
const post = (w, body, env = ENV, headers = {}) => handle(new Request('https://f/subscribe', { method: 'POST', body: JSON.stringify(body), headers }), env, w.fetch);
const resend = (w, path) => w.calls.filter((c) => c.u === `https://api.resend.com${path}`);

// ---------- sign-up ----------
test('new subscriber: saved, added to the audience, welcome email sent from the configured address', async () => {
  const w = world(); const r = await post(w, { email: ' Asha@Example.com ', name: 'Asha Rao' }); const j = await r.json();
  assert.equal(r.status, 200); assert.deepEqual(j, { ok: true, emailed: true });
  assert.equal(w.calls.find((c) => c.u.includes('newsletter_subscribers')).body.email, 'asha@example.com');
  const [mail] = resend(w, '/emails'); assert.equal(mail.body.from, 'KHYAL <hello@khyal.store>'); assert.deepEqual(mail.body.to, ['asha@example.com']);
  assert.match(mail.body.html, /Hi Asha,/); assert.match(mail.body.text, /Shop now: https:\/\/khyal\.store\//); assert.equal(mail.body.subject, 'Welcome to KHYAL');
  const [aud] = resend(w, '/audiences/aud_1/contacts'); assert.equal(aud.body.first_name, 'Asha'); assert.equal(aud.body.unsubscribed, false);
  assert.equal(mail.headers.Authorization, 'Bearer re_secret');
});
test('already subscribed: same friendly answer, and NO email', async () => {
  const w = world({ existing: true }); const j = await (await post(w, { email: 'a@b.co' })).json();
  assert.deepEqual(j, { ok: true, already: true }); assert.equal(resend(w, '/emails').length, 0);
});
test('invalid addresses are refused before anything is saved or sent', async () => {
  for (const email of ['', 'nope', 'a@b', 'x'.repeat(250) + '@b.co']) { const w = world(); assert.equal((await post(w, { email })).status, 400); assert.equal(w.calls.length, 0); }
});
test('a Resend failure never loses the sign-up; no Resend config means no email but still a sign-up', async () => {
  const a = await (await post(world({ resendOk: false }), { email: 'a@b.co' })).json(); assert.deepEqual(a, { ok: true, emailed: false });
  const w = world(); const b = await (await post(w, { email: 'a@b.co' }, { ...ENV, RESEND_API_KEY: '' })).json();
  assert.deepEqual(b, { ok: true, emailed: false }); assert.equal(w.calls.filter((c) => c.u.includes('resend')).length, 0);
});
test('replies go to RESEND_REPLY_TO when set; audience is optional', async () => {
  const a = world(); await post(a, { email: 'a@b.co' }, { ...ENV, RESEND_REPLY_TO: 'owner@gmail.com', RESEND_AUDIENCE_ID: undefined });
  assert.equal(resend(a, '/emails')[0].body.reply_to, 'owner@gmail.com'); assert.equal(resend(a, '/audiences/aud_1/contacts').length, 0);
  const b = world(); await post(b, { email: 'a@b.co' }); assert.equal('reply_to' in resend(b, '/emails')[0].body, false);
});
test('a database failure is a generic 500 with no details leaked', async () => {
  const w = world({ dbStatus: 500 }); const r = await post(w, { email: 'a@b.co' }); const t = JSON.stringify(await r.json());
  assert.equal(r.status, 500); assert.equal(t.includes('db down'), false); assert.equal(resend(w, '/emails').length, 0);
});

// ---------- the template saved in the admin ----------
const SAVED = { subject: 'Hello {{first_name}}, welcome', preheader: 'Pre', accent: '#b3392b', logo: 'https://cdn.example.com/logo.png', footer: 'Sent to you from {{site}}.',
  blocks: [{ type: 'heading', text: 'Welcome, {{first_name}}' }, { type: 'image', src: 'https://cdn.example.com/a.jpg', alt: 'Look' }, { type: 'divider' }, { type: 'text', text: 'Line one\nLine two' }, { type: 'button', label: 'See the drop', link: '/collections/new-arrivals' }] };
test('the template saved in the admin is what gets sent', async () => {
  const w = world({ saved: SAVED }); await post(w, { email: 'a@b.co', name: 'Asha Rao' }); const m = resend(w, '/emails')[0].body;
  assert.equal(m.subject, 'Hello Asha, welcome');
  assert.match(m.html, /<h1[^>]*>Welcome, Asha<\/h1>/); assert.match(m.html, /<img src="https:\/\/cdn\.example\.com\/a\.jpg" alt="Look"/); assert.match(m.html, /<hr /);
  assert.match(m.html, /Line one<br>Line two/); assert.match(m.html, /href="https:\/\/khyal\.store\/collections\/new-arrivals"[^>]*background:#b3392b/); assert.match(m.html, /src="https:\/\/cdn\.example\.com\/logo\.png"/);
  assert.match(m.html, /Sent to you from khyal\.store\./); assert.match(m.text, /See the drop: https:\/\/khyal\.store\/collections\/new-arrivals/);
});
test('no saved template, or the database read failing, falls back to the built-in welcome', async () => {
  for (const o of [{}, { savedStatus: 500 }]) { const w = world(o); await post(w, { email: 'a@b.co' }); assert.equal(resend(w, '/emails')[0].body.subject, DEFAULT_WELCOME.subject); }
});
test('template text is escaped, variables included (no injected markup anywhere)', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const m = renderEmail({ ...SAVED, subject: evil, blocks: [{ type: 'text', text: `${evil} {{name}}` }, { type: 'button', label: evil, link: 'https://a.co/"><script>' }] }, { name: evil, shop_url: 'https://khyal.store' });
  assert.equal(/<img src=x|<script/.test(m.html), false); assert.match(m.html, /&lt;img/);
});
test('links: https and /paths are kept, anything else falls back to the shop', () => {
  const href = (to) => renderEmail({ blocks: [{ type: 'button', label: 'Go', link: to }] }, { shop_url: 'https://khyal.store' }).html.match(/<a href="([^"]*)"/)[1];
  assert.equal(href('https://example.com/x'), 'https://example.com/x'); assert.equal(href('/sale'), 'https://khyal.store/sale');
  for (const bad of ['javascript:alert(1)', 'mailto:a@b.co', 'data:text/html,x', '//evil.com', '']) assert.equal(href(bad), 'https://khyal.store');
});
test('images and logos must be https', () => {
  const m = renderEmail({ logo: 'http://insecure/x.png', blocks: [{ type: 'image', src: 'javascript:alert(1)', alt: '' }] }, {});
  assert.equal(/<img/.test(m.html), false); assert.match(m.html, />KHYAL</);
});
test('cleanTemplate caps sizes, drops unknown blocks and bad colours', () => {
  const t = cleanTemplate({ subject: 'x'.repeat(999), accent: 'red', blocks: [...Array.from({ length: 50 }, () => ({ type: 'text', text: 'y'.repeat(9999) })), { type: 'script', text: 'z' }] });
  assert.equal(t.subject.length, 150); assert.equal(t.accent, '#111111'); assert.equal(t.blocks.length, 20); assert.equal(t.blocks[0].text.length, 2000);
  assert.deepEqual(cleanTemplate('garbage').blocks.map((b) => b.type), DEFAULT_WELCOME.blocks.map((b) => b.type));
});
test('the API key never appears in any response', async () => {
  const t = JSON.stringify(await (await post(world(), { email: 'a@b.co' })).json()); assert.equal(t.includes('re_secret'), false);
});

// ---------- the admin's "send me a test" ----------
const AUTH = { authorization: 'Bearer adminjwt' };
test('test send: admins only', async () => {
  const w = world({ admins: [{ user_id: 'admin-1' }] });
  assert.equal((await post(w, { action: 'test', to: 'me@b.co' })).status, 403);                                     // no login
  assert.equal((await post(world({ admins: [] }), { action: 'test', to: 'me@b.co' }, ENV, AUTH)).status, 403);     // signed in, not an admin
  assert.equal(resend(w, '/emails').length, 0);
});
test('test send: sends the unsaved draft to the address typed, marked as a test', async () => {
  const w = world({ admins: [{ user_id: 'admin-1' }], saved: SAVED });
  const r = await post(w, { action: 'test', to: 'Me@B.co', template: { subject: 'Draft subject', blocks: [{ type: 'text', text: 'Draft body for {{name}}' }] } }, ENV, AUTH);
  assert.equal(r.status, 200); const m = resend(w, '/emails')[0].body;
  assert.deepEqual(m.to, ['me@b.co']); assert.equal(m.subject, '[Test] Draft subject'); assert.match(m.html, /Draft body for Asha Rao/);
  assert.equal(w.calls.some((c) => c.u.includes('newsletter_subscribers')), false);                                 // a test never adds a subscriber
});
test('test send: without a draft it uses the saved template; bad address and missing Resend setup are explained', async () => {
  const w = world({ admins: [{ user_id: 'admin-1' }], saved: SAVED }); await post(w, { action: 'test', to: 'me@b.co' }, ENV, AUTH);
  assert.equal(resend(w, '/emails')[0].body.subject, '[Test] Hello Asha, welcome');
  assert.equal((await post(world({ admins: [{ user_id: 'admin-1' }] }), { action: 'test', to: 'nope' }, ENV, AUTH)).status, 400);
  const r = await post(world({ admins: [{ user_id: 'admin-1' }] }), { action: 'test', to: 'me@b.co' }, { ...ENV, RESEND_API_KEY: '' }, AUTH); assert.equal(r.status, 503);
});
test("test send: Resend's own reason is shown to the admin", async () => {
  const r = await post(world({ admins: [{ user_id: 'admin-1' }], resendOk: false }), { action: 'test', to: 'me@b.co' }, ENV, AUTH);
  assert.equal(r.status, 502); assert.match((await r.json()).error, /domain not verified/);
});

// ---------- the admin's preview copy must be the same code ----------
test('admin/src/lib/emailHtml.js carries exactly the same renderer as the function', () => {
  const block = (f) => { const s = readFileSync(new URL(f, import.meta.url), 'utf8'); return s.slice(s.indexOf('// ---- email template'), s.indexOf('// ---- end of shared email template ----')); };
  assert.equal(block('../../../admin/src/lib/emailHtml.js'), block('./index.ts'));
});
test('esc and GET/OPTIONS', async () => {
  assert.equal(esc('"&\'<>'), '&quot;&amp;&#39;&lt;&gt;');
  assert.equal((await handle(new Request('https://f', { method: 'GET' }), ENV, world().fetch)).status, 200);
  assert.equal((await handle(new Request('https://f', { method: 'OPTIONS' }), ENV, world().fetch)).status, 200);
});
