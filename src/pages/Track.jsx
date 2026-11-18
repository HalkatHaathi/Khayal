import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { inr } from '../data';
import { useCatalog } from '../store';

const STOPS = ['Placed', 'Packed', 'On its way', 'Out for delivery', 'Delivered'];
const phoneKey = 'khayal-order-phone'; // same key the order page uses
const saved = () => { try { return sessionStorage.getItem(phoneKey) || ''; } catch { return ''; } };
const dayTime = (iso) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dayOnly = (iso) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

/** Which stop of the route the order has reached (0-4). */
function stage(t) {
  const s = t.shipment?.status;
  if (t.status === 'delivered' || s === 'delivered') return 4;
  if (s === 'out_for_delivery') return 3;
  if (s === 'in_transit' || t.status === 'shipped') return 2;
  if (t.status === 'confirmed' || t.status === 'paid') return 1;
  return 0;
}

function words(t, at) {
  const s = t.shipment, eta = s?.etd && new Date(s.etd).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  if (t.status === 'cancelled') return ['Order cancelled', 'This order was cancelled. If you paid online, the refund goes back to your original payment method.'];
  if (t.status === 'failed') return ["Payment didn't go through", 'No money was taken for this order.'];
  if (t.status === 'pending') return ['Waiting for payment', 'We will start packing as soon as the payment is confirmed.'];
  if (s?.status === 'rto') return ['Returning to us', 'The courier could not deliver this parcel and is sending it back. Message us and we will sort it out.'];
  if (s?.status === 'attention') return ['Delivery needs a hand', 'The courier reported a problem with delivery. Message us and we will take it up with them.'];
  return [
    ['Order placed', 'We have your order.'],
    ["We're packing your order", 'It usually ships within 3 to 5 working days. This page updates when the courier collects it.'],
    ['On its way', eta ? `Expected by ${eta}.` : 'It is with the courier and moving towards you.'],
    ['Out for delivery', 'The courier is bringing it to you today. Keep your phone nearby.'],
    ['Delivered', 'Your order has arrived. We hope you love it.'],
  ][at];
}

export default function Track() {
  const [sp, setSp] = useSearchParams();
  const { content } = useCatalog();
  const copy = content.site.tracking;
  const wa = content.site.whatsapp.replace(/\D/g, '');
  const [num, setNum] = useState(sp.get('order') || '');
  const [phone, setPhone] = useState(saved);
  const [state, setState] = useState({ status: 'idle' }); // idle | loading | found | missing
  useEffect(() => { document.title = 'Track your order – KHAYAL'; }, []);

  const lookup = async (n, p) => {
    if (!supabase) return setState({ status: 'missing' });
    setState({ status: 'loading' });
    const { data, error } = await supabase.rpc('track_order', { p_number: Number(n), p_phone: p });
    if (error || !data) return setState({ status: 'missing' });
    try { sessionStorage.setItem(phoneKey, p); } catch { /* private mode: they will retype it */ }
    setState({ status: 'found', t: data });
  };
  useEffect(() => { // arriving from a link with the number in it and the phone remembered: go straight to the result
    const n = sp.get('order');
    if (n && /^\d+$/.test(n) && /^[6-9]\d{9}$/.test(saved())) lookup(n, saved());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = /^\d{3,10}$/.test(num) && /^[6-9]\d{9}$/.test(phone);
  const submit = (e) => { e.preventDefault(); if (!valid) return; setSp({ order: num }, { replace: true }); lookup(num, phone); };

  if (state.status !== 'found') {
    return (
      <main className="track">
        <div className="track__find">
          <div>
            <h1>{copy.title}</h1>
            <p className="track__lede">{copy.intro}</p>
            <form onSubmit={submit} noValidate className="track__form">
              <label className="field"><span>Order number</span><input inputMode="numeric" maxLength="10" placeholder=" " autoComplete="off" value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, ''))} /></label>
              <label className="field"><span>Mobile number</span><input inputMode="numeric" maxLength="10" placeholder=" " autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} /></label>
              <button className="btn-dark btn-dark--wide" type="submit" disabled={!valid || state.status === 'loading'}>{state.status === 'loading' ? 'Looking…' : 'Track order'}</button>
              {state.status === 'missing' && <p className="auth__note auth__note--err" role="alert">We couldn't find an order with that number and mobile number. Check both and try again.</p>}
            </form>
          </div>
          <aside className="track__aside">
            <img src="/logo.webp" alt="" width="220" height="220" />
            <p>{copy.help}</p>
            {wa && <a className="btn-line" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">Message us on WhatsApp</a>}
          </aside>
        </div>
      </main>
    );
  }

  const t = state.t, s = t.shipment, at = stage(t);
  const closed = ['cancelled', 'failed'].includes(t.status);
  const [head, line] = words(t, at);
  const groups = [];
  (s?.events || []).forEach((e) => { const d = dayOnly(e.at); const g = groups.find((x) => x.d === d); g ? g.items.push(e) : groups.push({ d, items: [e] }); });
  const helpHref = wa && `https://wa.me/${wa}?text=${encodeURIComponent(`Hi, I need help with order #${t.number}`)}`;

  return (
    <main className="track">
      <header className="track__head">
        <h1>{head}</h1>
        <p className="track__lede">{line}</p>
        <p className="track__meta">Order #{t.number} · placed {new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}{s?.courier && ` · ${s.courier}`}{s?.awb && <> · Tracking number <strong>{s.awb}</strong></>}</p>
      </header>

      {!closed && (
        <ol className="route" style={{ '--p': at / 4 }} aria-label="Delivery progress">
          {STOPS.map((label, i) => (
            <li key={label} className={i < at ? 'is-done' : i === at ? 'is-now' : ''} aria-current={i === at ? 'step' : undefined}><i aria-hidden="true" /><span>{label}</span></li>
          ))}
        </ol>
      )}

      <div className="track__body">
        <section aria-labelledby="tu">
          <h2 id="tu">Updates</h2>
          {groups.length === 0 ? (
            <p className="track__empty">{closed ? 'There is no delivery for this order.' : 'No courier scans yet. They appear here as soon as the parcel is collected, usually within a day of shipping.'}</p>
          ) : groups.map((g) => (
            <div key={g.d} className="scan">
              <h3>{g.d}</h3>
              <ol>{g.items.map((e, i) => <li key={i}><time>{dayTime(e.at).split(', ').pop()}</time><span>{e.activity}{e.location && <em>{e.location}</em>}</span></li>)}</ol>
            </div>
          ))}
          <button className="btn-line track__again" onClick={() => lookup(t.number, saved())}>Check for new updates</button>
        </section>

        <aside className="track__order" aria-labelledby="to">
          <h2 id="to">Your order</h2>
          <ul>{t.items.map((i, k) => <li key={k}><span>{i.name}<em>Size {i.size}</em></span><span>× {i.qty}</span></li>)}</ul>
          <dl>
            <div><dt>Total</dt><dd>{inr(t.total)}{t.payment_method === 'cod' && at < 4 && !closed ? ', pay on delivery' : ''}</dd></div>
            <div><dt>Delivering to</dt><dd>{t.name && `${t.name}, `}{t.city}, {t.state} {t.pincode}</dd></div>
          </dl>
          <p className="track__help">{copy.help}</p>
          {helpHref && <a className="btn-line" href={helpHref} target="_blank" rel="noreferrer">Message us about this order</a>}
          <button className="ul ul--sm track__other" onClick={() => { setState({ status: 'idle' }); setNum(''); }}>Track another order</button>
        </aside>
      </div>
    </main>
  );
}
