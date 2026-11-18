import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import FilterDrawer from '../components/FilterDrawer';
import { ChevronDown, Filter } from '../components/Icons';
import { PRICE_MAX, SORTS, applyFilters, readFilters } from '../catalog';
import { useCatalog } from '../store';

const Arch = () => (
  <svg className="arch" width="30" height="46" viewBox="0 0 30 46" aria-hidden="true">
    <path d="M2 44V14Q2 3 15 2Q28 3 28 14V44Z" fill="#6b3a22" /><path d="M6 41V15Q6 7 15 6Q24 7 24 15V41Z" fill="#8a5232" />
    <path d="M10 41V16Q10 11 15 10Q20 11 20 16V41Z" fill="#3a1f12" />
  </svg>
);

function Sort({ value, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="sort" ref={ref}>
      <button className="tool" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        Sort by <ChevronDown size={14} className={open ? 'flip' : ''} />
      </button>
      {open && (
        <ul className="sort__menu" role="listbox">
          {SORTS.map(([k, l]) => (
            <li key={k} role="option" aria-selected={k === value}>
              <button className={k === value ? 'is-sel' : ''} onClick={() => { onPick(k); setOpen(false); }}>{l}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Collection() {
  const { handle } = useParams();
  const { collections } = useCatalog();
  const [sp, setSp] = useSearchParams();
  const [open, setOpen] = useState(false);
  const col = collections[handle] || { title: handle.replace(/-/g, ' '), items: [] };
  const f = readFilters(sp);
  const shown = useMemo(() => applyFilters(col.items, f), [col, sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const types = [...new Set(col.items.map((x) => x.type))];

  const edit = (fn) => { const n = new URLSearchParams(sp); fn(n); setSp(n, { replace: true }); };
  const toggle = (k, v) => edit((n) => {
    const cur = n.getAll(k); n.delete(k);
    (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).forEach((x) => n.append(k, x));
  });
  const setPrice = (min, max) => edit((n) => {
    min > 0 ? n.set('min', min) : n.delete('min'); max < PRICE_MAX ? n.set('max', max) : n.delete('max');
  });
  const setSort = (s) => edit((n) => (s === 'featured' ? n.delete('sort') : n.set('sort', s)));
  const reset = () => edit((n) => ['size', 'avail', 'type', 'fit', 'min', 'max'].forEach((k) => n.delete(k)));

  const label = { in: 'In stock', out: 'Out of stock' };
  const chips = [
    ...f.size.map((v) => ['size', v, v]), ...f.avail.map((v) => ['avail', v, label[v]]),
    ...f.fit.map((v) => ['fit', v, v]), ...f.type.map((v) => ['type', v, v]),
  ];
  if (f.min > 0 || f.max < PRICE_MAX) chips.push(['price', '', `₹${f.min} – ₹${f.max}`]);
  const chipToggle = (k, v) => (k === 'price' ? setPrice(0, PRICE_MAX) : toggle(k, v));

  useEffect(() => { document.title = `${col.title} – KHAYAL`; }, [col.title]);

  return (
    <main>
      <h1 className="sr-only">{col.title}</h1>
      <div className="toolbar">
        <button className="tool" onClick={() => setOpen(true)}>
          <Filter size={15} /> Filters{chips.length > 0 && ` (${chips.length})`}
        </button>
        <Arch />
        <Sort value={f.sort} onPick={setSort} />
      </div>

      {shown.length ? (
        <>
          <h2 className="sr-only">Products</h2>
          <div className="grid" aria-live="polite">
            {shown.map((p) => <ProductCard key={p.slug} product={p} />)}
          </div>
        </>
      ) : (
        <div className="empty">
          <p>No products found</p>
          {chips.length > 0 && <button className="btn-line" onClick={reset}>Reset filters</button>}
          <Link to="/collections/new-arrivals" className="btn-line">Continue shopping</Link>
        </div>
      )}

      <FilterDrawer open={open} onClose={() => setOpen(false)} f={f} toggle={chipToggle} setPrice={setPrice}
        reset={reset} count={shown.length} types={types} chips={chips} />
    </main>
  );
}
