import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---------- icons: one 1.5 stroke set, same construction as the storefront's ----------
const I = ({ d, size = 18, children, ...r }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...r}>
    {d ? <path d={d} /> : children}
  </svg>
);
export const Icon = {
  Overview: (p) => <I {...p}><path d="M4 20V10m6 10V4m6 16v-7m4 7H2" /></I>,
  Box: (p) => <I {...p}><path d="m12 3 8 4v10l-8 4-8-4V7l8-4Z" /><path d="m4 7 8 4 8-4M12 11v10" /></I>,
  Stock: (p) => <I {...p}><path d="M4 7h16M4 12h16M4 17h10" /><path d="m17 16 2 2 3-4" /></I>,
  Grid: (p) => <I {...p}><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></I>,
  Plus: (p) => <I {...p} d="M12 5v14M5 12h14" />,
  Minus: (p) => <I {...p} d="M5 12h14" />,
  Close: (p) => <I {...p} d="M6 6l12 12M18 6 6 18" />,
  Menu: (p) => <I {...p} d="M4 7h16M4 12h16M4 17h16" />,
  Search: (p) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></I>,
  Back: (p) => <I {...p} d="M20 12H4m6-6-6 6 6 6" />,
  Up: (p) => <I {...p} d="m6 15 6-6 6 6" />,
  Down: (p) => <I {...p} d="m6 9 6 6 6-6" />,
  Left: (p) => <I {...p} d="m15 6-6 6 6 6" />,
  Right: (p) => <I {...p} d="m9 6 6 6-6 6" />,
  Trash: (p) => <I {...p}><path d="M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13" /></I>,
  Upload: (p) => <I {...p} d="M12 16V4m-5 5 5-5 5 5M5 20h14" />,
  Check: (p) => <I {...p} d="m5 12.5 4.5 4.5L19 7.500" />,
  Lock: (p) => <I {...p}><rect x="5" y="11" width="14" height="9" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></I>,
  Out: (p) => <I {...p} d="M9 4H5v16h4m6-12 4 4-4 4m4-4H9" />,
  Bag: (p) => <I {...p}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6.500A3 3 0 0 1 12 4a3 3 0 0 1 3 2.500V8" /></I>,
  People: (p) => <I {...p}><circle cx="9" cy="9" r="3.500" /><path d="M3 20c.5-3.500 3-5.500 6-5.500s5.500 2 6 5.500M16 6a3 3 0 0 1 0 6m2 3c1.800.700 2.800 2.500 3 5" /></I>,
  Tag: (p) => <I {...p}><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.500" cy="8.500" r="1" /></I>,
  Mail: (p) => <I {...p}><rect x="3" y="5" width="18" height="14" /><path d="m3 7 9 7 9-7" /></I>,
  Cog: (p) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.600 5.600l2.100 2.100m8.600 8.600 2.100 2.100m0-12.800-2.100 2.100m-8.600 8.600-2.100 2.100" /></I>,
  Home: (p) => <I {...p}><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z" /></I>,
  Doc: (p) => <I {...p}><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></I>,
  Globe: (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.500 2.500 3.500 5.500 3.500 9s-1 6.500-3.500 9c-2.500-2.500-3.500-5.500-3.500-9S9.500 5.500 12 3Z" /></I>,
  Truck: (p) => <I {...p}><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17.500" r="1.800" /><circle cx="17" cy="17.500" r="1.800" /></I>,
  External: (p) => <I {...p} d="M14 4h6v6m0-6-9 9M18 14v6H4V6h6" />,
};

// ---------- formats ----------
export const inr = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN');
export const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const LOW = 3; // shortcut: one global low-stock line per size; becomes a shop setting if different products need different lines
export const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
export const WAIST = ['28', '30', '32', '34', '36'];
const ORDER = [...SIZES, ...WAIST];
export const bySize = (a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b);

/** 'out' | 'low' | 'ok' for a product row with product_sizes[]. */
export function stockState(sizes) {
  const total = sizes.reduce((a, s) => a + s.stock, 0);
  if (total === 0) return 'out';
  return sizes.some((s) => s.stock > 0 && s.stock <= LOW) ? 'low' : 'ok';
}

// ---------- async data ----------
export function useAsync(fn, deps = []) {
  const [s, set] = useState({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    set((p) => ({ ...p, loading: true, error: null }));
    return fn().then((data) => set({ data, error: null, loading: false }), (error) => set({ data: null, error, loading: false }));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run]);
  return { ...s, reload: run };
}

/** Throws the Supabase error so callers can use try/catch or useAsync. */
export const ok = (r) => { if (r.error) throw r.error; return r.data; };

// ---------- toast ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const toast = useCallback((msg, tone = 'ok') => {
    setT({ msg, tone, id: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), tone === 'err' ? 7000 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {t && <div key={t.id} className={`toast toast--${t.tone}`}>{t.msg}</div>}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- small shared pieces ----------
const SHAPES = {
  tee: 'M30 20 45 12q15 10 30 0l15 8 18 24-14 10-8-8v60H34V46l-8 8L12 44Z',
  long: 'M34 18 46 12q14 9 28 0l12 6 16 76-13 4-9-44v58H40V60l-9 44-13-4 16-82Z',
  kurta: 'M38 14 48 10q12 8 24 0l10 4 14 70-12 3-6-34v70H42V63l-6 34-12-3Z',
};
/** Product thumbnail: first photo, else the tonal block + silhouette the storefront uses until photos exist. */
export function Thumb({ src, tone = '#cfc8bd', kind = 'tee', className = '' }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  return (
    <span className={`thumb ${className}`} style={{ background: tone }}>
      {src && !bad ? <img src={src} alt="" loading="lazy" onError={() => setBad(true)} /> : (
        <svg viewBox="0 0 120 120" aria-hidden="true"><path d={SHAPES[kind] || SHAPES.tee} fill="currentColor" /></svg>
      )}
    </span>
  );
}

export const Status = ({ tone = 'mute', children }) => <span className={`st st--${tone}`}>{children}</span>;
export const STOCK_LABEL = { out: ['err', 'Sold out'], low: ['warn', 'Low stock'], ok: ['ok', 'In stock'] };

export function Switch({ on, onChange, label, disabled }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className="switch" onClick={() => onChange(!on)}><span /></button>;
}

export const PageHead = ({ title, sub, children }) => (
  <header className="phead">
    <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
    <div className="phead__act">{children}</div>
  </header>
);

export const Empty = ({ title, children }) => <div className="empty"><p className="empty__t">{title}</p>{children && <p>{children}</p>}</div>;
export const Failed = ({ error, retry }) => (
  <div className="empty" role="alert"><p className="empty__t">That didn't load</p><p>{/schema cache/.test(error?.message || '') ? 'This part needs a database update. Run the newest file in supabase/migrations in the Supabase SQL Editor, then reload.' : error?.message || 'Check your connection.'}</p>{retry && <button className="btn btn--line" onClick={retry}>Try again</button>}</div>
);

// ---------- orders ----------
export const ORDER_TONE = { pending: 'warn', confirmed: 'ok', paid: 'ok', shipped: 'ok', delivered: 'mute', failed: 'err', cancelled: 'err' };
export const BOOKED = (o) => !['pending', 'failed', 'cancelled'].includes(o.status);
export const TO_SHIP = (o) => o.status === 'confirmed' || o.status === 'paid';
export const dateOnly = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
