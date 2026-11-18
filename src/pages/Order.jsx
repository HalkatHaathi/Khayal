import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { inr } from '../data';
import { payOrder } from '../lib/razorpay';

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
  const [sp, setSp] = useSearchParams();
  const [tick, setTick] = useState(0);              // bump to re-read the order
  const [pay, setPay] = useState({ busy: false, msg: '' });
  const started = useRef(false);
  useEffect(() => { document.title = 'Your order – KHYAL'; }, []);

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
  }, [id, phone, tick]);

  const o0 = state.status === 'found' ? state.o : null;
  const payable = Boolean(o0) && o0.status === 'pending' && o0.payment_method === 'prepaid';
  const expired = payable && o0.expires_at && new Date(o0.expires_at).getTime() < Date.now();

  // after paying, the webhook may beat or trail the browser: look again a few times before telling the customer to wait
  const settleWatch = useCallback(async () => {
    for (let i = 0; i < 6; i++) { setTick((t) => t + 1); await new Promise((r) => setTimeout(r, 4000)); if (!document.getElementById('order-pending')) return true; }
    return false;
  }, []);
  const startPay = useCallback(async () => {
    setPay({ busy: true, msg: '' });
    try {
      const r = await payOrder(id, phone);
      if (r.status === 'paid') { setPay({ busy: false, msg: '' }); setTick((t) => t + 1); return; }
      if (r.status === 'refunded') { setPay({ busy: false, msg: 'Your payment reached us after the hold on your items ended, so it has been refunded in full. Please place the order again.' }); setTick((t) => t + 1); return; }
      if (r.status === 'pending') { setPay({ busy: true, msg: 'Payment received. Confirming your order…' }); const done = await settleWatch(); setPay({ busy: false, msg: done ? '' : 'We have not been able to confirm your payment yet. If money left your account, your order will update within a few minutes; you do not need to pay again.' }); return; }
      setPay({ busy: false, msg: '' }); setTick((t) => t + 1); // window closed: it may still have been paid in the meantime
    } catch (e) { setPay({ busy: false, msg: e.message }); }
  }, [id, phone, settleWatch]);
  useEffect(() => { // arriving from checkout with ?pay=1: open the payment window once
    if (!payable || expired || started.current || sp.get('pay') !== '1') return;
    started.current = true; setSp({}, { replace: true }); startPay();
  }, [payable, expired, sp, setSp, startPay]);

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

      {payable && (
        <section className="order__pay" id="order-pending" aria-labelledby="op">
          <h2 id="op">{expired ? 'This order has expired' : 'Complete your payment'}</h2>
          {expired ? <p>Payment was not completed in time, so the items were released. Please place the order again.</p> : (
            <>
              <p>Total {inr(o.total)}. We are holding your items{o.expires_at ? ` until ${new Date(o.expires_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}.</p>
              <button className="btn-dark btn-dark--wide" onClick={startPay} disabled={pay.busy}>{pay.busy ? 'Opening payment…' : 'Pay now'}</button>
            </>
          )}
          {pay.msg && <p className="auth__note" role="status">{pay.msg}</p>}
        </section>
      )}
      {!payable && pay.msg && <p className="auth__note" role="status">{pay.msg}</p>}
      {o.refunded && <p className="auth__note" role="status">This order has been refunded. The money reaches your account within 5 to 7 working days.</p>}

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
