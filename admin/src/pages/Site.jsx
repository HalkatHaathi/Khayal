import { useState } from 'react';
import { DEFAULTS } from '../content';
import { Failed, PageHead, Switch, useAsync, useToast } from '../lib/ui';
import { ImageField, LinkField, TextField, loadContent, okLink, saveContent } from '../lib/fields';
import { Bar } from './HomeEditor';

const STORE = import.meta.env.VITE_STORE_URL || 'https://khyal.store';
/** ISO time <-> the value a datetime-local box wants (the person's own clock). */
const toLocal = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '');
const merge = (s) => ({ ...DEFAULTS.site, ...s, announcement: { ...DEFAULTS.site.announcement, ...s?.announcement }, social: { ...DEFAULTS.site.social, ...s?.social }, tracking: { ...DEFAULTS.site.tracking, ...s?.tracking }, holding: { ...DEFAULTS.site.holding, ...s?.holding } });

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
  const hold = (k, v) => setF({ ...f, holding: { ...f.holding, [k]: v } });
  const trk = (k, v) => setF({ ...f, tracking: { ...f.tracking, [k]: v } });
  const soc = (k, v) => setF({ ...f, social: { ...f.social, [k]: v } });

  const save = async () => {
    const hd = f.holding;
    if (hd.on && !hd.title.trim()) return toast('The holding page needs a title, or switch it off.', 'err');
    if (hd.autoLift && !hd.date) return toast('Set a launch time, or untick "open the store automatically".', 'err');
    if (hd.on && !JSON.parse(init).holding.on && !window.confirm('Turn on the holding page? Visitors will no longer be able to see or buy from the shop until you switch it off.')) return;
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
      <PageHead title="Site" sub="Holding page, announcement bar, contact details, social links and footer text." />
      <div className="edit edit--one"><div className="edit__main">
        <section className="grp">
          <h2>Holding page</h2>
          <p className="hint">A "coming soon" page that replaces the shop, for a launch or maintenance. The waitlist, info pages and order tracking can stay open. Signed-in admins still see the real store: sign in on the storefront with your admin account.</p>
          <div className="line line--gap"><span>{f.holding.on ? 'ON: visitors only see the holding page' : 'Off: the shop is open'}</span><Switch on={f.holding.on} onChange={(v) => hold('on', v)} label="Holding page" /></div>
          <TextField label="Title" value={f.holding.title} onChange={(v) => hold('title', v)} max={120} />
          <TextField label="Text" value={f.holding.text} onChange={(v) => hold('text', v)} area max={400} />
          <ImageField label="Background photo (optional)" value={f.holding.image} onChange={(v) => hold('image', v)} folder="holding" ratio={16 / 9} hint="Covers the whole screen with a dark layer over it so the text stays readable. Empty shows a plain dark page." />
          <label className="lbl">Launch date and time<input type="datetime-local" value={toLocal(f.holding.date)} onChange={(e) => hold('date', e.target.value ? new Date(e.target.value).toISOString() : '')} /><small>Optional. Used for the countdown and the automatic opening below. Your computer's time zone.</small></label>
          <label className="chk"><input type="checkbox" checked={f.holding.countdown} onChange={(e) => hold('countdown', e.target.checked)} />Show a countdown to the launch time</label>
          <label className="chk"><input type="checkbox" checked={f.holding.autoLift} onChange={(e) => hold('autoLift', e.target.checked)} />Open the store automatically at the launch time</label>
          <label className="chk"><input type="checkbox" checked={f.holding.waitlist} onChange={(e) => hold('waitlist', e.target.checked)} />Show the waitlist sign-up (sends people to your subscriber list and the welcome email)</label>
          {f.holding.waitlist && <TextField label="Waitlist button text" value={f.holding.button} onChange={(v) => hold('button', v)} max={40} />}
          <label className="chk"><input type="checkbox" checked={f.holding.keepInfo} onChange={(e) => hold('keepInfo', e.target.checked)} />Keep About, Contact and the policy pages open</label>
          <label className="chk"><input type="checkbox" checked={f.holding.keepTrack} onChange={(e) => hold('keepTrack', e.target.checked)} />Keep order tracking open, so existing customers can still follow their parcels</label>
          <p className="hint"><a className="ul" href={`${STORE}/holding-preview`} target="_blank" rel="noreferrer">Preview the holding page</a> (shows the last saved version, even while it is off).</p>
        </section>
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
