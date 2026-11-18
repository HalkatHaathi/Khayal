import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Empty, Failed, Icon, LOW, PageHead, Thumb, bySize, ok, stockState, useAsync, useToast } from '../lib/ui';

export default function Inventory() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  const attention = sp.get('attention') === '1';
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() =>
    supabase.from('products').select('id,name,type,kind,tone,is_active,sort,product_sizes(size,stock),product_images(url,position)').order('sort', { ascending: false }).then(ok));
  const [rows, setRows] = useState([]);
  useEffect(() => { if (data) setRows(data); }, [data]);
  const [saved, setSaved] = useState('');

  const put = (k, v) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const shown = useMemo(() => rows.filter((p) =>
    (!q || `${p.name} ${p.type}`.toLowerCase().includes(q.toLowerCase())) && (!attention || stockState(p.product_sizes) !== 'ok')), [rows, q, attention]);

  // absolute value, not +/-: what you type is what the shelf holds. Last write wins if an order lands in the same second.
  const commit = async (p, size, value, was) => {
    const stock = Number(value);
    if (value === '' || !Number.isInteger(stock) || stock < 0) { toast('Stock must be a whole number, 0 or more.', 'err'); setRows((r) => [...r]); return; }
    if (stock === was) return;
    setRows((r) => r.map((x) => (x.id === p.id ? { ...x, product_sizes: x.product_sizes.map((s) => (s.size === size ? { ...s, stock } : s)) } : x)));
    const { error: e } = await supabase.from('product_sizes').update({ stock }).eq('product_id', p.id).eq('size', size);
    if (e) { toast(e.message, 'err'); reload(); return; }
    setSaved(`${p.id}${size}`); setTimeout(() => setSaved(''), 1400);
  };

  if (error) return <Failed error={error} retry={reload} />;
  const units = rows.reduce((a, p) => a + p.product_sizes.reduce((b, s) => b + s.stock, 0), 0);

  return (
    <>
      <PageHead title="Inventory" sub={loading ? ' ' : `${units.toLocaleString('en-IN')} units across ${rows.length} products`} />
      <div className="bar">
        <label className="search"><Icon.Search size={16} /><input type="search" placeholder="Search products" aria-label="Search products" value={q} onChange={(e) => put('q', e.target.value)} /></label>
        <label className="chk chk--bar"><input type="checkbox" checked={attention} onChange={(e) => put('attention', e.target.checked ? '1' : '')} />Only needs restocking</label>
      </div>
      <p className="hint">Type a new count and press Enter or tab away to save. Amber is {LOW} or fewer, red is sold out. Orders take stock off automatically.</p>

      {!loading && shown.length === 0 ? <Empty title={attention ? 'Nothing needs restocking' : 'No products match'} /> : (
        <ul className="inv">
          {shown.map((p) => {
            const sizes = [...p.product_sizes].sort((a, b) => bySize(a.size, b.size));
            const img = [...p.product_images].sort((a, b) => a.position - b.position)[0]?.url;
            const total = sizes.reduce((a, s) => a + s.stock, 0);
            return (
              <li key={p.id} className={p.is_active ? '' : 'is-dim'}>
                <Thumb src={img} tone={p.tone} kind={p.kind} />
                <div className="inv__name"><Link to={`/products/${p.id}`} className="cell-link">{p.name}</Link><small className="sub">{p.type}{!p.is_active && ' · hidden'}</small></div>
                <div className="inv__sizes">
                  {sizes.length === 0 && <small className="sub">No sizes. <Link to={`/products/${p.id}`} className="cell-link">Add some</Link></small>}
                  {sizes.map((s) => (
                    <label key={s.size} className={`cell ${s.stock === 0 ? 'is-out' : s.stock <= LOW ? 'is-low' : ''}`}>
                      <span>{s.size}</span>
                      <input type="number" min="0" inputMode="numeric" defaultValue={s.stock} key={`${p.id}${s.size}${s.stock}`} aria-label={`${p.name}, size ${s.size}`}
                        onBlur={(e) => commit(p, s.size, e.target.value, s.stock)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                      {saved === `${p.id}${s.size}` && <Icon.Check size={12} className="cell__ok" />}
                    </label>
                  ))}
                </div>
                <span className="inv__total tnum">{total}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
