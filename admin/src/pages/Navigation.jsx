import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULTS } from '../content';
import { Failed, Icon, PageHead, ok, useAsync, useToast } from '../lib/ui';
import { LinkField, RowTools, TextField, loadContent, moveIn, okLink, saveContent, useKnownLinks } from '../lib/fields';
import { Bar } from './HomeEditor';

export default function Navigation() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [menus, cols, pages] = await Promise.all([
      loadContent('menus', DEFAULTS.menus),
      supabase.from('collections').select('slug').then(ok),
      supabase.from('pages').select('slug').then(ok),
    ]);
    return { menus: { ...DEFAULTS.menus, ...menus }, cols, pages };
  });
  if (error) return <Failed error={error} retry={reload} />;
  if (loading || !data) return <PageHead title="Navigation" />;
  return <Editor data={data} />;
}

/** A list of label + link rows. */
function LinkRows({ rows, onChange, links, noun = 'link' }) {
  return (
    <div className="lrows">
      {rows.map((r, i) => (
        <div key={i} className="lrow">
          <TextField label="Label" value={r.label} onChange={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, label: v } : x)))} max={60} />
          <LinkField label="Links to" value={r.to} onChange={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, to: v } : x)))} links={links} />
          <RowTools i={i} n={rows.length} move={(idx, d) => onChange(moveIn(rows, idx, d))} remove={() => onChange(rows.filter((_, j) => j !== i))} label={r.label || noun} />
        </div>
      ))}
      <button type="button" className="btn btn--line btn--sm" onClick={() => onChange([...rows, { label: '', to: '/' }])}><Icon.Plus size={14} />Add {noun}</button>
    </div>
  );
}

function Editor({ data }) {
  const toast = useToast();
  const initial = JSON.stringify(data.menus);
  const [m, setM] = useState(data.menus);
  const [busy, setBusy] = useState(false);
  const links = useKnownLinks(data.cols.map((c) => c.slug), data.pages.map((p) => p.slug));
  const dirty = JSON.stringify(m) !== initial;
  const set = (k, v) => setM((x) => ({ ...x, [k]: v }));

  const save = async () => {
    const all = [...m.nav, ...m.drawer.flatMap((d) => [d, ...(d.children || [])]), ...m.footer.flatMap((c) => c.links)];
    if (all.some((l) => !okLink(l.to))) return toast('One of the links is not valid. Look for the red field.', 'err');
    if (all.some((l) => !l.label?.trim())) return toast('Every item needs a label.', 'err');
    if (m.drawer.some((d) => !d.children && !d.to)) return toast('Every menu item needs a link or a submenu.', 'err');
    setBusy(true);
    try { await saveContent('menus', m); toast('Navigation saved'); setTimeout(() => window.location.reload(), 500); } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };
  const setDrawer = (i, patch) => set('drawer', m.drawer.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <>
      <PageHead title="Navigation" sub="The links in the header, the side menu and the footer." />
      <div className="edit edit--one"><div className="edit__main">
        <section className="grp">
          <h2>Header links</h2>
          <p className="hint">The row of categories under the logo on large screens. Five fit comfortably.</p>
          <LinkRows rows={m.nav} onChange={(v) => set('nav', v)} links={links} />
        </section>

        <section className="grp">
          <h2>Side menu</h2>
          <p className="hint">The menu that opens from the ☰ button. An item is either a link or a submenu with its own links.</p>
          {m.drawer.map((d, i) => (
            <div key={i} className="item">
              <div className="item__bar"><span>{d.label || 'Untitled'}</span><RowTools i={i} n={m.drawer.length} move={(idx, dd) => set('drawer', moveIn(m.drawer, idx, dd))} remove={() => set('drawer', m.drawer.filter((_, j) => j !== i))} label={d.label || 'item'} /></div>
              <TextField label="Label" value={d.label} onChange={(v) => setDrawer(i, { label: v })} max={60} />
              <div className="seg" role="radiogroup" aria-label="Item type">
                {[['link', 'Link'], ['sub', 'Submenu']].map(([k, l]) => {
                  const on = (k === 'sub') === Boolean(d.children);
                  return <button key={k} type="button" role="radio" aria-checked={on} className={on ? 'is-on' : ''} onClick={() => setDrawer(i, k === 'sub' ? { children: d.children || [], to: undefined } : { to: d.to || '/', children: undefined })}>{l}</button>;
                })}
              </div>
              {d.children ? <LinkRows rows={d.children} onChange={(v) => setDrawer(i, { children: v })} links={links} /> : <LinkField label="Links to" value={d.to} onChange={(v) => setDrawer(i, { to: v })} links={links} />}
            </div>
          ))}
          <button type="button" className="btn btn--line btn--sm" onClick={() => set('drawer', [...m.drawer, { label: '', to: '/' }])}><Icon.Plus size={14} />Add menu item</button>
        </section>

        <section className="grp">
          <h2>Footer</h2>
          {m.footer.map((c, i) => (
            <div key={i} className="item">
              <div className="item__bar"><span>{c.title || 'Untitled column'}</span><RowTools i={i} n={m.footer.length} move={(idx, d) => set('footer', moveIn(m.footer, idx, d))} remove={() => set('footer', m.footer.filter((_, j) => j !== i))} label={c.title || 'column'} /></div>
              <TextField label="Column title" value={c.title} onChange={(v) => set('footer', m.footer.map((x, j) => (j === i ? { ...x, title: v } : x)))} max={40} />
              <LinkRows rows={c.links} onChange={(v) => set('footer', m.footer.map((x, j) => (j === i ? { ...x, links: v } : x)))} links={links} />
            </div>
          ))}
          <button type="button" className="btn btn--line btn--sm" onClick={() => set('footer', [...m.footer, { title: '', links: [] }])}><Icon.Plus size={14} />Add column</button>
          <p className="hint">Social icons and the copyright line are under Site.</p>
        </section>
      </div></div>
      <Bar dirty={dirty} busy={busy} save={save} />
    </>
  );
}
