import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Close, Lock, Minus, Plus, Search } from './Icons';
import Media from './Media';
import { useCart } from '../cart';
import { GiftRow, ShipBar } from './CartParts';
import Carousel from './Carousel';
import ProductCard from './ProductCard';
import { inr } from '../data';
import { A } from '../content';
import { search } from '../catalog';
import { useCatalog } from '../store';

const FOCUSABLE = 'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

/** Shared shell: scrim + panel. Escape closes, Tab is trapped inside, focus returns to the opener on close. */
export function Panel({ open, onClose, side, label, children, className = '' }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose; // parents pass a fresh onClose each render; keep the effect keyed on `open` only
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const opener = document.activeElement;
    const key = (e) => {
      if (e.key === 'Escape') return closeRef.current();
      if (e.key !== 'Tab') return;
      const f = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const [first, last] = [f[0], f[f.length - 1]];
      const a = document.activeElement;
      if (!el.contains(a) || (e.shiftKey && a === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    el.querySelector('input, button')?.focus();
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = '';
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [open]);

  return (
    <>
      <div className={`scrim ${open ? 'is-open' : ''}`} onClick={onClose} />
      <aside ref={ref} role="dialog" aria-modal="true" aria-label={label} aria-hidden={!open}
        className={`panel panel--${side} ${open ? 'is-open' : ''} ${className}`}>
        {children}
      </aside>
    </>
  );
}

export function MenuDrawer({ open, onClose }) {
  const [view, setView] = useState(null); // label of the open submenu, or null for the top level
  const { content } = useCatalog();
  const items = content.menus.drawer;
  const sub = items.find((i) => i.label === view);
  useEffect(() => { if (!open) { const t = setTimeout(() => setView(null), 350); return () => clearTimeout(t); } }, [open]);

  return (
    <Panel open={open} onClose={onClose} side="left" label="Menu">
      <div className="panel__top">
        {sub && <button onClick={() => setView(null)} aria-label="Back"><ArrowLeft size={20} /></button>}
        {sub && <span className="panel__title">{sub.label}</span>}
        <button className="panel__close" onClick={onClose} aria-label="Close menu"><Close size={20} /></button>
      </div>
      <ul className="menu">
        {sub
          ? sub.children.map((c) => <li key={c.to + c.label}><A to={c.to} onClick={onClose}>{c.label}</A></li>)
          : items.map((i) => (
              <li key={i.label}>
                {i.children?.length
                  ? <button onClick={() => setView(i.label)}>{i.label}<ArrowRight size={20} /></button>
                  : <A to={i.to} onClick={onClose}>{i.label}</A>}
              </li>
            ))}
      </ul>
    </Panel>
  );
}

export function SearchOverlay({ open, onClose }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const { catalog, popular } = useCatalog();
  const hits = search(catalog, q);
  const submit = (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    onClose();
    nav(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <Panel open={open} onClose={onClose} side="top" label="Search">
      <form className="search" onSubmit={submit} role="search">
        <Search size={26} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search products" />
        <button type="button" onClick={onClose} aria-label="Close search"><Close size={20} /></button>
      </form>
      <h2 className="search__label" aria-live="polite">
        {!q.trim() ? 'Popular products' : hits.length ? `${hits.length} ${hits.length === 1 ? 'result' : 'results'}` : `No results for "${q.trim()}"`}
      </h2>
      {(!q.trim() || hits.length > 0) && (
        <div className="search__row" onClick={onClose}>
          <Carousel label={q.trim() ? 'Search results' : 'Popular products'} key={q.trim() ? 'r' + hits.length : 'p'}>
            {(q.trim() ? hits : popular).slice(0, 12).map((p) => <ProductCard key={p.slug} product={p} compact />)}
          </Carousel>
        </div>
      )}
    </Panel>
  );
}

export function CartDrawer({ open, onClose, onCheckout }) {
  const { items, count, subtotal, setQty, remove, ready, quoting } = useCart();
  return (
    <Panel open={open} onClose={onClose} side="right" label="Cart">
      <p className="coupon">Use coupon code <b>KHAYAL10</b> for 10% off your first order.</p>
      <div className="panel__top panel__top--cart">
        <span className="panel__title panel__title--left">CART&nbsp;&nbsp;({count})</span>
        <button className="panel__close" onClick={onClose} aria-label="Close cart"><Close size={20} /></button>
      </div>
      {items.length === 0 ? (
        <div className="cart-empty">
          <p>Your Cart is Empty</p>
          <div className="cart-empty__links">
            {[['Shop', '/collections/new-arrivals'], ['Collections', '/collections/aw26'], ['About us', '/about'], ['Contact', '/contact']].map(([l, to]) => (
              <Link key={l} to={to} onClick={onClose} className="btn-line">{l}</Link>
            ))}
          </div>
        </div>
      ) : (
        <>
          <ul className="cart-items">
            {items.map((it) => (
              <li key={it.key} className="cart-item">
                <Link to={`/products/${it.slug}`} onClick={onClose} className="cart-item__img"><Media tone={it.tone} kind={it.kind} src={it.img} /></Link>
                <div>
                  <Link to={`/products/${it.slug}`} onClick={onClose} className="cart-item__name">{it.name}</Link>
                  <dl>{it.opts.map(([k, v]) => <div key={k}><dt>{k}:</dt><dd>{v}</dd></div>)}</dl>
                  <p className="cart-item__price">{inr(it.price)}</p>
                  {it.issue && <p className="cart-item__issue" role="alert">{it.issue}</p>}
                  <div className="qty qty--sm">
                    <button onClick={() => setQty(it.key, it.qty - 1)} aria-label="Decrease quantity"><Minus size={14} /></button>
                    <span>{it.qty}</span>
                    <button onClick={() => setQty(it.key, it.qty + 1)} aria-label="Increase quantity" disabled={it.qty >= it.max}><Plus size={14} /></button>
                  </div>
                  <button className="cart-item__rm" onClick={() => remove(it.key)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="cart-foot">
            <GiftRow />
            <ShipBar />
            <p className="cart-foot__sub"><span>Subtotal</span><b aria-busy={quoting}>{inr(subtotal)}</b></p>
            <button className="btn-block btn-block--lock" disabled={!ready} onClick={() => { onClose(); onCheckout(); }}><Lock size={14} /> Check out</button>
            <Link to="/cart" onClick={onClose} className="btn-outline btn-outline--link">View cart</Link>
            <p className="cart-foot__note">Prices include GST. Shipping and discount codes are shown at checkout</p>
          </div>
        </>
      )}
    </Panel>
  );
}
