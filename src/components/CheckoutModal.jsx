import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Close, Lock } from './Icons';
import { inr } from '../data';
import { useCart, toQuoteItem } from '../cart';
import { useAuth } from '../auth';
import { useCatalog } from '../store';
import { supabase } from '../lib/supabase';

const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];
const Alert = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.500v5.500M12 16.500v.2" /></svg>;
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
const LABEL = { name: 'Full name', phone: 'Mobile number', email: 'Email (optional)', line1: 'Address', line2: 'Landmark or apartment (optional)', city: 'City', state: 'State', pincode: 'Pincode' };
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
    if (payment === 'prepaid' && !f.email.trim() && !next.email) next.email = 'Enter your email: Razorpay needs it for your payment receipt.';
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

  const field = (k) => {
    const common = { id: `co-${k}`, value: f[k], 'aria-invalid': Boolean(errs[k]), 'aria-describedby': errs[k] ? `co-${k}-err` : undefined };
    const auto = { name: 'name', phone: 'tel-national', email: 'email', line1: 'address-line1', line2: 'address-line2', city: 'address-level2', state: 'address-level1', pincode: 'postal-code' }[k];
    return (
      <label key={k} htmlFor={`co-${k}`} className={`cf ${['name', 'line1', 'line2', 'state'].includes(k) ? 'cf--wide' : ''} ${k === 'phone' ? 'cf--tel' : ''} ${k === 'state' ? 'cf--sel' : ''} ${errs[k] ? 'is-bad' : ''}`}>
        {k === 'state' ? (
          <select {...common} onChange={(e) => set(k, e.target.value)} autoComplete={auto}>
            <option value="" />
            {f.state && !STATES.includes(f.state) && <option>{f.state}</option>}
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        ) : (
          <input {...common} onChange={(e) => set(k, e.target.value)} placeholder=" " autoComplete={auto}
            inputMode={k === 'phone' || k === 'pincode' ? 'numeric' : undefined} maxLength={k === 'phone' ? 10 : k === 'pincode' ? 6 : 120} type={k === 'email' ? 'email' : 'text'} />
        )}
        <span>{k === 'email' && payment === 'prepaid' ? 'Email' : LABEL[k]}</span>
        {k === 'phone' && <b className="cf__pre" aria-hidden="true">+91</b>}
        {errs[k] && <em id={`co-${k}-err`} className="cf__err" role="alert"><Alert />{errs[k]}</em>}
      </label>
    );
  };
  const money = (n) => inr(n).replace('Rs. ', '₹').replace('.00', '');

  return (
    <dialog ref={ref} className="co" onClose={onClose} aria-label="Checkout">
      <header className="co__bar">
        <button className="co__x" onClick={onClose} aria-label="Close checkout"><Close size={20} /></button>
        <span className="co__word">KHYAL</span>
        <span className="co__sec"><Lock size={13} />Secure checkout</span>
      </header>

      <div className="co__scroll">
        <div className="co__main">
          <h1>Delivery details</h1>
          <p className="co__lede">Where should we send your order? We use your mobile number for delivery updates.</p>

          <div className="co__fields">{['name', 'phone', 'email', 'line1', 'line2', 'pincode', 'city', 'state'].map(field)}</div>

          <section className="co__sec2" aria-labelledby="co-pay-h">
            <h2 id="co-pay-h">Payment</h2>
            <div className="co__opts" role="radiogroup" aria-labelledby="co-pay-h">
              <label className={`co__row ${online ? '' : 'is-off'}`}>
                <input type="radio" name="pay" checked={payment === 'prepaid'} disabled={!online} onChange={() => setPayment('prepaid')} />
                <span><strong>Pay online</strong><small>{online ? 'UPI, cards, netbanking, wallets' : 'Not available right now'}</small></span>
              </label>
              {(!cod || cod.enabled) && (
                <label className="co__row">
                  <input type="radio" name="pay" checked={payment === 'cod'} onChange={() => setPayment('cod')} />
                  <span><strong>Cash on delivery</strong><small>{cod ? `${inr(cod.fee)} extra fee` : 'An extra fee applies'}</small></span>
                </label>
              )}
            </div>
          </section>

          <section className="co__sec2" aria-labelledby="co-cp-h">
            <h2 id="co-cp-h">Coupon</h2>
            <form className="co__coupon" onSubmit={apply}>
              <label className={`cf ${rejected ? 'is-bad' : ''}`}>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder=" " aria-invalid={rejected} autoComplete="off" />
                <span>Coupon code</span>
              </label>
              <button type="submit" className="btn-line" disabled={!code.trim() || quoting}>Apply</button>
            </form>
            {applied && <p className="co__ok" role="status">{couponResult.message}. You saved {inr(discount)}. <button type="button" className="ul" onClick={clear}>Remove</button></p>}
            {applied && couponResult.recheck && <p className="co__hint">First-order codes are checked again with your phone number when you place the order.</p>}
            {rejected && <p className="co__bad" role="alert"><Alert />{couponResult.message}</p>}
          </section>

          <section className="co__sec2" aria-labelledby="co-sum-h">
            <button className="co__sumhead" onClick={() => setSum(!sum)} aria-expanded={sum}>
              <h2 id="co-sum-h">Order summary</h2>
              <span>{count} {count === 1 ? 'item' : 'items'}<ChevronDown size={16} className={sum ? 'flip' : ''} /></span>
            </button>
            {sum && (
              <ul className="co__items">
                {items.map((it) => <li key={it.key}><span>{it.name} × {it.qty}</span><span>{inr(it.price * it.qty)}</span></li>)}
                <li><span>Subtotal</span><span>{inr(subtotal)}</span></li>
                {discount > 0 && <li className="co__disc"><span>Coupon {coupon.toUpperCase()}</span><span>− {inr(discount)}</span></li>}
                <li><span>Shipping</span><span>{shipping === 0 ? 'Free' : inr(shipping)}</span></li>
                {codFee > 0 && <li><span>Cash on delivery fee</span><span>{inr(codFee)}</span></li>}
              </ul>
            )}
          </section>

          <label className="co__optin"><input type="checkbox" checked={optin} onChange={(e) => setOptin(e.target.checked)} />Send me order updates and offers. No spam.</label>
          {!ready && !quoting && items.length > 0 && <p className="co__bad" role="alert"><Alert />Some items in your cart need attention. Close this and review your cart.</p>}
          {fail && <p className="co__bad" role="alert"><Alert />{fail}</p>}
          <p className="co__legal">By continuing you agree to our <a href="/policies/privacy">Privacy Policy</a> and <a href="/policies/terms">Terms</a>.</p>
        </div>
      </div>

      <footer className="co__foot">
        <div className="co__total">
          <span>Total</span>
          <b aria-busy={quoting}>{money(total)}</b>
          <small>incl. GST · shipping {shipping === 0 ? 'free' : money(shipping)}</small>
        </div>
        <button className="btn-dark btn-dark--wide co__go" disabled={!ready || busy || (payment === 'prepaid' && !online)} onClick={place}>
          {busy ? 'Placing order…' : payment === 'cod' ? 'Place order' : 'Continue to payment'}
        </button>
      </footer>
    </dialog>
  );
}
