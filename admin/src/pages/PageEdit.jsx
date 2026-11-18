import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Failed, Icon, PageHead, Switch, ok, slugify, useAsync, useToast } from '../lib/ui';
import { RowTools, moveIn } from '../lib/fields';
import { Bar } from './HomeEditor';
import { CORE, pagePath } from './ContentPages';

const STORE = import.meta.env.VITE_STORE_URL || 'http://localhost:5173';

export default function PageEdit() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    if (slug === 'new') return null;
    const p = await supabase.from('pages').select('*').eq('slug', slug).maybeSingle().then(ok);
    if (!p) throw new Error('That page does not exist.');
    return p;
  }, [slug]);
  if (error) return <Failed error={error} retry={reload} />;
  if (loading) return <PageHead title="Page" />;
  return <Editor key={slug} p={data} />;
}

function Editor({ p }) {
  const nav = useNavigate();
  const toast = useToast();
  const isNew = !p;
  const core = Boolean(p && CORE[p.slug]);
  const init = { title: p?.title || '', slug: p?.slug || '', published: p?.published ?? true, body: p?.body || [{ h: '', t: '' }] };
  const [f, setF] = useState(init);
  const [touched, setTouched] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const setBody = (i, k, v) => setF((x) => ({ ...x, body: x.body.map((b, j) => (j === i ? { ...b, [k]: v } : b)) }));

  const save = async () => {
    if (!f.title.trim()) return toast('Give the page a title.', 'err');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)) return toast('The address can use lowercase letters, numbers and hyphens.', 'err');
    if (isNew && (CORE[f.slug] || f.slug === 'new')) return toast('That address belongs to a built-in page.', 'err');
    setBusy(true);
    const body = f.body.filter((b) => b.h.trim() || b.t.trim());
    const row = { slug: f.slug, title: f.title.trim(), body, published: core ? true : f.published, updated_at: new Date().toISOString() };
    if (isNew) row.sort = 100;
    const { error: e } = await supabase.from('pages').upsert(row);
    if (e) { setBusy(false); return toast(e.code === '23505' ? 'A page already uses that address.' : e.message, 'err'); }
    toast('Page saved');
    if (isNew) nav(`/pages/${f.slug}`, { replace: true }); else window.location.reload();
  };
  const remove = async () => {
    setBusy(true);
    const { error: e } = await supabase.from('pages').delete().eq('slug', p.slug);
    if (e) { setBusy(false); return toast(e.message, 'err'); }
    toast('Page deleted'); nav('/pages');
  };

  return (
    <>
      <Link to="/pages" className="back"><Icon.Back size={14} />Pages</Link>
      <PageHead title={isNew ? 'New page' : p.title}>
        {!isNew && f.published && <a className="btn btn--line" href={`${STORE}${pagePath(p.slug)}`} target="_blank" rel="noreferrer">View on store<Icon.External size={14} /></a>}
      </PageHead>
      <div className="edit">
        <div className="edit__main">
          <section className="grp">
            <h2>Content</h2>
            <label className="lbl">Title<input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value, slug: touched ? f.slug : slugify(e.target.value) })} /></label>
            {f.body.map((b, i) => (
              <div key={i} className="item">
                <div className="item__bar"><span>Section {i + 1}</span><RowTools i={i} n={f.body.length} move={(idx, d) => setF({ ...f, body: moveIn(f.body, idx, d) })} remove={() => setF({ ...f, body: f.body.filter((_, j) => j !== i) })} label={`section ${i + 1}`} /></div>
                <label className="lbl">Heading<input value={b.h} maxLength={120} onChange={(e) => setBody(i, 'h', e.target.value)} /></label>
                <label className="lbl">Text<textarea rows={5} value={b.t} maxLength={5000} onChange={(e) => setBody(i, 't', e.target.value)} /><small>Blank lines make new paragraphs.</small></label>
              </div>
            ))}
            <button type="button" className="btn btn--line btn--sm" onClick={() => setF({ ...f, body: [...f.body, { h: '', t: '' }] })}><Icon.Plus size={14} />Add section</button>
            {f.slug === 'contact' && <p className="hint">The contact form sits below these sections automatically.</p>}
          </section>
        </div>
        <aside className="edit__rail">
          <section className="grp">
            <h2>Visibility</h2>
            {core ? <p className="hint">Built-in pages are always live because the site links to them.</p>
              : <div className="line"><span>{f.published ? 'Live on the store' : 'Draft, not shown'}</span><Switch on={f.published} onChange={(v) => setF({ ...f, published: v })} label="Page is live" /></div>}
          </section>
          <section className="grp">
            <h2>Web address</h2>
            <label className="lbl">Address<input value={f.slug} disabled={!isNew} onChange={(e) => { setTouched(true); setF({ ...f, slug: e.target.value }); }} /><small>{isNew ? `/pages/${f.slug || '…'}` : `${pagePath(f.slug)} · fixed once created`}</small></label>
            {isNew && <p className="hint">Add it to a menu under Navigation so customers can find it.</p>}
          </section>
          {!isNew && !core && (
            <section className="grp danger"><h2>Delete</h2>
              {confirmDel ? <div className="line"><button className="btn btn--danger" onClick={remove} disabled={busy}>Delete for good</button><button className="btn btn--ghost" onClick={() => setConfirmDel(false)}>Keep it</button></div>
                : <button className="btn btn--line" onClick={() => setConfirmDel(true)}><Icon.Trash size={14} />Delete page</button>}
            </section>
          )}
        </aside>
      </div>
      <Bar dirty={dirty || isNew} busy={busy} save={save} label={isNew ? 'Create page' : 'Save changes'} />
    </>
  );
}
