// Run: node --test supabase/functions/subscribe/subscribe.test.mjs   Resend and Supabase are replaced by a fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, handle, welcome } from './index.ts';

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', RESEND_API_KEY: 're_secret', RESEND_FROM: 'KHYAL <hello@khyal.store>', RESEND_AUDIENCE_ID: 'aud_1', SITE_URL: 'https://khyal.store' };
function world({ existing = false, dbStatus, resendOk = true } = {}) {
  const w = { calls: [] };
  w.fetch = async (url, init = {}) => {
    const u = String(url), body = init.body ? JSON.parse(init.body) : null; w.calls.push({ u, body, headers: init.headers });
    if (u.includes('/rest/v1/newsletter_subscribers')) return new Response(dbStatus === 500 ? '{"message":"db down"}' : '', { status: dbStatus ?? (existing ? 409 : 201) });
    if (u.includes('api.resend.com')) return new Response(resendOk ? '{"id":"x"}' : '{"message":"domain not verified"}', { status: resendOk ? 200 : 403 });
    return new Response('{}', { status: 404 });
  };
  return w;
}
const post = (w, body, env = ENV) => handle(new Request('https://f/subscribe', { method: 'POST', body: JSON.stringify(body) }), env, w.fetch);
const resend = (w, path) => w.calls.filter((c) => c.u === `https://api.resend.com${path}`);

test('new subscriber: saved, added to the audience, welcome email sent from the configured address', async () => {
  const w = world(); const r = await post(w, { email: ' Asha@Example.com ', name: 'Asha Rao' }); const j = await r.json();
  assert.equal(r.status, 200); assert.deepEqual(j, { ok: true, emailed: true });
  assert.equal(w.calls[0].body.email, 'asha@example.com');                            // trimmed and lower-cased
  const [mail] = resend(w, '/emails'); assert.equal(mail.body.from, 'KHYAL <hello@khyal.store>'); assert.deepEqual(mail.body.to, ['asha@example.com']);
  assert.match(mail.body.html, /Hi Asha Rao,/); assert.match(mail.body.text, /Shop: https:\/\/khyal\.store/);
  const [aud] = resend(w, '/audiences/aud_1/contacts'); assert.equal(aud.body.first_name, 'Asha'); assert.equal(aud.body.unsubscribed, false);
  assert.equal(mail.headers.Authorization, 'Bearer re_secret');
});
test('already subscribed: same friendly answer, and NO email (repeating the form cannot be used to mail someone)', async () => {
  const w = world({ existing: true }); const j = await (await post(w, { email: 'a@b.co' })).json();
  assert.deepEqual(j, { ok: true, already: true }); assert.equal(resend(w, '/emails').length, 0);
});
test('invalid addresses are refused before anything is saved or sent', async () => {
  for (const email of ['', 'nope', 'a@b', 'x'.repeat(250) + '@b.co']) { const w = world(); assert.equal((await post(w, { email })).status, 400); assert.equal(w.calls.length, 0); }
});
test('a name is HTML-escaped in the email (no injected markup)', async () => {
  const w = world(); await post(w, { email: 'a@b.co', name: '<img src=x onerror=alert(1)>' });
  const html = resend(w, '/emails')[0].body.html; assert.equal(html.includes('<img'), false); assert.match(html, /&lt;img/);
  assert.equal(esc('"&\'<>'), '&quot;&amp;&#39;&lt;&gt;');
});
test('a Resend failure (e.g. domain not verified) never loses the sign-up', async () => {
  const w = world({ resendOk: false }); const r = await post(w, { email: 'a@b.co' }); const j = await r.json();
  assert.equal(r.status, 200); assert.deepEqual(j, { ok: true, emailed: false });
});
test('without Resend configured the sign-up still works and nothing is sent', async () => {
  const w = world(); const j = await (await post(w, { email: 'a@b.co' }, { ...ENV, RESEND_API_KEY: '' })).json();
  assert.deepEqual(j, { ok: true, emailed: false }); assert.equal(w.calls.filter((c) => c.u.includes('resend')).length, 0);
});
test('audience is optional', async () => {
  const w = world(); await post(w, { email: 'a@b.co' }, { ...ENV, RESEND_AUDIENCE_ID: undefined });
  assert.equal(resend(w, '/audiences/aud_1/contacts').length, 0); assert.equal(resend(w, '/emails').length, 1);
});
test('a database failure is a generic 500 with no details leaked', async () => {
  const w = world({ dbStatus: 500 }); const r = await post(w, { email: 'a@b.co' }); const t = JSON.stringify(await r.json());
  assert.equal(r.status, 500); assert.equal(t.includes('db down'), false); assert.equal(resend(w, '/emails').length, 0);
});
test('the API key never appears in any response', async () => {
  const w = world(); const t = JSON.stringify(await (await post(w, { email: 'a@b.co' })).json()); assert.equal(t.includes('re_secret'), false);
});
test('welcome() has a plain-text twin and a shop link', () => {
  const m = welcome('', 'https://khyal.store'); assert.match(m.text, /^Hello,/); assert.match(m.html, /href="https:\/\/khyal\.store"/);
});
test('GET and OPTIONS are harmless', async () => {
  assert.equal((await handle(new Request('https://f', { method: 'GET' }), ENV, world().fetch)).status, 200);
  assert.equal((await handle(new Request('https://f', { method: 'OPTIONS' }), ENV, world().fetch)).status, 200);
});
