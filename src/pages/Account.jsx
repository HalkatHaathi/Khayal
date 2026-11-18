import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { inr } from '../data';

const STATUS = { pending: 'Awaiting payment', confirmed: 'Confirmed', paid: 'Paid', failed: 'Payment failed', cancelled: 'Cancelled', shipped: 'Shipped', delivered: 'Delivered' };
const EMPTY = { name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' };
const CHECKS = {
  name: (v) => (v.trim() ? '' : 'Enter a name.'),
  phone: (v) => (/^[6-9]\d{9}$/.test(v) ? '' : 'Enter a 10-digit mobile number.'),
  line1: (v) => (v.trim() ? '' : 'Enter an address.'),
  city: (v) => (v.trim() ? '' : 'Enter a city.'),
  state: (v) => (v.trim() ? '' : 'Enter a state.'),
  pincode: (v) => (/^[1-9]\d{5}$/.test(v) ? '' : 'Enter a 6-digit pincode.'),
};
const LABEL = { name: 'Full name', phone: 'Mobile number', line1: 'Address line 1', line2: 'Address line 2 (optional)', city: 'City', state: 'State', pincode: 'Pincode' };

function Orders({ user }) {
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    supabase.from('orders').select('id, number, status, total, created_at, order_items(id, name, size, set_name, pants_size, qty)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => (error ? setErr(true) : setOrders(data)));
  }, [user.id]);

  return (
    <section className="acct__sec" aria-labelledby="orders-h">
      <h2 id="orders-h">Orders</h2>
      {err && <p role="alert">We couldn't load your orders. Refresh to try again.</p>}
      {!err && orders === null && <p aria-busy="true">Loading…</p>}
      {orders?.length === 0 && <p>No orders yet. <Link to="/collections/new-arrivals" className="ul">Start shopping</Link>.</p>}
      <ul className="orders">
        {orders?.map((o) => (
          <li key={o.id}>
            <div className="orders__head">
              <b>Order #{o.number}</b>
              <span>{new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span>{STATUS[o.status]}</span>
              <b>{inr(o.total)}</b>
            </div>
            <ul>{o.order_items.map((i) => (
              <li key={i.id}>{i.name} × {i.qty} <span>{[i.set_name, i.size, i.pants_size && `Pants ${i.pants_size}`].filter(Boolean).join(' · ')}</span></li>
            ))}</ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Addresses({ user }) {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null); // null = closed
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const load = useCallback(() => supabase.from('addresses').select('*').order('is_default', { ascending: false })
    .then(({ data, error }) => (error ? setFail("We couldn't load your addresses.") : setList(data))), []);
  useEffect(() => { load(); }, [load, user.id]);

  const save = async (e) => {
    e.preventDefault();
    const next = Object.fromEntries(Object.keys(CHECKS).map((k) => [k, CHECKS[k](form[k])]).filter(([, v]) => v));
    setErrs(next); setFail('');
    if (Object.keys(next).length) return;
    setBusy(true);
    const { error } = await supabase.from('addresses').insert({ ...form, line2: form.line2 || null, user_id: user.id, is_default: list?.length === 0 });
    setBusy(false);
    if (error) return setFail("We couldn't save that address. Try again.");
    setForm(null); load();
  };
  const remove = async (id) => { const { error } = await supabase.from('addresses').delete().eq('id', id); if (error) setFail("We couldn't remove that address."); else load(); };

  return (
    <section className="acct__sec" aria-labelledby="addr-h">
      <h2 id="addr-h">Addresses</h2>
      {fail && <p role="alert" className="acct__err">{fail}</p>}
      {list?.length === 0 && !form && <p>No saved addresses.</p>}
      <ul className="addrs">
        {list?.map((a) => (
          <li key={a.id}>
            <p><b>{a.name}</b>{a.is_default && <em> Default</em>}<br />{a.line1}{a.line2 && `, ${a.line2}`}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</p>
            <button className="ul ul--sm" onClick={() => remove(a.id)}>Remove</button>
          </li>
        ))}
      </ul>
      {form ? (
        <form onSubmit={save} noValidate className="acct__form">
          {Object.keys(EMPTY).map((k) => (
            <label key={k} className="field field--auth">
              <input value={form[k]} placeholder=" " inputMode={k === 'phone' || k === 'pincode' ? 'numeric' : undefined}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })} aria-invalid={Boolean(errs[k])} />
              <span>{LABEL[k]}</span>
              {errs[k] && <em className="field__err" role="alert">{errs[k]}</em>}
            </label>
          ))}
          <div className="auth__row">
            <button className="btn-dark" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
            <button type="button" className="ul ul--sm" onClick={() => { setForm(null); setErrs({}); }}>Cancel</button>
          </div>
        </form>
      ) : <button className="btn-line acct__add" onClick={() => setForm(EMPTY)}>Add an address</button>}
    </section>
  );
}

export default function Account() {
  const auth = useAuth();
  const [name, setName] = useState('');
  useEffect(() => { document.title = 'My account – KHYAL'; }, []);
  useEffect(() => {
    if (auth.user) supabase.from('profiles').select('full_name').maybeSingle().then(({ data }) => setName(data?.full_name || ''));
  }, [auth.user]);

  if (!auth.ready) return <main className="acct" aria-busy="true" />;
  if (!auth.enabled || !auth.user) return <Navigate to="/account/login" state={{ from: '/account' }} replace />;

  return (
    <main className="acct">
      <header className="acct__head">
        <div><h1>{name ? `Hello, ${name.split(' ')[0]}` : 'My account'}</h1><p>{auth.user.email}</p></div>
        <button className="btn-line" onClick={auth.signOut}>Sign out</button>
      </header>
      <Orders user={auth.user} />
      <Addresses user={auth.user} />
    </main>
  );
}
