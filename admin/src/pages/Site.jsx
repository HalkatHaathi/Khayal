import { useState } from 'react';
import { DEFAULTS } from '../content';
import { Failed, PageHead, Switch, useAsync, useToast } from '../lib/ui';
import { LinkField, TextField, loadContent, okLink, saveContent } from '../lib/fields';
import { Bar } from './HomeEditor';

const merge = (s) => ({ ...DEFAULTS.site, ...s, announcement: { ...DEFAULTS.site.announcement, ...s?.announcement }, social: { ...DEFAULTS.site.social, ...s?.social }, tracking: { ...DEFAULTS.site.tracking, ...s?.tracking } });

export default function Site() {
  const { data, error, loading, reload } = useAsync(async () => merge(await loadContent('site', DEFAULTS.site)));
  if (error) return <Failed error={error} retry={reload} />;
  if (loading || !data) return <PageHead title="Site" />;
  return <Form s={data} />;
}

function Form({ s }) {
  const toast = useToast();
  const init = JSON.stringify(s);
  const [f, setF] = useState(s);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== init;
  const ann = (k, v) => setF({ ...f, announcement: { ...f.announcement, [k]: v } });
  const trk = (k, v) => setF({ ...f, tracking: { ...f.tracking, [k]: v } });
  const soc = (k, v) => setF({ ...f, social: { ...f.social, [k]: v } });

  const save = async () => {
    if (!f.tracking.title.trim()) return toast('The tracking page needs a heading.', 'err');
    if (f.announcement.on && !f.announcement.text.trim()) return toast('Write the announcement text, or switch it off.', 'err');
    if (![f.announcement.link, ...Object.values(f.social)].every(okLink)) return toast('One of the links is not valid. Look for the red field.', 'err');
    if (f.whatsapp && !/^\d{8,15}$/.test(f.whatsapp.replace(/\D/g, ''))) return toast('WhatsApp number: country code then number, digits only.', 'err');
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return toast('That email address does not look right.', 'err');
    setBusy(true);
    try { await saveContent('site', { ...f, whatsapp: f.whatsapp.replace(/\D/g, '') }); toast('Site settings saved'); setTimeout(() => window.location.reload(), 500); } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  return (
    <>
      <PageHead title="Site" sub="Announcement bar, contact details, social links and footer text." />
      <div className="edit edit--one"><div className="edit__main">
        <section className="grp">
          <h2>Announcement bar</h2>
          <p className="hint">A slim bar above the header on every page. Good for sale dates and shipping notices.</p>
          <div className="line line--gap"><span>{f.announcement.on ? 'Showing on the store' : 'Hidden'}</span><Switch on={f.announcement.on} onChange={(v) => ann('on', v)} label="Show the announcement bar" /></div>
          <TextField label="Message" value={f.announcement.text} onChange={(v) => ann('text', v)} max={140} placeholder="Free shipping on orders above Rs. 15,000" />
          <LinkField label="Links to (optional)" value={f.announcement.link} onChange={(v) => ann('link', v)} links={['/collections/sale', '/collections/new-arrivals']} />
        </section>
        <section className="grp">
          <h2>Contact</h2>
          <div className="two">
            <TextField label="WhatsApp number" value={f.whatsapp} onChange={(v) => setF({ ...f, whatsapp: v })} max={20} placeholder="919876543210" hint="Country code first, no + or spaces. Empty hides the chat button." />
            <TextField label="Contact email" value={f.email} onChange={(v) => setF({ ...f, email: v })} max={120} hint="Used by the contact page when the form cannot send." />
          </div>
        </section>
        <section className="grp">
          <h2>Social links</h2>
          <p className="hint">Leave one empty to hide its icon in the footer.</p>
          <LinkField label="Instagram" value={f.social.instagram} onChange={(v) => soc('instagram', v)} />
          <LinkField label="Facebook" value={f.social.facebook} onChange={(v) => soc('facebook', v)} />
          <LinkField label="X" value={f.social.x} onChange={(v) => soc('x', v)} />
        </section>
        <section className="grp">
          <h2>Tracking page</h2>
          <p className="hint">The page customers open at /track to follow a parcel. Courier updates fill the rest by themselves.</p>
          <TextField label="Heading" value={f.tracking.title} onChange={(v) => trk('title', v)} max={60} />
          <TextField label="Intro under the heading" value={f.tracking.intro} onChange={(v) => trk('intro', v)} area max={200} />
          <TextField label="Help text" value={f.tracking.help} onChange={(v) => trk('help', v)} area max={200} hint="Shown beside the form and next to the order summary, above the WhatsApp button." />
        </section>
        <section className="grp">
          <h2>Footer</h2>
          <TextField label="Copyright line" value={f.copyright} onChange={(v) => setF({ ...f, copyright: v })} max={80} />
        </section>
      </div></div>
      <Bar dirty={dirty} busy={busy} save={save} />
    </>
  );
}
