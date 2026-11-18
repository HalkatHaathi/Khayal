import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Empty, Failed, Icon, PageHead, STOCK_LABEL, Status, Switch, Thumb, inr, ok, stockState, useAsync, useToast } from '../lib/ui';

export default function Products() {
  const nav = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [vis, setVis] = useState('');
  const [stock, setStock] = useState('');
  const { data, error, loading, reload } = useAsync(() =>
    supabase.from('products').select('id,slug,name,type,kind,craft,price,compare_at,tone,is_active,sort,product_sizes(size,stock),product_images(url,position)').order('sort', { ascending: false }).then(ok));
  const [rows, setRows] = useState(null);
  useEffect(() => setRows(data), [data]);
  const list = rows ?? [];

  const types = useMemo(() => [...new Set(list.map((p) => p.type))].sort(), [list]);
  const shown = list.filter((p) =>
    (!q || `${p.name} ${p.type} ${p.craft} ${p.slug}`.toLowerCase().includes(q.toLowerCase())) &&
    (!type || p.type === type) &&
    (!vis || (vis === 'live') === p.is_active) &&
    (!stock || (stock === 'attention' ? stockState(p.product_sizes) !== 'ok' : stockState(p.product_sizes) === stock)));

  const toggle = async (p, on) => {
    setRows(list.map((x) => (x.id === p.id ? { ...x, is_active: on } : x)));
    const { error: e } = await supabase.from('products').update({ is_active: on }).eq('id', p.id);
    if (e) { setRows(list); toast(e.message, 'err'); } else toast(on ? `${p.name} is live` : `${p.name} is hidden from the store`);
  };

  if (error) return <Failed error={error} retry={reload} />;

  return (
    <>
      <PageHead title="Products" sub={loading ? ' ' : `${list.length} in the catalogue · ${list.filter((p) => p.is_active).length} live`}>
        <Link to="/products/new" className="btn"><Icon.Plus size={14} />Add product</Link>
      </PageHead>

      <div className="bar">
        <label className="search"><Icon.Search size={16} /><input type="search" placeholder="Search products" aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
        <select aria-label="Visibility" value={vis} onChange={(e) => setVis(e.target.value)}><option value="">Live and hidden</option><option value="live">Live</option><option value="hidden">Hidden</option></select>
        <select aria-label="Stock" value={stock} onChange={(e) => setStock(e.target.value)}><option value="">Any stock</option><option value="attention">Needs restocking</option><option value="low">Low stock</option><option value="out">Sold out</option></select>
      </div>

      {!loading && shown.length === 0 ? (
        list.length ? <Empty title="Nothing matches those filters"><button className="btn btn--line" onClick={() => { setQ(''); setType(''); setVis(''); setStock(''); }}>Clear filters</button></Empty>
          : <Empty title="No products yet"><Link to="/products/new" className="btn">Add your first product</Link></Empty>
      ) : (
        <table className="tbl tbl--click">
          <thead><tr><th className="w-thumb"><span className="sr">Photo</span></th><th>Product</th><th className="hide-sm">Type</th><th className="num">Price</th><th>Stock</th><th className="w-sw">Live</th></tr></thead>
          <tbody>
            {shown.map((p) => {
              const st = stockState(p.product_sizes); const [tone, label] = STOCK_LABEL[st];
              const total = p.product_sizes.reduce((a, s) => a + s.stock, 0);
              const img = [...p.product_images].sort((a, b) => a.position - b.position)[0]?.url;
              return (
                <tr key={p.id} className={p.is_active ? '' : 'is-dim'} onClick={() => nav(`/products/${p.id}`)}>
                  <td><Thumb src={img} tone={p.tone} kind={p.kind} /></td>
                  <td><Link to={`/products/${p.id}`} className="cell-link" onClick={(e) => e.stopPropagation()}>{p.name}</Link><small className="sub">{p.craft || 'No craft note'}</small></td>
                  <td className="hide-sm">{p.type}</td>
                  <td className="num tnum">{inr(p.price)}{p.compare_at && <small className="sub"><s>{inr(p.compare_at)}</s></small>}</td>
                  <td><Status tone={tone}>{label}</Status><small className="sub tnum">{total} in {p.product_sizes.length} sizes</small></td>
                  <td onClick={(e) => e.stopPropagation()}><Switch on={p.is_active} onChange={(on) => toggle(p, on)} label={`${p.name} live on store`} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
