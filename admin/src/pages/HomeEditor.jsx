import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULTS } from '../content';
import { Failed, Icon, PageHead, Switch, ok, useAsync, useToast } from '../lib/ui';
import { ImageField, LinkField, RowTools, TextField, loadContent, moveIn, okLink, saveContent, uid, useKnownLinks } from '../lib/fields';

const STORE = import.meta.env.VITE_STORE_URL || 'http://localhost:5173';

// what each home-page block lets you edit. kind: text | area | link | image | collection | bool | items
const SCHEMA = {
  hero: { label: 'Hero (two photos)', fields: [['cta', 'Button text (both halves)', 'text'], ['image', 'Left photo', 'image', 'Each half is half the screen wide, tall portrait photos work best.'], ['label', 'Left title', 'text'], ['link', 'Left links to', 'link'], ['image2', 'Right photo', 'image'], ['label2', 'Right title', 'text'], ['link2', 'Right links to', 'link']] },
  products: { label: 'Product row', fields: [['collection', 'Collection', 'collection'], ['title', 'Title', 'text'], ['sub', 'Subtitle', 'text'], ['peek', 'Show a peek of the next product', 'bool'], ['upper', 'Title in capitals', 'bool']] },
  banner: { label: 'Banner', fields: [['title', 'Title', 'text'], ['sub', 'Subtitle', 'text'], ['cta', 'Button text', 'text'], ['link', 'Links to', 'link'], ['image', 'Background photo', 'image', 'Moves slowly as visitors scroll (parallax) on computers. Wide photos work best.']] },
  categories: { label: 'Category tiles', fields: [['items', 'Tiles', 'items', [['name', 'Name', 'text'], ['to', 'Links to', 'link'], ['image', 'Photo', 'image']], { name: 'New tile', to: '/', image: '', tone: '#cfc8bd' }]] },
  fullscreen: { label: 'Full-screen photo', fields: [['title', 'Title', 'text'], ['text', 'Text', 'area'], ['cta', 'Button text (optional)', 'text'], ['link', 'Links to', 'link'], ['image', 'Photo', 'image', 'Fills the whole screen with the text in the middle.']] },
  instagram: { label: 'Instagram grid', fields: [['title', 'Title', 'text'], ['link', 'Profile link', 'link'], ['items', 'Posts', 'items', [['image', 'Photo', 'image'], ['link', 'Post link (optional)', 'link']], { image: '', link: '', tone: '#cfc8bd' }]] },
  story: { label: 'Story', fields: [['title', 'Title', 'text'], ['text', 'Text', 'area'], ['cta', 'Button text', 'text'], ['link', 'Links to', 'link'], ['image', 'Background photo', 'image']] },
  newsletter: { label: 'Newsletter', fields: [['kicker', 'Small label', 'text'], ['title', 'Title', 'text'], ['text', 'Text', 'area'], ['image', 'Photo', 'image', 'Shown beside the sign-up form.']] },
};
const NEW = {
  hero: { cta: 'Shop now', label: 'Left title', link: '/', image: '', label2: 'Right title', link2: '/', image2: '' },
  products: { collection: '', title: 'New row', sub: '', peek: false, upper: false },
  banner: { title: 'New banner', sub: '', cta: 'Shop now', link: '/', image: '' },
  categories: { items: [] }, fullscreen: { title: 'Our story', text: '', cta: '', link: '/', image: '' }, instagram: { title: '@KHAYALWEAR', link: 'https://instagram.com', items: [] },
  story: { title: 'Our story', text: '', cta: 'Read more', link: '/about', image: '' },
  newsletter: { kicker: 'Newsletter', title: 'Sign up', text: '', image: '' },
};
const summary = (s) => s.title || s.name || SCHEMA[s.type]?.label;

export default function HomeEditor() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [home, cols, pages] = await Promise.all([
      loadContent('home', DEFAULTS.home),
      supabase.from('collections').select('slug,title').order('sort').then(ok),
      supabase.from('pages').select('slug').then(ok),
    ]);
    return { home, cols, pages };
  });
  if (error) return <Failed error={error} retry={reload} />;
  if (loading || !data) return <PageHead title="Home page" />;
  return <Editor data={data} />;
}

function Editor({ data }) {
  const toast = useToast();
  const start = useMemo(() => data.home.sections.filter((s) => s.type !== 'worn').map((s) => (s.type === 'hero' && s.label === undefined ? { ...s, label: s.title } : s)), [data]); // 'Worn by' was removed; heroes saved before the two-photo layout keep their title
  const initial = useMemo(() => JSON.stringify(start), [start]);
  const [sections, setSections] = useState(start);
  const [open, setOpen] = useState('');
  const [add, setAdd] = useState('products');
  const [busy, setBusy] = useState(false);
  const links = useKnownLinks(data.cols.map((c) => c.slug), data.pages.map((p) => p.slug));
  const dirty = JSON.stringify(sections) !== initial;
  const patch = (id, k, v) => setSections((cur) => cur.map((s) => (s.id === id ? { ...s, [k]: v } : s)));

  const save = async () => {
    const empty = sections.find((s) => s.type === 'products' && !s.collection);
    if (empty) { setOpen(empty.id); return toast(`Choose a collection for the product row "${empty.title || 'untitled'}", or remove it.`, 'err'); }
    const bad = sections.flatMap((s) => [s.link, ...(s.items || []).flatMap((x) => [x.to, x.link])]).some((l) => !okLink(l));
    if (bad) return toast('One of the links is not valid. Look for the red field.', 'err');
    setBusy(true);
    try { await saveContent('home', { sections }); toast('Home page saved'); setTimeout(() => window.location.reload(), 500); }
    catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  return (
    <>
      <PageHead title="Home page" sub="The blocks on the storefront home page, top to bottom. Hide a block to keep it without showing it.">
        <a className="btn btn--line" href={STORE} target="_blank" rel="noreferrer">View store<Icon.External size={14} /></a>
      </PageHead>

      <ol className="blocks">
        {sections.map((s, i) => {
          const sc = SCHEMA[s.type]; if (!sc) return null;
          const isOpen = open === s.id;
          return (
            <li key={s.id} className={`block ${s.visible === false ? 'is-dim' : ''}`}>
              <div className="block__head">
                <button type="button" className="block__title" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : s.id)}>
                  <Icon.Down size={16} className={isOpen ? '' : 'rot'} /><span>{sc.label}</span><small>{summary(s) !== sc.label ? summary(s) : ''}</small>
                </button>
                <Switch on={s.visible !== false} onChange={(v) => patch(s.id, 'visible', v)} label={`Show ${sc.label} on the store`} />
                <RowTools i={i} n={sections.length} move={(idx, d) => setSections(moveIn(sections, idx, d))} remove={() => { if (window.confirm(`Remove this ${sc.label.toLowerCase()} block?`)) setSections(sections.filter((x) => x.id !== s.id)); }} label={sc.label} />
              </div>
              {isOpen && <div className="block__body"><Fields fields={sc.fields} value={s} set={(k, v) => patch(s.id, k, v)} cols={data.cols} links={links} /></div>}
            </li>
          );
        })}
      </ol>

      <div className="addbar">
        <select aria-label="Block type" value={add} onChange={(e) => setAdd(e.target.value)}>{Object.entries(SCHEMA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <button className="btn btn--line" onClick={() => { const id = uid(); setSections([...sections, { id, type: add, visible: true, ...NEW[add] }]); setOpen(id); }}><Icon.Plus size={14} />Add block</button>
      </div>

      <Bar dirty={dirty} busy={busy} save={save} />
    </>
  );
}

export const Bar = ({ dirty, busy, save, label = 'Save changes', note }) => (
  <div className={`savebar ${dirty ? 'is-dirty' : ''}`} role="region" aria-label="Save changes">
    <span>{note || (dirty ? 'You have unsaved changes' : 'All changes saved')}</span>
    <div>
      {dirty && <button className="btn btn--ghost" onClick={() => window.location.reload()} disabled={busy}>Discard</button>}
      <button className="btn" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : label}</button>
    </div>
  </div>
);

/** Renders a form from a [key, label, kind, ...] schema. */
function Fields({ fields, value, set, cols, links }) {
  return fields.map(([k, label, kind, a, b]) => {
    const v = value[k];
    if (kind === 'text') return <TextField key={k} label={label} value={v} onChange={(x) => set(k, x)} max={200} />;
    if (kind === 'area') return <TextField key={k} label={label} value={v} onChange={(x) => set(k, x)} area max={600} />;
    if (kind === 'link') return <LinkField key={k} label={label} value={v} onChange={(x) => set(k, x)} links={links} />;
    if (kind === 'image') return <ImageField key={k} label={label} value={v} onChange={(x) => set(k, x)} hint={a} folder="home" />;
    if (kind === 'bool') return <label key={k} className="chk"><input type="checkbox" checked={Boolean(v)} onChange={(e) => set(k, e.target.checked)} />{label}</label>;
    if (kind === 'collection') return (
      <label key={k} className="lbl">{label}
        <select value={v || ''} onChange={(e) => set(k, e.target.value)}><option value="">Choose…</option>{cols.map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}</select>
        <small>The row shows this collection's products and links to it.</small>
      </label>
    );
    if (kind === 'items') return (
      <fieldset key={k} className="lbl items"><legend>{label} <span className="count tnum">{(v || []).length}</span></legend>
        {(v || []).map((it, i) => (
          <div key={i} className="item">
            <div className="item__bar"><span>{label.replace(/s$/, '')} {i + 1}</span>
              <RowTools i={i} n={v.length} move={(idx, d) => set(k, moveIn(v, idx, d))} remove={() => set(k, v.filter((_, j) => j !== i))} label={`${label} ${i + 1}`} /></div>
            <Fields fields={a} value={it} set={(kk, vv) => set(k, v.map((x, j) => (j === i ? { ...x, [kk]: vv } : x)))} cols={cols} links={links} />
          </div>
        ))}
        <button type="button" className="btn btn--line btn--sm" onClick={() => set(k, [...(v || []), { ...b }])}><Icon.Plus size={14} />Add</button>
      </fieldset>
    );
    return null;
  });
}
