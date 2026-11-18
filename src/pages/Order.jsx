import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { inr } from '../data';

const SHIP = { awaiting_pickup: 'Ready for pickup', in_transit: 'On its way', out_for_delivery: 'Out for delivery', delivered: 'Delivered', attention: 'Delivery issue, we are on it', rto: 'Returning to us', cancelled: 'Shipment cancelled' };
const day = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const STATUS = {
  pending: 'Awaiting payment', confirmed: 'Order confirmed', paid: 'Paid', failed: 'Payment failed',
  cancelled: 'Cancelled', shipped: 'Shipped', delivered: 'Delivered',
};
const phoneKey = 'khayal-order-phone';
const saved = () => { try { return sessionStorage.getItem(phoneKey) || ''; } catch { return ''; } };

export default function Order() {
  const { id } = useParams();
  const [phone, setPhone] = useState(saved);
  const [typed, setTyped] = useState('');
  const [state, setState] = useState({ status: 'idle' }); // idle | loading | found | missing
  const [track, setTrack] = useState(null);
  useEffect(() => { document.title = 'Your order – KHAYAL'; }, []);

  useEffect(() => {
    if (!supabase) return;
    let stale = false;
    setState({ status: 'loading' });
    supabase.rpc('get_order', { p_id: id, p_phone: phone }).then(({ data, error }) => {
      if (stale) return;
      setState(error || !data ? { status: 'missing' } : { status: 'found', o: data });
      if (!error && data) supabase.rpc('get_tracking', { p_id: id, p_phone: phone }).then(({ data: t }) => { if (!stale) setTrack(t || null); }); // null before migration 0008 or before a parcel is booked
    });
    return () => { stale = true; };
  }, [id, phone]);

  const lookup = (e) => { e.preventDefault(); if (/^[6-9]\d{9}$/.test(typed)) setPhone(typed); };

  if (state.status === 'loading' || state.status === 'idle') return <main className="order" aria-busy="true" />;
  if (state.status === 'missing') {
    return (
      <main className="order">
        <h1>Find your order</h1>
        <p>Enter the mobile number you used at checkout to see this order.</p>
        <form onSubmit={lookup} className="order__lookup">
          <label className="field field--auth"><input inputMode="numeric" maxLength="10" placeholder=" " value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} /><span>Mobile number</span></label>
          <button className="btn-dark" type="submit" disabled={!/^[6-9]\d{9}$/.test(typed)}>View order</button>
        </form>
        {phone && <p className="auth__note auth__note--err" role="alert">We couldn't find an order with that number.</p>}
      </main>
    );
  }

  const o = state.o;
  const a = o.address;
  return (
    <main className="order">
      <h1>{o.status === 'confirmed' || o.status === 'paid' ? 'Thank you' : STATUS[o.status]}</h1>
      <p className="order__lede">Order #{o.number} · {STATUS[o.status]}</p>
      {o.payment_method === 'cod' && o.status === 'confirmed' && (
        <p className="auth__note">Please keep {inr(o.total)} ready to pay in cash when your order arrives.</p>
      )}

      {track && (
        <section className="order__sec" aria-labelledby="ot">
          <h2 id="ot">Tracking</h2>
          <p className="order__track"><strong>{SHIP[track.status] || 'Shipped'}</strong>{track.courier && ` with ${track.courier}`}{track.awb && <> · <span>Tracking number {track.awb}</span></>}</p>
          {track.etd && track.status !== 'delivered' && <p className="order__note">Expected by {new Date(track.etd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>}
          <p className="order__note"><Link to={`/track?order=${o.number}`} className="ul ul--sm">Open the full tracking page</Link></p>
          {track.events.length > 0 && <ol className="order__events">{track.events.map((e, k) => <li key={k}><span>{e.activity}{e.location && <em>{e.location}</em>}</span><time>{day(e.at)}</time></li>)}</ol>}
        </section>
      )}

      <section className="order__sec" aria-labelledby="oi">
        <h2 id="oi">Items</h2>
        <ul>{o.items.map((i, k) => (
          <li key={k}><span>{i.name} × {i.qty}<em>{[i.set, i.size, i.pants && `Pants ${i.pants}`].filter(Boolean).join(' · ')}</em></span><span>{inr(i.unit_price * i.qty)}</span></li>
        ))}</ul>
        <dl className="order__sum">
          <div><dt>Subtotal</dt><dd>{inr(o.subtotal)}</dd></div>
          {o.discount > 0 && <div><dt>Discount</dt><dd>− {inr(o.discount)}</dd></div>}
          <div><dt>Shipping</dt><dd>{o.shipping ? inr(o.shipping) : 'Free'}</dd></div>
          {o.cod_fee > 0 && <div><dt>Cash on delivery fee</dt><dd>{inr(o.cod_fee)}</dd></div>}
          <div className="order__total"><dt>Total (incl. GST)</dt><dd>{inr(o.total)}</dd></div>
        </dl>
      </section>

      <section className="order__sec" aria-labelledby="oa">
        <h2 id="oa">Delivering to</h2>
        <p>{a.name}<br />{a.line1}{a.line2 && `, ${a.line2}`}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</p>
      </section>

      <Link to="/collections/new-arrivals" className="btn-line order__cta">Continue shopping</Link>
    </main>
  );
}
