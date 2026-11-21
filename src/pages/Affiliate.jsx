import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { inr } from '../data';

const LABEL = { pending: 'Pending', approved: 'Approved', paid: 'Paid', reversed: 'Cancelled' };
const iso = (d) => d.toISOString().slice(0, 10);
const monthStart = (d = new Date()) => iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)));
const shift = (m, n) => { const d = new Date(`${m}T00:00:00Z`); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))); };
const monthName = (m) => new Date(`${m}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const day = (s) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function Bars({ days }) {
  const max = Math.max(1, ...days.map((d) => d.clicks));
  const n = days.length;
  return (
    <figure className="aff__chart">
      <div className="aff__bars" role="img" aria-label="Clicks per day this month. Days with an order are dark.">
        {days.map((d) => <span key={d.day} className={d.orders ? 'is-sale' : ''} style={{ height: `${Math.max(3, (d.clicks / max) * 100)}%` }} title={`${day(d.day)}: ${d.clicks} clicks, ${d.orders} orders`} />)}
      </div>
      <div className="aff__axis" aria-hidden="true"><span>{day(days[0].day)}</span><span>{day(days[Math.floor(n / 2)].day)}</span><span>{day(days[n - 1].day)}</span></div>
      <figcaption>Clicks per day. <i /> marks a day with an order.</figcaption>
    </figure>
  );
}

function Payout({ initial }) {
  const [v, setV] = useState(initial || '');
  const [s, setS] = useState('');
  const save = async (e) => {
    e.preventDefault(); setS('saving');
    const { error } = await supabase.rpc('set_my_payout_details', { p_details: v });
    setS(error ? 'fail' : 'saved');
  };
  return (
    <form onSubmit={save} className="aff__pay">
      <label className="aff__lbl" htmlFor="aff-upi">Paid to</label>
      <div className="aff__join"><input id="aff-upi" value={v} maxLength={200} placeholder="UPI ID or bank details" onChange={(e) => { setV(e.target.value); setS(''); }} /><button className="btn-dark" disabled={s === 'saving'}>{s === 'saving' ? 'Saving' : 'Save'}</button></div>
      <p className="aff__note" role="status">{s === 'saved' ? 'Saved.' : s === 'fail' ? 'We could not save that. Try again.' : 'Where we send your commission.'}</p>
    </form>
  );
}

const SAMPLE = () => {
  const days = Array.from({ length: 30 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, clicks: [3, 8, 5, 12, 9, 4, 0, 7, 15, 11, 6, 2, 9, 20, 14, 8, 5, 3, 10, 6, 4, 9, 13, 7, 2, 5, 8, 4, 6, 3][i], orders: [0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0][i] }));
  return {
    affiliate: { id: 'x', name: 'Asha Verma', code: 'ASHA10', rate: 10, buyer_percent: 10, status: 'active', payout_details: 'asha@okhdfc' },
    return_days: 7, month: '2026-11-01', clicks: 214, orders: 6, revenue: 21400, commission: 2140,
    balance: { pending: 1140, approved: 1000, paid: 3200 }, days,
    rows: [
      { number: 1042, at: '2026-11-19T10:00:00Z', base: 3600, commission: 360, status: 'pending', items: [{ name: 'Pudina Kurta', qty: 1 }, { name: 'Crow Theory Tee', qty: 1 }] },
      { number: 1038, at: '2026-11-14T10:00:00Z', base: 7200, commission: 720, status: 'pending', items: [{ name: 'Ember Contour Hoodie', qty: 2 }] },
      { number: 1031, at: '2026-11-09T10:00:00Z', base: 4000, commission: 400, status: 'approved', items: [{ name: 'Crow Theory Tee', qty: 2 }] },
      { number: 1024, at: '2026-11-03T10:00:00Z', base: 2600, commission: 260, status: 'reversed', items: [{ name: 'Pudina Kurta', qty: 1 }] },
      { number: 1019, at: '2026-11-02T10:00:00Z', base: 4000, commission: 400, status: 'paid', items: [{ name: 'Crow Theory Tee', qty: 2 }] },
    ],
    top: [{ name: 'Crow Theory Tee', qty: 5 }, { name: 'Pudina Kurta', qty: 2 }, { name: 'Ember Contour Hoodie', qty: 2 }],
    payouts: [{ amount: 2200, reference: 'UPI 4382910', at: '2026-11-05T10:00:00Z' }, { amount: 1000, reference: 'UPI 3920011', at: '2026-10-05T10:00:00Z' }],
  };
};
const SAMPLE_ON = import.meta.env.DEV && new URLSearchParams(window.location.search).has('sample');

export default function Affiliate() {
  const auth = useAuth();
  const [m, setM] = useState(monthStart());
  const [r, setR] = useState(undefined); // undefined = loading, null = not an affiliate, 'err'
  const [copied, setCopied] = useState(false);
  useEffect(() => { document.title = 'Affiliate – KHYAL'; }, []);
  useEffect(() => {
    if (SAMPLE_ON) { setR(SAMPLE()); return; }
    if (!auth.user || !supabase) return;
    let stale = false;
    supabase.rpc('affiliate_report', { p_month: m }).then(({ data, error }) => { if (!stale) setR(error ? 'err' : data); });
    return () => { stale = true; };
  }, [auth.user, m]);

  if (!auth.ready) return <main className="acct" aria-busy="true" />;
  if (!SAMPLE_ON && (!auth.enabled || !auth.user)) return <Navigate to="/account/login" state={{ from: '/account/affiliate' }} replace />;
  if (r === undefined) return <main className="acct" aria-busy="true"><p>Loading…</p></main>;
  if (r === 'err') return <main className="acct"><p role="alert">We couldn't load your dashboard. Refresh to try again.</p></main>;
  if (r === null) return <main className="acct"><h1>Affiliate</h1><p>This account isn't part of the affiliate programme. <Link to="/contact" className="ul">Get in touch</Link> if you'd like to join.</p></main>;

  const a = r.affiliate;
  const link = `${window.location.origin}/?ref=${a.code}`;
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); setCopied(t); setTimeout(() => setCopied(false), 1800); } catch { /* the text is selectable */ } };
  const thisMonth = m === monthStart();
  const conv = r.clicks ? `${((r.orders / r.clicks) * 100).toFixed(1)}%` : '–';
  const b = r.balance;
  const rate = Number(a.rate);

  return (
    <main className="acct aff">
      <header className="aff__head">
        <div><h1>Affiliate</h1><p>{a.name}{a.status === 'paused' && ' · paused'}</p></div>
        <Link to="/account" className="ul ul--sm">My account</Link>
      </header>
      {a.status === 'paused' && <p className="auth__note auth__note--err" role="status">Your link is paused, so new orders won't earn commission. Get in touch if that's a surprise.</p>}

      <section className="aff__share" aria-label="Your link">
        <div className="aff__shareMain">
          <span className="aff__lbl">Your link</span>
          <div className="aff__join"><input readOnly value={link} aria-label="Your affiliate link" onFocus={(e) => e.target.select()} /><button className="btn-dark" onClick={() => copy(link)}>{copied === link ? 'Copied' : 'Copy link'}</button></div>
          <p className="aff__code">Or share your code <button className="aff__chip" onClick={() => copy(a.code)} aria-label={`Copy code ${a.code}`}>{a.code}<small>{copied === a.code ? 'Copied' : 'Copy'}</small></button></p>
        </div>
        <ul className="aff__terms">
          <li><b className="tnum">{rate}%</b><span>commission on every order</span></li>
          {a.buyer_percent > 0 && <li><b className="tnum">{a.buyer_percent}%</b><span>off for your followers</span></li>}
          <li><b className="tnum">30</b><span>days a visitor is remembered</span></li>
        </ul>
      </section>

      <section className="aff__bal" aria-label="Your earnings">
        <div><span className="aff__lbl">Pending</span><b className="tnum">{inr(b.pending)}</b><small>Until the {r.return_days}-day return window ends</small></div>
        <div><span className="aff__lbl">Approved</span><b className="tnum">{inr(b.approved)}</b><small>Ready to be paid to you</small></div>
        <div><span className="aff__lbl">Paid to you</span><b className="tnum">{inr(b.paid)}</b><small>Sent so far</small></div>
      </section>

      <div className="aff__cols">
        <div className="aff__main">
          <div className="aff__month">
            <h2>{monthName(m)}</h2>
            <span><button className="aff__step" onClick={() => setM(shift(m, -1))} aria-label="Previous month">‹</button><button className="aff__step" disabled={thisMonth} onClick={() => setM(shift(m, 1))} aria-label="Next month">›</button></span>
          </div>
          <dl className="aff__stats">
            <div><dt>Clicks</dt><dd className="tnum">{r.clicks}</dd></div>
            <div><dt>Orders</dt><dd className="tnum">{r.orders}</dd></div>
            <div><dt>Conversion</dt><dd className="tnum">{conv}</dd></div>
            <div><dt>Sales driven</dt><dd className="tnum">{inr(r.revenue)}</dd></div>
            <div><dt>You earned</dt><dd className="tnum">{inr(r.commission)}</dd></div>
          </dl>
          <Bars days={r.days} />

          <h2 className="aff__h2">Orders</h2>
          {r.rows.length === 0 ? <p className="aff__empty">No orders this month yet.</p> : (
            <table className="aff__tbl">
              <thead><tr><th>Order</th><th>Items</th><th className="num">Value</th><th className="num">You earn</th><th className="num">Status</th></tr></thead>
              <tbody>
                {r.rows.map((o) => (
                  <tr key={o.number} className={o.status === 'reversed' ? 'is-off' : ''}>
                    <td><span className="tnum">#{o.number}</span><small>{day(o.at)}</small></td>
                    <td className="aff__items">{o.items.map((i) => `${i.name}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(', ')}</td>
                    <td className="num tnum">{inr(o.base)}</td>
                    <td className="num tnum"><b>{inr(o.commission)}</b></td>
                    <td className="num"><em className={`aff__st aff__st--${o.status}`}>{LABEL[o.status]}</em></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="aff__side">
          <Payout key={a.id} initial={a.payout_details} />

          <section>
            <h2 className="aff__h2">Payments to you</h2>
            {r.payouts.length === 0 ? <p className="aff__empty">None yet. Approved earnings are paid out by us and listed here with the reference.</p> : (
              <ul className="aff__list">{r.payouts.map((p, i) => <li key={i}><span>{day(p.at)}<small>{p.reference}</small></span><b className="tnum">{inr(p.amount)}</b></li>)}</ul>
            )}
          </section>

          {r.top.length > 0 && (
            <section>
              <h2 className="aff__h2">Most bought through you</h2>
              <ul className="aff__list">{r.top.map((t) => <li key={t.name}><span>{t.name}</span><span className="tnum">{t.qty} sold</span></li>)}</ul>
            </section>
          )}

          <section>
            <h2 className="aff__h2">How it works</h2>
            <p className="aff__note aff__note--body">You earn {rate}% of what the customer pays for the products, after any discount; shipping and cash-on-delivery fees don't count. It stays pending while the order is on its way and for {r.return_days} days after delivery, in case it's returned. Then it's approved and we pay it out. Cancelled, refunded and returned orders don't earn commission, and neither do orders placed with your own account or email. We never show you customer names or contact details.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
