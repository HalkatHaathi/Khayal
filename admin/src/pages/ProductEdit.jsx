import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Failed, Icon, PageHead, SIZES, Switch, Thumb, WAIST, bySize, ok, slugify, useAsync, useToast } from '../lib/ui';

const BUCKET = 'product-images';
const BLANK = { name: '', slug: '', type: '', kind: 'tee', craft: '', description: '', price: '', compare_at: '', price_from: false, pants_addon: '', fit: 'Men', tone: '#cfc8bd', alt_tone: '#b9b2a6', is_active: false, gallery_layout: 'feature', show_stock: true };
const STORE = import.meta.env.VITE_STORE_URL || 'http://localhost:5173';

async function load(id) {
  const [cols, links, types] = await Promise.all([
    supabase.from('collections').select('slug,title,type_filter,on_sale,all_products,sort').order('sort').then(ok),
    supabase.from('collection_products').select('collection_slug,product_id,position').then(ok),
    supabase.from('products').select('type').then(ok),
  ]);
  const base = { cols: cols.filter((c) => !c.type_filter && !c.on_sale && !c.all_products), links, types: [...new Set(types.map((t) => t.type))].sort() };
  if (id === 'new') return { ...base, product: null };
  const { data, error } = await supabase.from('products').select('*, product_sizes(size,stock), product_images(id,url,alt,position)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('That product does not exist.');
  return { ...base, product: data };
}

// the photo layouts the product page can show. Rectangles are [x, y, w, h] on a 48 x 58 sketch; keep in step with the .pdp__track--* rules in the storefront CSS.
const LAYOUTS = [
  ['feature', 'Large, then pairs', 'The first photo runs full width, the rest sit two across.', [[0, 0, 48, 22], [0, 24, 23, 16], [25, 24, 23, 16], [0, 42, 23, 16], [25, 42, 23, 16]]],
  ['pairs', 'Two across', 'Every photo in a two-column grid.', [[0, 0, 23, 16], [25, 0, 23, 16], [0, 18, 23, 16], [25, 18, 23, 16], [0, 36, 23, 16], [25, 36, 23, 16]]],
  ['stack', 'One column', 'One large photo per row.', [[0, 0, 48, 17], [0, 19, 48, 17], [0, 38, 48, 17]]],
  ['alternate', 'Large, pair, large', 'A full-width photo, then two, repeating.', [[0, 0, 48, 17], [0, 19, 23, 17], [25, 19, 23, 17], [0, 38, 48, 17]]],
  ['carousel', 'Swipe', 'One photo at a time, with arrows.', [[6, 5, 36, 46]]],
];
const Sketch = ({ rects }) => (
  <svg viewBox="0 0 48 58" width="44" height="54" aria-hidden="true">{rects.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} fill="currentColor" opacity={i === 0 ? 0.9 : 0.45} />)}</svg>
);

export default function ProductEdit() {
  const { id } = useParams();
  const { data, error, loading, reload } = useAsync(() => load(id), [id]);
  if (error) return <Failed error={error} retry={reload} />;
  if (loading || !data) return <PageHead title="Product" />;
  return <Editor key={id} data={data} isNew={id === 'new'} />;
}

function Editor({ data, isNew }) {
  const nav = useNavigate();
  const toast = useToast();
  const p = data.product;
  const pid = useRef(p?.id || crypto.randomUUID()).current;
  const initial = useMemo(() => ({
    f: p ? { ...BLANK, ...p, price: String(p.price), compare_at: p.compare_at ?? '', pants_addon: p.pants_addon ?? '' } : BLANK,
    sizes: (p?.product_sizes || []).map((s) => ({ ...s })).sort((a, b) => bySize(a.size, b.size)),
    images: [...(p?.product_images || [])].sort((a, b) => a.position - b.position),
    inCols: data.links.filter((l) => l.product_id === pid).map((l) => l.collection_slug),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState(initial.f);
  const [sizes, setSizes] = useState(initial.sizes);
  const [images, setImages] = useState(initial.images);
  const [inCols, setInCols] = useState(initial.inCols);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(0);
  const [newSize, setNewSize] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const dirty = JSON.stringify([f, sizes, images, inCols]) !== JSON.stringify([initial.f, initial.sizes, initial.images, initial.inCols]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setName = (e) => { const name = e.target.value; setF((x) => ({ ...x, name, slug: slugTouched ? x.slug : slugify(name) })); };

  // ---------- sizes ----------
  const addSizes = (list) => setSizes((cur) => [...cur, ...list.filter((s) => !cur.some((c) => c.size === s)).map((size) => ({ size, stock: 0 }))].sort((a, b) => bySize(a.size, b.size)));
  const addCustom = () => { const s = newSize.trim().toUpperCase().slice(0, 12); if (s) addSizes([s]); setNewSize(''); };

  // ---------- photos ----------
  const upload = async (files) => {
    setUp((n) => n + files.length);
    for (const file of files) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${pid}/${crypto.randomUUID()}.${ext}`;
      const { error: e } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
      if (e) toast(`${file.name}: ${e.message}`, 'err');
      else setImages((cur) => [...cur, { id: crypto.randomUUID(), url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, alt: '', position: cur.length }]);
      setUp((n) => n - 1);
    }
  };
  const move = (i, d) => setImages((cur) => { const a = [...cur]; [a[i], a[i + d]] = [a[i + d], a[i]]; return a; });

  // ---------- save ----------
  const validate = () => {
    const e = {};
    if (!f.name.trim()) e.name = 'Give the product a name.';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)) e.slug = 'Use lowercase letters, numbers and hyphens.';
    if (!f.type.trim()) e.type = 'Pick or type a category.';
    const price = Number(f.price);
    if (f.price === '' || !Number.isInteger(price) || price < 0) e.price = 'Whole rupees, 0 or more.';
    if (f.compare_at !== '' && !(Number.isInteger(Number(f.compare_at)) && Number(f.compare_at) > price)) e.compare_at = 'Must be higher than the price.';
    if (f.pants_addon !== '' && !(Number.isInteger(Number(f.pants_addon)) && Number(f.pants_addon) >= 0)) e.pants_addon = 'Whole rupees, 0 or more.';
    if (sizes.some((s) => !Number.isInteger(Number(s.stock)) || Number(s.stock) < 0)) e.sizes = 'Stock must be a whole number, 0 or more.';
    setErrs(e);
    return !Object.keys(e).length;
  };

  const save = async () => {
    if (!validate()) { toast('Fix the highlighted fields first.', 'err'); return; }
    setBusy(true);
    try {
      const row = {
        id: pid, slug: f.slug, name: f.name.trim(), type: f.type.trim(), kind: f.kind, craft: f.craft.trim(), description: f.description.trim(),
        price: Number(f.price), compare_at: f.compare_at === '' ? null : Number(f.compare_at), price_from: f.price_from,
        pants_addon: f.pants_addon === '' ? null : Number(f.pants_addon), tone: f.tone, alt_tone: f.alt_tone, fit: f.fit.trim() || 'Men', is_active: f.is_active,
      };
      if (f.gallery_layout !== 'feature' || (p && 'gallery_layout' in p)) row.gallery_layout = f.gallery_layout; // the column exists after migration 0011
      if (!f.show_stock || (p && 'show_stock' in p)) row.show_stock = f.show_stock; // the column exists after migration 0012
      if (isNew) {
        const top = await supabase.from('products').select('sort').order('sort', { ascending: false }).limit(1).then(ok);
        row.sort = (top[0]?.sort ?? 0) + 1; // storefront shows the highest sort first
      }
      ok(await supabase.from('products').upsert(row));

      // stock: write only sizes the admin touched, so a sale that landed while this page was open is not overwritten
      const was = new Map(initial.sizes.map((s) => [s.size, s.stock]));
      const touched = sizes.filter((s) => !was.has(s.size) || was.get(s.size) !== Number(s.stock)).map((s) => ({ product_id: pid, size: s.size, stock: Number(s.stock) }));
      const gone = initial.sizes.map((s) => s.size).filter((s) => !sizes.some((x) => x.size === s));
      if (gone.length) ok(await supabase.from('product_sizes').delete().eq('product_id', pid).in('size', gone));
      if (touched.length) ok(await supabase.from('product_sizes').upsert(touched));

      const goneImgs = initial.images.filter((i) => !images.some((x) => x.id === i.id));
      if (goneImgs.length) ok(await supabase.from('product_images').delete().in('id', goneImgs.map((i) => i.id)));
      if (images.length) ok(await supabase.from('product_images').upsert(images.map((i, n) => ({ id: i.id, product_id: pid, url: i.url, alt: i.alt || '', position: n }))));
      const paths = goneImgs.map((i) => i.url.split(`/${BUCKET}/`)[1]).filter(Boolean);
      if (paths.length) supabase.storage.from(BUCKET).remove(paths); // best effort

      const drop = initial.inCols.filter((c) => !inCols.includes(c));
      const add = inCols.filter((c) => !initial.inCols.includes(c));
      if (drop.length) ok(await supabase.from('collection_products').delete().eq('product_id', pid).in('collection_slug', drop));
      if (add.length) {
        const count = (slug) => data.links.filter((l) => l.collection_slug === slug).length;
        ok(await supabase.from('collection_products').insert(add.map((c) => ({ collection_slug: c, product_id: pid, position: count(c) }))));
      }
      toast(isNew ? 'Product created' : 'Changes saved');
      if (isNew) nav(`/products/${pid}`, { replace: true }); else window.location.reload(); // reload re-reads everything so the saved state is what the database holds
    } catch (e) {
      toast(e.code === '23505' ? 'Another product already uses that URL name.' : /gallery_layout/.test(e.message || '') ? 'Photo layouts need a database update: run supabase/migrations/0011_gallery_layout.sql, then save again.' : /show_stock/.test(e.message || '') ? 'The stock-count switch needs a database update: run supabase/migrations/0012_show_stock.sql, then save again.' : e.message || 'Could not save.', 'err');
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      ok(await supabase.from('products').delete().eq('id', pid));
      const files = await supabase.storage.from(BUCKET).list(pid);
      if (files.data?.length) supabase.storage.from(BUCKET).remove(files.data.map((x) => `${pid}/${x.name}`));
      toast('Product deleted');
      nav('/products', { replace: true });
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  const fe = (k) => errs[k] && <p className="err" role="alert">{errs[k]}</p>;
  const isKurta = f.type.trim().toLowerCase() === 'kurtas';
  const total = sizes.reduce((a, s) => a + Number(s.stock || 0), 0);

  return (
    <>
      <Link to="/products" className="back"><Icon.Back size={14} />Products</Link>
      <PageHead title={isNew ? 'New product' : f.name || 'Product'} sub={isNew ? 'Hidden until you switch it live.' : null}>
        {!isNew && f.is_active && <a className="btn btn--line" href={`${STORE}/products/${f.slug}`} target="_blank" rel="noreferrer">View on store<Icon.External size={14} /></a>}
      </PageHead>

      <div className="edit">
        <div className="edit__main">
          <section className="grp">
            <h2>Details</h2>
            <label className="lbl">Name<input value={f.name} onChange={setName} className={errs.name ? 'bad' : ''} />{fe('name')}</label>
            <label className="lbl">Craft note<input value={f.craft} onChange={set('craft')} placeholder="Hand embroidery +2" /><small>Shown under the name on product cards.</small></label>
            <label className="lbl">Description<textarea rows={5} value={f.description} onChange={set('description')} /></label>
          </section>

          <section className="grp">
            <h2>Photos</h2>
            <p className="hint">First photo is the main image, the second shows on hover. JPG, PNG, WebP or AVIF, up to 5 MB each.</p>
            <div className="lay" role="radiogroup" aria-label="Photo layout on the product page">
              {LAYOUTS.map(([k, name, desc, rects]) => (
                <button key={k} type="button" role="radio" aria-checked={f.gallery_layout === k} className={`lay__opt ${f.gallery_layout === k ? 'is-on' : ''}`} onClick={() => setF((x) => ({ ...x, gallery_layout: k }))}>
                  <Sketch rects={rects} /><span><strong>{name}</strong><small>{desc}</small></span>
                </button>
              ))}
            </div>
            {images.length > 0 && (
              <div className="lay__prev" aria-label="Layout preview">
                <p className="hint">Preview on the product page (computers; phones always swipe):</p>
                <div className={`gp gp--${f.gallery_layout}`}>{images.map((im) => <img key={im.id} src={im.url} alt="" />)}</div>
              </div>
            )}
            <ul className="imgs">
              {images.map((im, i) => (
                <li key={im.id}>
                  <div className="imgs__pic"><img src={im.url} alt={im.alt} /><span className="imgs__tag">{i === 0 ? 'Main' : i === 1 ? 'Hover' : i + 1}</span></div>
                  <input aria-label="Describe this photo" placeholder="Describe the photo" value={im.alt} onChange={(e) => setImages((c) => c.map((x) => (x.id === im.id ? { ...x, alt: e.target.value } : x)))} />
                  <div className="imgs__act">
                    <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier"><Icon.Left size={16} /></button>
                    <button type="button" className="icon-btn" disabled={i === images.length - 1} onClick={() => move(i, 1)} aria-label="Move later"><Icon.Right size={16} /></button>
                    <button type="button" className="icon-btn" onClick={() => setImages((c) => c.filter((x) => x.id !== im.id))} aria-label="Remove photo"><Icon.Trash size={16} /></button>
                  </div>
                </li>
              ))}
              <li>
                <label className="drop">
                  <Icon.Upload /><span>{up ? `Uploading ${up}…` : 'Add photos'}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} />
                </label>
              </li>
            </ul>
          </section>

          <section className="grp">
            <h2>Pricing</h2>
            <div className="two">
              <label className="lbl">Price (Rs.)<input inputMode="numeric" value={f.price} onChange={set('price')} className={errs.price ? 'bad' : ''} />{fe('price')}</label>
              <label className="lbl">Compare-at price (Rs.)<input inputMode="numeric" value={f.compare_at} onChange={set('compare_at')} className={errs.compare_at ? 'bad' : ''} />{errs.compare_at ? fe('compare_at') : <small>Struck through. Also puts the product in Sale.</small>}</label>
            </div>
            {isKurta && <label className="lbl">"With pants" add-on (Rs.)<input inputMode="numeric" value={f.pants_addon} onChange={set('pants_addon')} className={errs.pants_addon ? 'bad' : ''} />{fe('pants_addon')}</label>}
            <label className="chk"><input type="checkbox" checked={f.price_from} onChange={set('price_from')} />Show as “From Rs. {f.price || '…'}” because the price varies</label>
            <p className="hint">Prices include GST. Shipping and the cash-on-delivery fee are set in Settings (Phase 4).</p>
          </section>

          <section className="grp">
            <h2>Sizes and stock <span className="tnum count">{total} units</span></h2>
            {sizes.length === 0 && <p className="hint">No sizes yet. A product with no sizes cannot be bought.</p>}
            <ul className="sizes">
              {sizes.map((s) => (
                <li key={s.size} className={Number(s.stock) === 0 ? 'is-out' : Number(s.stock) <= 3 ? 'is-low' : ''}>
                  <span>{s.size}</span>
                  <input type="number" min="0" inputMode="numeric" aria-label={`Stock for size ${s.size}`} value={s.stock} onChange={(e) => setSizes((c) => c.map((x) => (x.size === s.size ? { ...x, stock: e.target.value } : x)))} />
                  <button type="button" className="icon-btn" onClick={() => setSizes((c) => c.filter((x) => x.size !== s.size))} aria-label={`Remove size ${s.size}`}><Icon.Close size={14} /></button>
                </li>
              ))}
            </ul>
            {fe('sizes')}
            <div className="addsize">
              <button type="button" className="btn btn--line btn--sm" onClick={() => addSizes(SIZES)}>Add S to XXL</button>
              <button type="button" className="btn btn--line btn--sm" onClick={() => addSizes(WAIST)}>Add waist 28 to 36</button>
              <input aria-label="Custom size" placeholder="Custom size" value={newSize} onChange={(e) => setNewSize(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
              <button type="button" className="btn btn--line btn--sm" onClick={addCustom} disabled={!newSize.trim()}>Add</button>
            </div>
          </section>
        </div>

        <aside className="edit__rail">
          <section className="grp">
            <h2>Visibility</h2>
            <div className="line"><span>{f.is_active ? 'Live on the store' : 'Hidden from the store'}</span><Switch on={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Live on the store" /></div>
            <div className="line line--gap"><span>{f.show_stock ? 'Show how many are left' : 'Hide the stock count'}</span><Switch on={f.show_stock} onChange={(v) => setF({ ...f, show_stock: v })} label="Show remaining stock to customers" /></div>
            <p className="hint">On: shoppers see “Only 3 left in M, no restocking” when a size runs low. Off: they only see whether a size is available or sold out.</p>
          </section>

          <section className="grp">
            <h2>Organisation</h2>
            <label className="lbl">Category<input list="types" value={f.type} onChange={set('type')} className={errs.type ? 'bad' : ''} /><datalist id="types">{data.types.map((t) => <option key={t} value={t} />)}</datalist>{errs.type ? fe('type') : <small>Collections can list every product of a category.</small>}</label>
            <label className="lbl">Fit<input value={f.fit} onChange={set('fit')} /></label>
            <fieldset className="lbl"><legend>Hand-picked collections</legend>
              {data.cols.length === 0 && <small>No hand-picked collections yet.</small>}
              {data.cols.map((c) => (
                <label key={c.slug} className="chk"><input type="checkbox" checked={inCols.includes(c.slug)} onChange={(e) => setInCols((cur) => (e.target.checked ? [...cur, c.slug] : cur.filter((x) => x !== c.slug)))} />{c.title}</label>
              ))}
            </fieldset>
          </section>

          <section className="grp">
            <h2>Placeholder look</h2>
            <p className="hint">Used on cards until a photo is added.</p>
            <div className="tones">
              <label className="lbl">Silhouette<select value={f.kind} onChange={set('kind')}><option value="tee">T-shirt</option><option value="long">Long layer</option><option value="kurta">Kurta</option></select></label>
              <label className="lbl">Main<input type="color" value={f.tone} onChange={set('tone')} /></label>
              <label className="lbl">Hover<input type="color" value={f.alt_tone} onChange={set('alt_tone')} /></label>
            </div>
            <Thumb tone={f.tone} kind={f.kind} className="thumb--lg" />
          </section>

          <section className="grp">
            <h2>Web address</h2>
            <label className="lbl">URL name<input value={f.slug} onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: e.target.value }); }} className={errs.slug ? 'bad' : ''} />{errs.slug ? fe('slug') : <small>/products/{f.slug || '…'}{!isNew && ' · changing this breaks existing links'}</small>}</label>
          </section>

          {!isNew && (
            <section className="grp danger">
              <h2>Delete</h2>
              <p className="hint">Past orders keep their own copy of the name and price. To just stop selling it, switch it to hidden instead.</p>
              {confirmDel
                ? <div className="line"><button className="btn btn--danger" onClick={remove} disabled={busy}>Delete for good</button><button className="btn btn--ghost" onClick={() => setConfirmDel(false)}>Keep it</button></div>
                : <button className="btn btn--line" onClick={() => setConfirmDel(true)}><Icon.Trash size={14} />Delete product</button>}
            </section>
          )}
        </aside>
      </div>

      <div className={`savebar ${dirty ? 'is-dirty' : ''}`} role="region" aria-label="Save changes">
        <span>{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
        <div>
          {dirty && !isNew && <button className="btn btn--ghost" onClick={() => window.location.reload()} disabled={busy}>Discard</button>}
          <button className="btn" onClick={save} disabled={busy || (!dirty && !isNew)}>{busy ? 'Saving…' : isNew ? 'Create product' : 'Save changes'}</button>
        </div>
      </div>
    </>
  );
}
