import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Failed, Icon, PageHead, Thumb, ok, slugify, useAsync, useToast } from '../lib/ui';
import { ruleOf } from './Collections';

async function load(slug) {
  const products = await supabase.from('products').select('id,name,type,kind,tone,is_active,product_images(url,position)').order('sort', { ascending: false }).then(ok);
  if (slug === 'new') return { products, col: null, links: [] };
  const [col, links] = await Promise.all([
    supabase.from('collections').select('*').eq('slug', slug).maybeSingle().then(ok),
    supabase.from('collection_products').select('product_id,position').eq('collection_slug', slug).order('position').then(ok),
  ]);
  if (!col) throw new Error('That collection does not exist.');
  return { products, col, links };
}

export default function CollectionEdit() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useAsync(() => load(slug), [slug]);
  if (error) return <Failed error={error} retry={reload} />;
  if (loading || !data) return <PageHead title="Collection" />;
  return <Editor key={slug} data={data} isNew={slug === 'new'} />;
}

function Editor({ data, isNew }) {
  const nav = useNavigate();
  const toast = useToast();
  const c = data.col;
  const [title, setTitle] = useState(c?.title || '');
  const [slug, setSlug] = useState(c?.slug || '');
  const [touched, setTouched] = useState(!isNew);
  const [sort, setSort] = useState(String(c?.sort ?? 0));
  const [rule, setRule] = useState(c ? ruleOf(c, data.links.length) : 'picked');
  const [type, setType] = useState(c?.type_filter || '');
  const [ids, setIds] = useState(data.links.map((l) => l.product_id));
  const [find, setFind] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState('');

  const byId = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data]);
  const types = useMemo(() => [...new Set(data.products.map((p) => p.type))].sort(), [data]);
  const addable = data.products.filter((p) => !ids.includes(p.id) && (!find || `${p.name} ${p.type}`.toLowerCase().includes(find.toLowerCase())));
  const move = (i, d) => setIds((cur) => { const a = [...cur]; [a[i], a[i + d]] = [a[i + d], a[i]]; return a; });
  const imgOf = (p) => [...p.product_images].sort((a, b) => a.position - b.position)[0]?.url;

  const save = async () => {
    if (!title.trim()) return setErr('Give the collection a title.');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return setErr('The URL name can use lowercase letters, numbers and hyphens.');
    if (rule === 'type' && !type) return setErr('Choose which category this collection lists.');
    if (!/^-?\d+$/.test(sort)) return setErr('Order must be a whole number.');
    setErr(''); setBusy(true);
    try {
      const row = { slug, title: title.trim(), sort: Number(sort), type_filter: rule === 'type' ? type : null, on_sale: rule === 'sale', all_products: rule === 'all' };
      ok(await supabase.from('collections').upsert(row));
      // storefront: any hand-picked links override the rule, so a rule collection must have none
      ok(await supabase.from('collection_products').delete().eq('collection_slug', slug));
      if (rule === 'picked' && ids.length) ok(await supabase.from('collection_products').insert(ids.map((id, i) => ({ collection_slug: slug, product_id: id, position: i }))));
      toast('Collection saved');
      nav('/collections');
    } catch (e) { setErr(e.code === '23505' ? 'Another collection already uses that URL name.' : e.message); setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try { ok(await supabase.from('collections').delete().eq('slug', slug)); toast('Collection deleted'); nav('/collections'); }
    catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  return (
    <>
      <Link to="/collections" className="back"><Icon.Back size={14} />Collections</Link>
      <PageHead title={isNew ? 'New collection' : c.title} />
      <div className="edit edit--one">
        <div className="edit__main">
          <section className="grp">
            <h2>Details</h2>
            <label className="lbl">Title<input value={title} onChange={(e) => { setTitle(e.target.value); if (!touched) setSlug(slugify(e.target.value)); }} /></label>
            <label className="lbl">URL name<input value={slug} disabled={!isNew} onChange={(e) => { setTouched(true); setSlug(e.target.value); }} /><small>/collections/{slug || '…'}{!isNew && ' · fixed once created, because the menu and home page link to it'}</small></label>
            <label className="lbl">Order<input inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} /><small>Lower numbers come first.</small></label>
          </section>

          <section className="grp">
            <h2>Which products</h2>
            <div className="seg" role="radiogroup" aria-label="How products are picked">
              {[['picked', 'Hand-picked'], ['type', 'By category'], ['sale', 'On sale'], ['all', 'Every product']].map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={rule === k} className={rule === k ? 'is-on' : ''} onClick={() => setRule(k)}>{l}</button>
              ))}
            </div>
            {rule === 'type' && <label className="lbl">Category<select value={type} onChange={(e) => setType(e.target.value)}><option value="">Choose…</option>{types.map((t) => <option key={t}>{t}</option>)}</select><small>New products in this category join automatically.</small></label>}
            {rule === 'sale' && <p className="hint">Lists every live product that has a compare-at price.</p>}
            {rule === 'all' && <p className="hint">Lists every live product, newest first.</p>}

            {rule === 'picked' && (
              <div className="pick">
                <div>
                  <h3>In this collection <span className="tnum count">{ids.length}</span></h3>
                  {ids.length === 0 ? <p className="hint">Nothing yet. Add products from the list.</p> : (
                    <ol className="rows">
                      {ids.map((id, i) => { const p = byId.get(id); return p && (
                        <li key={id} className="row">
                          <Thumb src={imgOf(p)} tone={p.tone} kind={p.kind} />
                          <span className="row__main">{p.name}<small>{p.type}{!p.is_active && ' · hidden'}</small></span>
                          <span className="imgs__act">
                            <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${p.name} up`}><Icon.Up size={16} /></button>
                            <button type="button" className="icon-btn" disabled={i === ids.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${p.name} down`}><Icon.Down size={16} /></button>
                            <button type="button" className="icon-btn" onClick={() => setIds(ids.filter((x) => x !== id))} aria-label={`Remove ${p.name}`}><Icon.Close size={16} /></button>
                          </span>
                        </li>
                      ); })}
                    </ol>
                  )}
                </div>
                <div>
                  <h3>Add products</h3>
                  <label className="search"><Icon.Search size={16} /><input type="search" placeholder="Search" aria-label="Search products to add" value={find} onChange={(e) => setFind(e.target.value)} /></label>
                  <ul className="rows rows--scroll">
                    {addable.map((p) => (
                      <li key={p.id}><button type="button" className="row" onClick={() => setIds([...ids, p.id])}>
                        <Thumb src={imgOf(p)} tone={p.tone} kind={p.kind} /><span className="row__main">{p.name}<small>{p.type}</small></span><Icon.Plus size={16} />
                      </button></li>
                    ))}
                    {addable.length === 0 && <li className="hint">No more products to add.</li>}
                  </ul>
                </div>
              </div>
            )}
          </section>
        {!isNew && (
          <section className="grp danger">
            <h2>Delete</h2>
            <p className="hint">Menu and home page links to /collections/{slug} will show an empty page until Phase 3 lets you edit them. Products are not deleted.</p>
            {confirmDel
              ? <div className="line"><button className="btn btn--danger" onClick={remove} disabled={busy}>Delete for good</button><button className="btn btn--ghost" onClick={() => setConfirmDel(false)}>Keep it</button></div>
              : <button className="btn btn--line" onClick={() => setConfirmDel(true)}><Icon.Trash size={14} />Delete collection</button>}
          </section>
        )}
        </div>

      </div>

      <div className="savebar is-dirty" role="region" aria-label="Save">
        <span className={err ? 'err' : ''} role={err ? 'alert' : undefined}>{err || 'Saving replaces how this collection picks products.'}</span>
        <div><Link to="/collections" className="btn btn--ghost">Cancel</Link><button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save collection'}</button></div>
      </div>
    </>
  );
}
