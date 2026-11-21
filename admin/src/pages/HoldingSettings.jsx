import { ImageField, TextField } from '../lib/fields';
import { Switch } from '../lib/ui';

/** ISO time <-> the value a datetime-local box wants (the person's own clock). */
const toLocal = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '');
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
const rgba = (c, pct) => { const n = parseInt(c.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.min(100, Math.max(0, Number(pct) || 0)) / 100})`; };

/** A small stand-in for the holding page that follows the settings as they are edited. Close, not pixel-exact: use "Preview the holding page" for the real one. */
function Preview({ h }) {
  const left = h.align === 'left';
  const size = { s: 15, m: 22, l: 32 }[h.titleSize] || 22;
  return (
    <div className="hp" role="img" aria-label="Preview of the holding page"
      style={{ background: hex(h.bg, '#202020'), color: hex(h.fg, '#ffffff'), justifyContent: left ? 'flex-start' : 'center', alignItems: { top: 'flex-start', bottom: 'flex-end' }[h.valign] || 'center' }}>
      {h.image && <><img className="hp__img" src={h.image} alt="" /><i className="hp__ov" style={{ background: rgba(hex(h.overlay, '#000000'), h.overlayOpacity ?? 55) }} /></>}
      <div className="hp__copy" style={{ textAlign: left ? 'left' : 'center', alignItems: left ? 'flex-start' : 'center' }}>
        {h.showLogo && <img src="/logo.webp" alt="" width="26" height="26" />}
        <b style={{ fontSize: size, fontWeight: 400, lineHeight: 1.1 }}>{h.title || 'Your title'}</b>
        {h.text && <span className="hp__text">{h.text}</span>}
        {h.countdown && h.date && <span className="hp__count">12 : 04 : 33 : 10</span>}
        {h.waitlist && <span className="hp__form"><u style={{ borderColor: hex(h.fg, '#ffffff') }}>Your email</u><em style={{ background: hex(h.btnBg, '#ffffff'), color: hex(h.btnFg, '#111111') }}>{h.button || 'Join the waitlist'}</em></span>}
      </div>
    </div>
  );
}

const Color = ({ label, value, onChange, fallback }) => <label className="lbl">{label}<input type="color" value={hex(value, fallback)} onChange={(e) => onChange(e.target.value)} /></label>;
const Seg = ({ label, value, options, onChange }) => (
  <div className="lbl"><span id={`seg-${label}`}>{label}</span>
    <div className="seg" role="radiogroup" aria-labelledby={`seg-${label}`}>
      {options.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'is-on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  </div>
);

/** Every part of the "coming soon" page, edited here. `h` is site.holding, `set(key, value)` updates one setting. */
export default function HoldingSettings({ h, set, store }) {
  return (
    <section className="grp">
      <h2>Holding page</h2>
      <p className="hint">A "coming soon" page that replaces the shop, for a launch or maintenance. Signed-in admins still see the real store: sign in on the storefront with your admin account.</p>
      <div className="line line--gap"><span>{h.on ? 'ON: visitors only see the holding page' : 'Off: the shop is open'}</span><Switch on={h.on} onChange={(v) => set('on', v)} label="Holding page" /></div>

      <Preview h={h} />
      <p className="hint"><a className="ul" href={`${store}/holding-preview`} target="_blank" rel="noreferrer">Open the real holding page</a> (the last saved version, even while it is off).</p>

      <h3 className="sub-h">Words</h3>
      <TextField label="Title" value={h.title} onChange={(v) => set('title', v)} max={120} />
      <TextField label="Text" value={h.text} onChange={(v) => set('text', v)} area max={400} />
      <label className="chk"><input type="checkbox" checked={h.showLogo} onChange={(e) => set('showLogo', e.target.checked)} />Show the KHYAL logo above the title</label>

      <h3 className="sub-h">Background</h3>
      <div className="two">
        <Color label="Background colour" value={h.bg} onChange={(v) => set('bg', v)} fallback="#202020" />
        <div />
      </div>
      <ImageField label="Background photo (optional)" value={h.image} onChange={(v) => set('image', v)} folder="holding" ratio={16 / 9} hint="Covers the whole screen. Without a photo the background colour is used." />

      <h3 className="sub-h">Overlay on the photo</h3>
      <div className="two">
        <Color label="Overlay colour" value={h.overlay} onChange={(v) => set('overlay', v)} fallback="#000000" />
        <label className="lbl">Overlay strength: <b className="tnum">{h.overlayOpacity ?? 55}%</b>
          <input type="range" min="0" max="100" step="1" value={h.overlayOpacity ?? 55} onChange={(e) => set('overlayOpacity', Number(e.target.value))} />
          <small>0% shows the photo as it is, 100% hides it behind the colour.</small></label>
      </div>
      {!h.image && <p className="hint">The overlay only shows once a background photo is added.</p>}

      <h3 className="sub-h">Text, buttons and countdown</h3>
      <div className="two">
        <Color label="Text colour" value={h.fg} onChange={(v) => set('fg', v)} fallback="#ffffff" />
        <div />
        <Color label="Button colour" value={h.btnBg} onChange={(v) => set('btnBg', v)} fallback="#ffffff" />
        <Color label="Button text colour" value={h.btnFg} onChange={(v) => set('btnFg', v)} fallback="#111111" />
      </div>
      <label className="chk"><input type="checkbox" checked={h.waitlist} onChange={(e) => set('waitlist', e.target.checked)} />Show the waitlist sign-up (feeds your subscriber list and the welcome email)</label>
      {h.waitlist && <TextField label="Waitlist button text" value={h.button} onChange={(v) => set('button', v)} max={40} />}
      <label className="chk"><input type="checkbox" checked={h.countdown} onChange={(e) => set('countdown', e.target.checked)} />Show a countdown to the launch time</label>

      <h3 className="sub-h">Layout</h3>
      <Seg label="Alignment" value={h.align} options={[['center', 'Centre'], ['left', 'Left']]} onChange={(v) => set('align', v)} />
      <Seg label="Vertical position" value={h.valign} options={[['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]} onChange={(v) => set('valign', v)} />
      <Seg label="Title size" value={h.titleSize} options={[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]} onChange={(v) => set('titleSize', v)} />

      <h3 className="sub-h">Launch and what stays open</h3>
      <label className="lbl">Launch date and time<input type="datetime-local" value={toLocal(h.date)} onChange={(e) => set('date', e.target.value ? new Date(e.target.value).toISOString() : '')} /><small>Optional. Used for the countdown and the automatic opening below. Your computer's time zone.</small></label>
      <label className="chk"><input type="checkbox" checked={h.autoLift} onChange={(e) => set('autoLift', e.target.checked)} />Open the store automatically at the launch time</label>
      <label className="chk"><input type="checkbox" checked={h.keepInfo} onChange={(e) => set('keepInfo', e.target.checked)} />Keep About, Contact and the policy pages open</label>
      <label className="chk"><input type="checkbox" checked={h.keepTrack} onChange={(e) => set('keepTrack', e.target.checked)} />Keep order tracking open, so existing customers can still follow their parcels</label>
    </section>
  );
}
