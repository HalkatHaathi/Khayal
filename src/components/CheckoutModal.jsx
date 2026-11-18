import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Close, Lock } from './Icons';
import { inr } from '../data';
import { useCart, toQuoteItem } from '../cart';
import { useAuth } from '../auth';
import { useCatalog } from '../store';
import { supabase } from '../lib/supabase';

const BLANK = { name: '', phone: '', email: '', line1: '', line2: '', city: '', state: '', pincode: '' };
const RULES = {
  name: (v) => (v.trim() ? '' : 'Enter your name.'),
  phone: (v) => (/^[6-9]\d{9}$/.test(v) ? '' : 'Enter a valid 10-digit mobile number.'),
  email: (v) => (!v || /^\S+@\S+\.\S+$/.test(v) ? '' : 'Enter a valid email address.'),
  line1: (v) => (v.trim() ? '' : 'Enter your address.'),
  city: (v) => (v.trim() ? '' : 'Enter your city.'),
  state: (v) => (v.trim() ? '' : 'Enter your state.'),
  pincode: (v) => (/^[1-9]\d{5}$/.test(v) ? '' : 'Enter a 6-digit pincode.'),
};
const LABEL = { name: 'Full name', phone: 'Mobile number', email: 'Email (optional)', line1: 'Address line 1', line2: 'Address line 2 (optional)', city: 'City', state: 'State', pincode: 'Pincode' };
const FAIL = {
  cart_issues: 'Something in your cart changed. Close this and review your cart, then try again.',
  coupon_invalid: "That coupon can't be used on this order. Remove it and try again.",
  coupon_not_eligible: 'That code is only for first orders, and this number has ordered before.',
  too_many_orders: 'There have been too many orders from this number today. Please contact us.',
  online_payments_unavailable: 'Online payment is not available yet. Please choose cash on delivery.',
};

/** Checkout: review, coupon, payment method, contact and address, then place the order. Prices come from the server quote. */
export default function CheckoutModal({ open, onClose }) {
  const cart = useCart();
  const { items, count, subtotal, discount, shipping, codFee, cod, payment, setPayment, total, coupon, setCoupon, couponResult, ready, quoting, gift } = cart;
  const { user } = useAuth();
  const { settings } = useCatalog();
  const nav = useNavigate();
  const ref = useRef(null);
  const [sum, setSum] = useState(false);
  const [code, setCode] = useState('');
  const [f, setF] = useState(BLANK);
  const [errs, setErrs] = useState({});
  const [optin, setOptin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const online = Boolean(settings?.online_payments_enabled);

  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // online payment can be switched off in the admin: then start on cash on delivery
  useEffect(() => { if (settings && !online && payment === 'prepaid') setPayment('cod'); }, [settings, online, payment, setPayment]);

  // signed-in customers: prefill from their saved default address and profile
  useEffect(() => {
    if (!open || !user || !supabase) return;
    let stale = false;
    Promise.all([
      supabase.from('addresses').select('*').order('is_default', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('profiles').select('full_name, phone').maybeSingle(),
    ]).then(([a, p]) => {
      if (stale) return;
      setF((cur) => ({
        ...cur,
        name: cur.name || a.data?.name || p.data?.full_name || '', phone: cur.phone || a.data?.phone || p.data?.phone || '', email: cur.email || user.email || '',
        line1: cur.line1 || a.data?.line1 || '', line2: cur.line2 || a.data?.line2 || '', city: cur.city || a.data?.city || '',
        state: cur.state || a.data?.state || '', pincode: cur.pincode || a.data?.pincode || '',
      }));
    });
    return () => { stale = true; };
  }, [open, user]);

  const applied = Boolean(coupon) && couponResult?.ok;
  const rejected = Boolean(coupon) && couponResult && !couponResult.ok;
  const apply = (e) => { e.preventDefault(); setCoupon(code.trim()); };
  const clear = () => { setCoupon(''); setCode(''); };
  const set = (k, v) => { setF({ ...f, [k]: k === 'phone' || k === 'pincode' ? v.replace(/\D/g, '') : v }); setFail(''); };

  const place = async () => {
    const next = Object.fromEntries(Object.keys(RULES).map((k) => [k, RULES[k](f[k])]).filter(([, v]) => v));
    setErrs(next); setFail('');
    if (Object.keys(next).length) return;
    if (!supabase) return setFail('Orders are not connected in this environment.');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_order', {
      p_items: items.map(toQuoteItem), p_coupon: coupon || null, p_payment: payment,
      p_contact: { name: f.name, phone: f.phone, email: f.email },
      p_address: { line1: f.line1, line2: f.line2, city: f.city, state: f.state, pincode: f.pincode },
      p_gift: gift.on, p_gift_note: gift.on ? gift.note : null,
    });
    setBusy(false);
    if (error) { console.error('create_order', error); return setFail(FAIL[error.message] || "We couldn't place your order. Please try again."); }
    try { sessionStorage.setItem('khayal-order-phone', f.phone); } catch { /* guest lookup falls back to asking for the number */ }
    cart.clear();
    onClose();
    nav(`/order/${data.id}${payment === 'prepaid' ? '?pay=1' : ''}`); // online orders open the payment window there; the order already exists and holds the stock
  };

  const field = (k) => (
    <label key={k} className={`co__f ${k === 'line1' || k === 'line2' || k === 'name' || k === 'email' ? 'co__f--wide' : ''}`}>
      <span>{LABEL[k]}</span>
      <input value={f[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={Boolean(errs[k])} aria-describedby={errs[k] ? `co-${k}` : undefined}
        inputMode={k === 'phone' || k === 'pincode' ? 'numeric' : undefined} maxLength={k === 'phone' ? 10 : k === 'pincode' ? 6 : 120}
        autoComplete={{ name: 'name', phone: 'tel-national', email: 'email', line1: 'address-line1', line2: 'address-line2', city: 'address-level2', state: 'address-level1', pincode: 'postal-code' }[k]} />
      {errs[k] && <em id={`co-${k}`} className="co__ferr" role="alert">{errs[k]}</em>}
    </label>
  );

  return (
    <dialog ref={ref} className="co" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-label="Checkout">
      <div className="co__head">
        <button onClick={onClose} aria-label="Close checkout"><Close size={18} /></button>
        <span className="co__word">KHYAL</span>
        <span className="co__sec">100% Secured Payment <Lock size={12} /></span>
      </div>

      <div className="co__body">
        <div className="co__card">
          <button className="co__sumhead" onClick={() => setSum(!sum)} aria-expanded={sum}>
            <span>Order Summary</span>
            <span>{count} {count === 1 ? 'item' : 'items'}<b aria-busy={quoting}>{inr(total).replace('Rs. ', '₹').replace('.00', '')}</b><ChevronDown size={16} className={sum ? 'flip' : ''} /></span>
          </button>
          {sum && (
            <ul className="co__items">
              {items.map((it) => <li key={it.key}><span>{it.name} × {it.qty}</span><span>{inr(it.price * it.qty)}</span></li>)}
              <li><span>Subtotal</span><span>{inr(subtotal)}</span></li>
              {discount > 0 && <li className="co__disc"><span>Coupon {coupon.toUpperCase()}</span><span>− {inr(discount)}</span></li>}
              <li><span>Shipping</span><span>{shipping === 0 ? 'Free' : inr(shipping)}</span></li>
              {codFee > 0 && <li><span>Cash on delivery fee</span><span>{inr(codFee)}</span></li>}
              <li className="co__total"><span>Total (incl. GST)</span><span>{inr(total)}</span></li>
            </ul>
          )}
        </div>

        <form className="co__card co__coupon" onSubmit={apply}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter coupon code" aria-label="Coupon code" aria-invalid={rejected} />
          <button type="submit" disabled={!code.trim() || quoting}>Apply</button>
          {applied && <p className="co__ok" role="status">{couponResult.message}. You saved {inr(discount)}. <button type="button" className="ul" onClick={clear}>Remove</button></p>}
          {applied && couponResult.recheck && <p className="co__hint">First-order codes are checked again with your phone number when you place the order.</p>}
          {rejected && <p className="co__err" role="alert">{couponResult.message}</p>}
        </form>

        <fieldset className="co__card co__pay">
          <legend>Payment method</legend>
          <label className={`co__radio ${online ? '' : 'is-off'}`}>
            <input type="radio" name="pay" checked={payment === 'prepaid'} disabled={!online} onChange={() => setPayment('prepaid')} />
            <span>Pay online<small>{online ? 'UPI, cards, netbanking' : 'Coming soon'}</small></span>
          </label>
          {(!cod || cod.enabled) && (
            <label className="co__radio">
              <input type="radio" name="pay" checked={payment === 'cod'} onChange={() => setPayment('cod')} />
              <span>Cash on delivery<small>{cod ? `+ ${inr(cod.fee)} fee` : 'Extra fee applies'}</small></span>
            </label>
          )}
        </fieldset>

        <fieldset className="co__card co__addr">
          <legend>Delivery details</legend>
          <div className="co__grid">{['name', 'phone', 'email', 'line1', 'line2', 'city', 'state', 'pincode'].map(field)}</div>
        </fieldset>

        {!ready && !quoting && items.length > 0 && <p className="co__err" role="alert">Some items in your cart need attention. Close this and review your cart.</p>}
        {fail && <p className="co__err" role="alert">{fail}</p>}
      </div>

      <div className="co__foot">
        <label className="co__opt"><input type="checkbox" checked={optin} onChange={(e) => setOptin(e.target.checked)} /> Send me order updates &amp; offers - (no spam)</label>
        <button className="co__go" disabled={!ready || busy || (payment === 'prepaid' && !online)} onClick={place}>
          {busy ? 'Placing order…' : payment === 'cod' ? `Place order · ${inr(total)}` : 'Continue to payment'}
        </button>
        <p>By proceeding, I agree to the <a href="/policies/privacy">Privacy Policy</a> and <a href="/policies/terms">T&amp;C</a></p>
      </div>
    </dialog>
  );
}
