import { useMemo, useState } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabase';
import { Failed, Icon, PageHead, useAsync, useToast } from '../lib/ui';
import { ImageField, LinkField, RowTools, TextField, loadContent, moveIn, okLink, saveContent, uid, useKnownLinks } from '../lib/fields';
import { cleanTemplate, renderEmail } from '../lib/emailHtml';
import { Bar } from './HomeEditor';

const STORE = import.meta.env.VITE_STORE_URL || 'https://khyal.store';
const KINDS = [['heading', 'Heading'], ['text', 'Paragraph'], ['button', 'Button'], ['image', 'Image'], ['divider', 'Divider line']];
const NEW = { heading: { text: 'A new heading' }, text: { text: 'Write something here.' }, button: { label: 'Shop now', link: '/' }, image: { src: '', alt: '' }, divider: {} };
const withIds = (t) => ({ ...t, blocks: t.blocks.map((b) => ({ ...b, id: uid() })) });
const strip = (t) => ({ ...t, blocks: t.blocks.map(({ id, ...b }) => b) });
/** Edge Function errors arrive as a Response; pull the message out. */
const fnError = async (error) => { try { return (await error.context.json()).error; } catch { return error.message; } };

export default function Emails() {
  const { data, error, loading, reload } = useAsync(async () => {
    const doc = await loadContent('emails', {});
    return { doc, welcome: withIds(cleanTemplate(doc.welcome)) };
  });
  if (error) return <Failed error={error} retry={reload} />;
  if (loading || !data) return <PageHead title="Emails" />;
  return <Editor data={data} />;
}

function Editor({ data }) {
  const toast = useToast();
  const { user, preview } = useAuth();
  const initial = useMemo(() => JSON.stringify(data.welcome), [data]);
  const [t, setT] = useState(data.welcome);
  const [add, setAdd] = useState('text');
  const [to, setTo] = useState(user?.email && !preview ? user.email : '');
  const [busy, setBusy] = useState(false);
  const links = useKnownLinks();
  const dirty = JSON.stringify(t) !== initial;
  const set = (k, v) => setT((x) => ({ ...x, [k]: v }));
  const patch = (id, k, v) => setT((x) => ({ ...x, blocks: x.blocks.map((b) => (b.id === id ? { ...b, [k]: v } : b)) }));
  const html = useMemo(() => renderEmail(strip(t), { name: 'Asha Rao', shop_url: STORE }).html, [t]);

  const save = async () => {
    if (!t.subject.trim()) return toast('The email needs a subject.', 'err');
    if (t.blocks.some((b) => b.type === 'button' && !okLink(b.link))) return toast('A button link is not valid. Use /a-page or https://…', 'err');
    setBusy(true);
    try { await saveContent('emails', { ...data.doc, welcome: strip(t) }); toast('Welcome email saved'); setTimeout(() => window.location.reload(), 500); }
    catch (e) { toast(e.message, 'err'); setBusy(false); }
  };
  const test = async () => {
    if (!/^\S+@\S+\.\S+$/.test(to)) return toast('Enter the address to send the test to.', 'err');
    setBusy(true);
    const { error: e } = await supabase.functions.invoke('subscribe', { body: { action: 'test', to, template: strip(t) } });
    setBusy(false);
    if (e) return toast(await fnError(e), 'err');
    toast(`Test sent to ${to}. Check spam if it does not arrive.`);
  };

  return (
    <>
      <PageHead title="Emails" sub="The welcome email new newsletter subscribers receive. Change the wording and layout here; nothing needs coding." />
      <div className="emails">
        <div>
          <section className="grp">
            <h2>Welcome email</h2>
            <TextField label="Subject" value={t.subject} onChange={(v) => set('subject', v)} max={150} />
            <TextField label="Preview text" value={t.preheader} onChange={(v) => set('preheader', v)} max={150} hint="The grey line shown next to the subject in most inboxes." />
            <div className="two">
              <label className="lbl">Button colour<input type="color" value={t.accent} onChange={(e) => set('accent', e.target.value)} /></label>
              <ImageField label="Logo (optional)" value={t.logo} onChange={(v) => set('logo', v)} folder="email" ratio={3} hint="Empty shows the KHYAL wordmark." />
            </div>
          </section>

          <section className="grp">
            <h2>Content</h2>
            <p className="hint">Use <code>{'{{first_name}}'}</code>, <code>{'{{name}}'}</code>, <code>{'{{shop_url}}'}</code> and <code>{'{{site}}'}</code> anywhere in the text. They are filled in for each person.</p>
            {t.blocks.map((b, i) => (
              <div key={b.id} className="item">
                <div className="item__bar"><span>{KINDS.find(([k]) => k === b.type)?.[1]}</span>
                  <RowTools i={i} n={t.blocks.length} move={(idx, d) => set('blocks', moveIn(t.blocks, idx, d))} remove={() => set('blocks', t.blocks.filter((x) => x.id !== b.id))} label={`block ${i + 1}`} /></div>
                {b.type === 'heading' && <TextField label="Heading" value={b.text} onChange={(v) => patch(b.id, 'text', v)} max={200} />}
                {b.type === 'text' && <TextField label="Text" value={b.text} onChange={(v) => patch(b.id, 'text', v)} area max={2000} hint="A new line starts a new line in the email." />}
                {b.type === 'button' && <><TextField label="Button text" value={b.label} onChange={(v) => patch(b.id, 'label', v)} max={60} /><LinkField label="Links to" value={b.link} onChange={(v) => patch(b.id, 'link', v)} links={links} hint="A page on your shop (/collections/sale) or a full https:// address." /></>}
                {b.type === 'image' && <><ImageField label="Photo" value={b.src} onChange={(v) => patch(b.id, 'src', v)} folder="email" ratio={3 / 2} /><TextField label="Describe the photo" value={b.alt} onChange={(v) => patch(b.id, 'alt', v)} max={200} hint="Shown when the photo is blocked, and read aloud by screen readers." /></>}
                {b.type === 'divider' && <p className="hint">A thin line between two parts of the email.</p>}
              </div>
            ))}
            <div className="addbar">
              <select aria-label="Block type" value={add} onChange={(e) => setAdd(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <button className="btn btn--line" onClick={() => set('blocks', [...t.blocks, { id: uid(), type: add, ...NEW[add] }])} disabled={t.blocks.length >= 20}><Icon.Plus size={14} />Add</button>
            </div>
          </section>

          <section className="grp">
            <h2>Footer</h2>
            <TextField label="Small print" value={t.footer} onChange={(v) => set('footer', v)} area max={600} hint="Keep a line telling people why they got this and how to leave." />
          </section>
        </div>

        <aside className="emails__prev">
          <h2 className="sec-t">Preview</h2>
          <iframe title="Email preview" srcDoc={html} sandbox="" />
          <p className="hint">Shown with a sample name. Inboxes differ slightly, so send yourself a test.</p>
          <div className="emails__test">
            <label className="lbl">Send a test to<input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" /></label>
            <button className="btn btn--line" onClick={test} disabled={busy}>{busy ? 'Sending…' : 'Send test email'}</button>
          </div>
          <p className="hint">The test uses what is on screen now, saved or not, and never adds a subscriber.</p>
        </aside>
      </div>
      <Bar dirty={dirty} busy={busy} save={save} />
    </>
  );
}
