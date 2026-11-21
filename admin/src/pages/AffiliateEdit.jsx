import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Failed, Icon, PageHead, Status, Switch, dateOnly, inr, ok, useAsync, useToast, when } from '../lib/ui';

const STORE = import.meta.env.VITE_STORE_URL || 'http://localhost:5173';
const ERR = {
  no_account: 'No account uses that email. They need to create an account on the store first (Account, Register).',
  invalid_code: 'The code needs 3 to 20 capital letters, numbers, hyphens or underscores.',
  code_taken: 'That code is already used by a discount or another affiliate.',
  already_affiliate: 'That account is already an affiliate.',
  invalid_rate: 'Rates must be between 0 and 100.',
  nothing_due: 'Nothing is approved and unpaid for this affiliate right now.',
};
const msg = (e) => ERR[e.message] || e.message;
const ST = { pending: ['warn', 'Pending'], approved: ['ok', 'Approved'], paid: ['mute', 'Paid'], reversed: ['err', 'Cancelled'] };
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10); };
const shift = (m, n) => { const d = new Date(`${m}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 10); };
const monthName = (m) => new Date(`${m}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function AffiliateEdit() {
  const { id } = useParams();
  return id === 'new' ? <Create /> : <Detail key={id} id={id} />;
}

function Create() {
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ email: '', name: '', code: '', rate: '10', buyer: '10' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: k === 'code' ? e.target.value.toUpperCase().replace(/\s/g, '') : e.target.value });
  const save = async () => {
    const rate = Number(f.rate), buyer = Number(f.buyer);
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErr('Enter the email of their store account.');
    if (!/^[A-Z0-9_-]{3,20}$/.test(f.code)) return setErr(ERR.invalid_code);
    if (!(rate >= 0 && rate <= 100) || !Number.isInteger(buyer) || buyer < 0 || buyer > 100) return setErr('Commission can be 0 to 100 (decimals allowed). Customer discount must be a whole number from 0 to 100.');
    setErr(''); setBusy(true);
    const { data, error } = await supabase.rpc('admin_create_affiliate', { p_email: f.email.trim(), p_code: f.code, p_rate: rate, p_buyer_percent: buyer, p_name: f.name.trim() || null });
    if (error) { setBusy(false); return setErr(msg(error)); }
    toast('Affiliate added'); nav(`/affiliates/${data}`);
  };
  return (
    <>
      <Link to="/affiliates" className="back"><Icon.Back size={14} />Affiliates</Link>
      <PageHead title="New affiliate" />
      <div className="edit edit--one"><div className="edit__main">
        <section className="grp">
          <h2>Who</h2>
          <label className="lbl">Account email<input type="email" value={f.email} onChange={set('email')} placeholder="name@example.com" /><small>They must already have an account on the store. They sign in there and open Account, then Affiliate dashboard.</small></label>
          <label className="lbl">Display name<input value={f.name} maxLength={100} onChange={set('name')} /><small>Optional. Defaults to the name on their account.</small></label>
        </section>
        <section className="grp">
          <h2>Link and code</h2>
          <label className="lbl">Code<input value={f.code} onChange={set('code')} placeholder="ASHA10" /><small>Their link is {STORE}/?ref={f.code || 'CODE'}. The same code works in the coupon box at checkout.</small></label>
        </section>
        <section className="grp">
          <h2>Terms</h2>
          <div className="two">
            <label className="lbl">Commission (%)<input inputMode="decimal" value={f.rate} onChange={set('rate')} /><small>Of what the customer pays for products, after discounts. Shipping and COD fees are not included.</small></label>
            <label className="lbl">Customer discount (%)<input inputMode="numeric" value={f.buyer} onChange={set('buyer')} /><small>Off for people who use the link or code. 0 for none.</small></label>
          </div>
        </section>
      </div></div>
      <div className="savebar is-dirty" role="region" aria-label="Save">
        <span className={err ? 'err' : ''} role={err ? 'alert' : undefined}>{err || 'You can change the rates later; they only affect new orders.'}</span>
        <div><Link to="/affiliates" className="btn btn--ghost">Cancel</Link><button className="btn" onClick={save} disabled={busy}>{busy ? 'Adding…' : 'Add affiliate'}</button></div>
      </div>
    </>
  );
}

function Detail({ id }) {
  const [m, setM] = useState(monthStart());
  const { data, error, loading, reload } = useAsync(async () => {
    const [r, list] = await Promise.all([supabase.rpc('affiliate_report', { p_affiliate: id, p_month: m }).then(ok), supabase.rpc('admin_affiliates').then(ok)]);
    if (!r) throw new Error('That affiliate does not exist.');
    return { r, row: list.find((x) => x.id === id) };
  }, [id, m]);
  if (error) return <Failed error={error} retry={reload} />;
  if (loading || !data) return <PageHead title="Affiliate" />;
  return <View r={data.r} email={data.row?.email} m={m} setM={setM} reload={reload} />;
}

function View({ r, email, m, setM, reload }) {
  const toast = useToast();
  const a = r.affiliate;
  const [f, setF] = useState({ name: a.name, rate: String(Number(a.rate)), buyer: String(a.buyer_percent), active: a.status === 'active' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState(null); // null = closed, else { ref, note }
  const dirty = f.name !== a.name || Number(f.rate) !== Number(a.rate) || Number(f.buyer) !== a.buyer_percent || f.active !== (a.status === 'active');
  const link = `${STORE}/?ref=${a.code}`;
  const b = r.balance;

  const save = async () => {
    const rate = Number(f.rate), buyer = Number(f.buyer);
    if (!f.name.trim()) return setErr('Give them a display name.');
    if (!(rate >= 0 && rate <= 100) || !Number.isInteger(buyer) || buyer < 0 || buyer > 100) return setErr(ERR.invalid_rate);
    setErr(''); setBusy(true);
    const { data: saved, error: e } = await supabase.from('affiliates').update({ name: f.name.trim(), rate, buyer_percent: buyer, status: f.active ? 'active' : 'paused' }).eq('id', a.id).select();
    setBusy(false);
    if (e || !saved?.length) return setErr(e?.message || 'Nothing was saved. Sign in again and check this account is in the admins table.');
    toast('Saved'); reload();
  };
  const recordPayout = async () => {
    setBusy(true);
    const { data, error: e } = await supabase.rpc('admin_pay_affiliate', { p_affiliate: a.id, p_reference: pay.ref, p_note: pay.note });
    setBusy(false);
    if (e) return toast(msg(e), 'err');
    toast(`Recorded ${inr(data.amount)} across ${data.orders} ${data.orders === 1 ? 'order' : 'orders'}`); setPay(null); reload();
  };

  return (
    <>
      <Link to="/affiliates" className="back"><Icon.Back size={14} />Affiliates</Link>
      <PageHead title={a.name} sub={`${email || ''}${a.status === 'paused' ? ' · paused' : ''}`} />
      <div className="edit">
        <div className="edit__main">
          <section className="grp">
            <h2>Balance</h2>
            <dl className="kpis kpis--3">
              <div><dt>Pending</dt><dd className="tnum">{inr(b.pending)}</dd><small>Not delivered, or inside the {r.return_days}-day return window</small></div>
              <div><dt>To pay now</dt><dd className="tnum">{inr(b.approved)}</dd><small>Approved, not yet paid</small></div>
              <div><dt>Paid so far</dt><dd className="tnum">{inr(b.paid)}</dd></div>
            </dl>
            {pay ? (
              <div className="payform">
                <p>Pay {a.name} <b>{inr(b.approved)}</b> first (UPI or bank), then record it here. {a.payout_details ? <>Their details: <b>{a.payout_details}</b>.</> : 'They have not added payout details yet.'}</p>
                <div className="two">
                  <label className="lbl">Payment reference<input value={pay.ref} maxLength={100} onChange={(e) => setPay({ ...pay, ref: e.target.value })} placeholder="UPI transaction id" /></label>
                  <label className="lbl">Note (optional)<input value={pay.note} maxLength={300} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></label>
                </div>
                <div className="line line--start"><button className="btn" onClick={recordPayout} disabled={busy}>{busy ? 'Recording…' : `Record ${inr(b.approved)} as paid`}</button><button className="btn btn--ghost" onClick={() => setPay(null)}>Cancel</button></div>
              </div>
            ) : <button className="btn btn--line" disabled={b.approved <= 0} onClick={() => setPay({ ref: '', note: '' })}>Record a payout</button>}
            {b.approved <= 0 && <p className="hint">Commission becomes payable once an order is delivered and its return window has passed.</p>}
          </section>

          <section className="grp">
            <div className="line"><h2>{monthName(m)}</h2><span className="line"><button className="btn btn--ghost btn--sm" onClick={() => setM(shift(m, -1))}>Previous</button><button className="btn btn--ghost btn--sm" disabled={m === monthStart()} onClick={() => setM(shift(m, 1))}>Next</button></span></div>
            <dl className="kpis">
              <div><dt>Clicks</dt><dd className="tnum">{r.clicks}</dd></div>
              <div><dt>Orders</dt><dd className="tnum">{r.orders}</dd></div>
              <div><dt>Conversion</dt><dd className="tnum">{r.clicks ? `${((r.orders / r.clicks) * 100).toFixed(1)}%` : '–'}</dd></div>
              <div><dt>Sales</dt><dd className="tnum">{inr(r.revenue)}</dd></div>
              <div><dt>Commission</dt><dd className="tnum">{inr(r.commission)}</dd></div>
            </dl>
            {r.rows.length === 0 ? <p className="hint">No orders this month.</p> : (
              <table className="tbl tbl--flat">
                <thead><tr><th>Order</th><th className="hide-sm">Items</th><th className="num">Value</th><th className="num">Commission</th><th>Status</th></tr></thead>
                <tbody>
                  {r.rows.map((o) => (
                    <tr key={o.number}>
                      <td><Link to={`/orders/${o.id}`} className="cell-link tnum">#{o.number}</Link><small className="sub">{when(o.at)}</small></td>
                      <td className="hide-sm">{o.items.map((i) => `${i.name}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(', ')}</td>
                      <td className="num tnum">{inr(o.base)}</td><td className="num tnum">{inr(o.commission)}</td>
                      <td><Status tone={ST[o.status][0]}>{ST[o.status][1]}</Status></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="grp">
            <h2>Payouts</h2>
            {r.payouts.length === 0 ? <p className="hint">Nothing paid yet.</p> : (
              <table className="tbl tbl--flat">
                <thead><tr><th>Date</th><th>Reference</th><th className="num">Amount</th></tr></thead>
                <tbody>{r.payouts.map((p, i) => <tr key={i}><td>{dateOnly(p.at)}</td><td>{p.reference || '–'}{p.note && <small className="sub">{p.note}</small>}</td><td className="num tnum">{inr(p.amount)}</td></tr>)}</tbody>
              </table>
            )}
          </section>
        </div>

        <aside className="edit__rail">
          <section className="grp">
            <h2>Link and code</h2>
            <dl className="kv">
              <div><dt>Link</dt><dd className="kv__ref">{link}</dd></div>
              <div><dt>Code</dt><dd className="tnum">{a.code}</dd></div>
              <div><dt>Payout</dt><dd>{a.payout_details || 'Not added yet'}</dd></div>
            </dl>
            <button className="btn btn--line btn--sm" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Link copied'))}>Copy link</button>
          </section>
          <section className="grp">
            <h2>Terms</h2>
            <label className="lbl">Display name<input value={f.name} maxLength={100} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="lbl">Commission (%)<input inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></label>
            <label className="lbl">Customer discount (%)<input inputMode="numeric" value={f.buyer} onChange={(e) => setF({ ...f, buyer: e.target.value })} /></label>
            <div className="line line--gap"><span>Active</span><Switch on={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" /></div>
            <p className="hint">New rates apply to orders placed from now on. Past orders keep the commission they were placed with. Pause instead of deleting: a paused link and code stop earning, and history is kept.</p>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button>
          </section>
        </aside>
      </div>
    </>
  );
}
