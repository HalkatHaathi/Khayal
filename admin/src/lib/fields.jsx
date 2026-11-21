import { useRef, useState } from 'react';
import { supabase } from './supabase';
import { Icon, useToast } from './ui';
import Cropper from './Cropper';

export const okLink = (v) => !v || /^\/[^\s]*$/.test(v) || /^https?:\/\/[^\s]+$/i.test(v);
export const uid = () => Math.random().toString(36).slice(2, 9);

/** Upload one image to a public bucket and return its URL. */
export async function uploadImage(file, bucket, folder) {
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error('Use a JPG, PNG, WebP or AVIF image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('That image is over 8 MB. Resize it first.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Photo picker for site content. Picking a file opens the cropper first, so the person decides what part of it is shown. Empty = the storefront keeps its built-in colour block. */
export function ImageField({ label, value, onChange, folder = 'site', hint, ratio }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const ref = useRef();
  const upload = async (file) => {
    setPending(null); setBusy(true);
    try { onChange(await uploadImage(file, 'site-images', folder)); } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const pick = (file) => {
    ref.current.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) return toast('Use a JPG, PNG, WebP or AVIF image.', 'err');
    setPending(file);
  };
  return (
    <div className="lbl">
      {label}
      <div className="imgfield">
        {value ? <img src={value} alt="" /> : <span className="imgfield__none">No photo</span>}
        <div>
          <button type="button" className="btn btn--line btn--sm" onClick={() => ref.current.click()} disabled={busy}><Icon.Upload size={14} />{busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}</button>
          {value && <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange('')}>Remove</button>}
        </div>
        <input ref={ref} type="file" hidden accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => pick(e.target.files[0])} />
      </div>
      {hint && <small>{hint}</small>}
      {pending && <Cropper file={pending} ratio={ratio} onDone={upload} onOriginal={() => upload(pending)} onCancel={() => setPending(null)} />}
    </div>
  );
}

/** Text box with the site's known addresses as suggestions. Accepts /paths and https:// links. */
export function LinkField({ label, value, onChange, links = [], hint }) {
  return (
    <label className="lbl">{label}
      <input value={value || ''} list="site-links" onChange={(e) => onChange(e.target.value.trim())} placeholder="/collections/jackets or https://…" className={okLink(value) ? '' : 'bad'} />
      {okLink(value) ? (hint && <small>{hint}</small>) : <small className="err">Start with / for a page on this site, or https:// for another site.</small>}
      <datalist id="site-links">{links.map((l) => <option key={l} value={l} />)}</datalist>
    </label>
  );
}

export const TextField = ({ label, value, onChange, hint, area, max, placeholder }) => (
  <label className="lbl">{label}
    {area ? <textarea rows={4} value={value || ''} maxLength={max} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      : <input value={value || ''} maxLength={max} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
    {hint && <small>{hint}</small>}
  </label>
);

/** Up / down / remove controls for a list row. */
export const RowTools = ({ i, n, move, remove, label }) => (
  <span className="imgs__act">
    <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${label} up`}><Icon.Up size={16} /></button>
    <button type="button" className="icon-btn" disabled={i === n - 1} onClick={() => move(i, 1)} aria-label={`Move ${label} down`}><Icon.Down size={16} /></button>
    <button type="button" className="icon-btn" onClick={remove} aria-label={`Remove ${label}`}><Icon.Trash size={16} /></button>
  </span>
);
export const moveIn = (arr, i, d) => { const a = [...arr]; [a[i], a[i + d]] = [a[i + d], a[i]]; return a; };

/** Every address an editor is likely to want, for the link suggestions. */
export function useKnownLinks(collections = [], pages = []) {
  return ['/', '/cart', '/search', '/track', '/about', '/contact', '/account', ...collections.map((c) => `/collections/${c}`), ...pages.map((p) => `/pages/${p}`), '/policies/shipping', '/policies/returns', '/policies/privacy', '/policies/terms'];
}

/** Load the jsonb document stored under `key`, or the default when nothing is saved yet. */
export async function loadContent(key, fallback) {
  const { data, error } = await supabase.from('site_content').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value ?? fallback;
}
export const saveContent = async (key, value) => {
  const { error } = await supabase.from('site_content').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
};
