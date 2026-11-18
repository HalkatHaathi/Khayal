import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import { useAuth } from './auth';

const KEY = 'khayal-cart';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };

const opt = (opts, k) => opts.find(([a]) => a === k)?.[1];
/** What the server needs to price a line. Prices are NOT sent: the server looks them up. */
export const toQuoteItem = (it) => ({
  slug: it.slug, qty: it.qty,
  size: opt(it.opts, 'Kurta Size') || opt(it.opts, 'Waist') || opt(it.opts, 'Size'),
  set: opt(it.opts, 'Set') || null, pants: opt(it.opts, 'Pants Size') || null,
});

function reduce(items, a) {
  switch (a.type) {
    case 'add': {
      const hit = items.some((x) => x.key === a.item.key);
      return hit
        ? items.map((x) => (x.key === a.item.key ? { ...x, qty: Math.min(x.max, x.qty + a.item.qty) } : x))
        : [...items, a.item];
    }
    case 'qty': return items.map((x) => (x.key === a.key ? { ...x, qty: Math.max(1, Math.min(x.max, a.qty)) } : x));
    case 'remove': return items.filter((x) => x.key !== a.key);
    case 'merge': { // sign-in: union by key, larger quantity wins, so merging twice never doubles anything
      const m = new Map(items.map((x) => [x.key, x]));
      a.items.forEach((r) => { const l = m.get(r.key); m.set(r.key, l ? { ...l, qty: Math.min(l.max, Math.max(l.qty, r.qty)) } : r); });
      return [...m.values()];
    }
    case 'clear': return [];
    default: return items;
  }
}

const ISSUE = {
  sold_out: () => 'Sold out. Remove it to continue.',
  low_stock: (i) => `Only ${i.available} left in this size.`,
  unavailable: () => 'No longer available. Remove it to continue.',
};

const Ctx = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [items, dispatch] = useReducer(reduce, null, load);
  const [gift, setGift] = useState({ on: false, note: '' });
  const [coupon, setCoupon] = useState('');
  const [payment, setPayment] = useState('prepaid'); // 'prepaid' | 'cod'
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [synced, setSynced] = useState(false);
  const wasUser = useRef(false);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* private mode: cart lives in memory only */ } }, [items]);

  // authoritative prices, stock, coupon and shipping from the database
  useEffect(() => {
    if (!supabase) return;
    if (!items.length) { setQuote(null); setQuoting(false); return; }
    let stale = false;
    setQuoting(true);
    const t = setTimeout(() => {
      supabase.rpc('quote_cart', { p_items: items.map(toQuoteItem), p_coupon: coupon || null, p_payment: payment }).then(({ data, error }) => {
        if (stale) return;
        setQuoting(false);
        if (error) { console.error('quote failed', error); setQuote(null); } else setQuote(data);
      });
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [items, coupon, payment]);

  // signed-in carts follow the user across devices; signing out clears this device
  useEffect(() => {
    if (!supabase) return;
    if (!user) { if (wasUser.current) dispatch({ type: 'clear' }); wasUser.current = false; setSynced(false); return; }
    wasUser.current = true;
    let stale = false;
    supabase.from('user_carts').select('items').maybeSingle().then(({ data }) => {
      if (stale) return;
      if (data?.items?.length) dispatch({ type: 'merge', items: data.items });
      setSynced(true);
    });
    return () => { stale = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!supabase || !user || !synced) return;
    const t = setTimeout(() => {
      supabase.from('user_carts').upsert({ user_id: user.id, items, updated_at: new Date().toISOString() })
        .then(({ error }) => { if (error) console.error('cart save failed', error); });
    }, 600);
    return () => clearTimeout(t);
  }, [items, synced, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => {
    // overlay server truth (price, stock, problems) onto each stored line
    const view = items.map((it) => {
      const q = toQuoteItem(it);
      const line = quote?.lines.find((l) => l.slug === q.slug && l.size === q.size && (l.set || null) === q.set && (l.pants || null) === q.pants);
      const problem = quote?.issues.find((i) => i.slug === q.slug && i.size === q.size);
      return {
        ...it,
        price: line ? line.unit_price : it.price,
        max: line ? Math.max(1, Math.min(line.available, 10)) : it.max,
        issue: problem ? ISSUE[problem.code](problem) : null,
      };
    });
    const localSub = view.reduce((n, x) => n + x.qty * x.price, 0);
    const priced = !supabase || (quote && !quoting);
    return {
      items: view, gift, setGift, coupon, setCoupon, payment, setPayment, quote, quoting,
      count: items.reduce((n, x) => n + x.qty, 0),
      subtotal: quote ? quote.subtotal : localSub,
      discount: quote?.discount ?? 0,
      shipping: quote?.shipping ?? 0,
      codFee: quote?.cod_fee ?? 0,
      cod: quote?.cod ?? null, // { enabled, fee } straight from shop_settings
      total: quote ? quote.total : localSub,
      freeShipMin: quote?.free_shipping_min,
      couponResult: quote?.coupon ?? null,
      ready: items.length > 0 && Boolean(priced) && !view.some((x) => x.issue) && !(quote?.issues.length),
      add: (item) => dispatch({ type: 'add', item }),
      setQty: (key, qty) => dispatch({ type: 'qty', key, qty }),
      remove: (key) => dispatch({ type: 'remove', key }),
      clear: () => { dispatch({ type: 'clear' }); setCoupon(''); setGift({ on: false, note: '' }); },
    };
  }, [items, gift, coupon, payment, quote, quoting]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = () => useContext(Ctx);
