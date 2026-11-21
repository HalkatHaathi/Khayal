import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { SHIP_LABEL, SHIP_TONE } from './Shipments';
import { Failed, Icon, ORDER_TONE, PageHead, Status, inr, ok, useAsync, useToast, when } from '../lib/ui';


/** Edge Function errors arrive as a Response; pull the message out. */
const fnError = async (error) => { try { return (await error.context.json()).error; } catch { return error.message; } };

// mirrors admin_set_order_status() in 0004_admin.sql; the database refuses anything else
const NEXT = {
  pending: [['cancelled', 'Cancel order'], ['failed', 'Mark payment failed']],
  confirmed: [['shipped', 'Mark shipped'], ['cancelled', 'Cancel order']],
  paid: [['shipped', 'Mark shipped'], ['cancelled', 'Cancel order']],
  shipped: [['delivered', 'Mark delivered']],
};
const HOLDS_STOCK = ['pending', 'confirmed', 'paid'];

export default function OrderDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const o = await supabase.from('orders').select('*, order_items(*)').eq('id', id).maybeSingle().then(ok);
    if (!o) throw new Error('That order does not exist.');
    // shipments / shipment_events exist after migration 0008; before it the order page works as it did
    const [sh, ev, af] = await Promise.all([
      supabase.from('shipments').select('*').eq('order_id', id).maybeSingle(),
      supabase.from('shipment_events').select('at,activity,location').eq('order_id', id).order('at', { ascending: false }),
      o.affiliate_id ? supabase.from('affiliates').select('id,name,code').eq('id', o.affiliate_id).maybeSingle() : null,
    ]);
    return { ...o, shipment: sh.error ? null : sh.data, events: ev.error ? [] : ev.data, affiliate: af?.data || null };
  }, [id]);
  if (error) return <Failed error={error} retry={reload} />;
  if (loading || !data) return <PageHead title="Order" />;
  return <Detail key={[data.status, data.courier, data.tracking_number, data.admin_note, data.shipment?.status, data.shipment?.awb, data.events.length].join('|')} o={data} reload={reload} />;
}

function Detail({ o, reload }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(null);
  const [box, setBox] = useState({ weight: '0.5', length: '30', breadth: '25', height: '5' });
  const sh = o.shipment;
  const canShip = ['confirmed', 'paid'].includes(o.status);
  const [ship, setShip] = useState({ courier: o.courier || '', tracking: o.tracking_number || '', note: o.admin_note || '' });
  const a = o.shipping_address || {};
  const dirty = ship.courier !== (o.courier || '') || ship.tracking !== (o.tracking_number || '') || ship.note !== (o.admin_note || '');

  const move = async (status) => {
    setBusy(true);
    const { error: e } = await supabase.rpc('admin_set_order_status', { p_order: o.id, p_status: status });
    setBusy(false); setAsk(null);
    if (e) return toast(e.message === 'invalid_transition' ? 'That status change is not allowed from here.' : e.message, 'err');
    toast(`Order #${o.number} is now ${status}`); reload();
  };
  const [refunding, setRefunding] = useState(false);
  const [refundErr, setRefundErr] = useState('');
  const refund = async () => {
    setBusy(true); setRefundErr('');
    const { error: e } = await supabase.functions.invoke('pay', { body: { action: 'refund', order_id: o.id } });
    setBusy(false);
    if (e) return setRefundErr(await fnError(e)); // stays on screen, inside the refund box, until the admin closes it
    setRefunding(false);
    toast(`Refunded ${inr(o.total)}. It reaches the customer in 5 to 7 working days.`); reload();
  };
  const call = async (action) => {
    setBusy(true);
    const { data, error: e } = await supabase.functions.invoke('shiprocket-ship', { body: { action, order_id: o.id, ...(action === 'create' ? Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Number(v)])) : {}) } });
    setBusy(false);
    if (e) { toast(await fnError(e), 'err'); reload(); return; }
    (data.notes || []).forEach((n) => toast(n, 'err'));
    toast(action === 'create' ? 'Shipment booked with Shiprocket' : 'Tracking updated'); reload();
  };
  const saveShip = async () => {
    setBusy(true);
    const { error: e } = await supabase.rpc('admin_update_order', { p_order: o.id, p_courier: ship.courier, p_tracking: ship.tracking, p_note: ship.note });
    setBusy(false);
    if (e) return toast(e.message, 'err');
    toast('Shipping details saved'); reload();
  };
  const addr = [a.name, a.line1, a.line2, `${a.city || ''}, ${a.state || ''} ${a.pincode || ''}`, a.phone && `Phone ${a.phone}`].filter(Boolean).join('\n');
  const STORE = import.meta.env.VITE_STORE_URL || 'http://localhost:5173';
  const link = `${STORE}/track?order=${o.number}`;
  const note = `Hi ${(o.customer_name || '').split(' ')[0] || 'there'}, your Khyal order #${o.number} ${sh?.awb ? `is on its way with ${sh.courier || 'our courier'}` : 'is confirmed'}. Track it here: ${link}`;
  const copyLink = () => navigator.clipboard?.writeText(link).then(() => toast('Tracking link copied'), () => toast('Could not copy', 'err'));
  const copy = () => navigator.clipboard?.writeText(addr).then(() => toast('Address copied'), () => toast('Could not copy', 'err'));

  return (
    <>
      <Link to="/orders" className="back"><Icon.Back size={14} />Orders</Link>
      <PageHead title={`Order #${o.number}`} sub={`${when(o.created_at)} · ${o.payment_method === 'cod' ? 'Cash on delivery' : 'Prepaid'}`}>
        <Status tone={ORDER_TONE[o.status]}>{o.status}</Status>
        <button className="btn btn--line" onClick={() => window.print()}>Print packing slip</button>
      </PageHead>

      <div className="edit">
        <div className="edit__main">
          <section className="grp">
            <h2>Items</h2>
            <table className="tbl tbl--flat">
              <thead><tr><th>Product</th><th>Size</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Line</th></tr></thead>
              <tbody>
                {o.order_items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}{(i.set_name || i.pants_size) && <small className="sub">{[i.set_name, i.pants_size && `pants ${i.pants_size}`].filter(Boolean).join(' · ')}</small>}</td>
                    <td>{i.size}</td><td className="num tnum">{i.qty}</td><td className="num tnum">{inr(i.unit_price)}</td><td className="num tnum">{inr(i.unit_price * i.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="sum">
              <div><dt>Subtotal</dt><dd className="tnum">{inr(o.subtotal)}</dd></div>
              {o.discount > 0 && <div><dt>Discount{o.coupon_code && ` (${o.coupon_code})`}</dt><dd className="tnum">− {inr(o.discount)}</dd></div>}
              <div><dt>Shipping</dt><dd className="tnum">{o.shipping ? inr(o.shipping) : 'Free'}</dd></div>
              {o.cod_fee > 0 && <div><dt>Cash on delivery fee</dt><dd className="tnum">{inr(o.cod_fee)}</dd></div>}
              <div className="sum__total"><dt>Total</dt><dd className="tnum">{inr(o.total)}</dd></div>
            </dl>
            {o.payment_method === 'cod' && o.status !== 'delivered' && !['cancelled', 'failed'].includes(o.status) && <p className="hint">Collect {inr(o.total)} on delivery.</p>}
          </section>

          <section className="grp">
            <h2>Shipment</h2>
            {sh?.awb ? (
              <>
                <dl className="sum sum--left">
                  <div><dt>Status</dt><dd><Status tone={SHIP_TONE[sh.status]}>{SHIP_LABEL[sh.status]}</Status></dd></div>
                  <div><dt>Courier</dt><dd>{sh.courier || '—'}</dd></div>
                  <div><dt>Tracking number</dt><dd className="tnum">{sh.awb}</dd></div>
                  {sh.etd && <div><dt>Expected delivery</dt><dd>{when(sh.etd)}</dd></div>}
                </dl>
                <div className="line line--start">
                  {sh.label_url && <a className="btn btn--line" href={sh.label_url} target="_blank" rel="noreferrer">Shipping label<Icon.External size={14} /></a>}
                  <button className="btn btn--line" onClick={() => call('refresh')} disabled={busy}>{busy ? 'Checking…' : 'Refresh tracking'}</button>
                </div>
                <div className="line line--start">
                  <button className="btn btn--ghost btn--sm" onClick={copyLink}>Copy customer tracking link</button>
                  <a className="btn btn--ghost btn--sm" href={`https://wa.me/91${o.phone}?text=${encodeURIComponent(note)}`} target="_blank" rel="noreferrer">Send on WhatsApp<Icon.External size={14} /></a>
                </div>
                {sh.status === 'rto' && <p className="hint">The courier is returning this parcel. Cancel the order here once it is back so the stock is restored.</p>}
                {sh.status === 'attention' && <p className="hint">The courier reported a problem (failed delivery, damage or similar). Check Shiprocket for the next step.</p>}
                {o.events.length > 0 && (
                  <ol className="track">
                    {o.events.map((e, i) => <li key={i}><span>{e.activity}{e.location && <small className="sub">{e.location}</small>}</span><time className="tnum">{when(e.at)}</time></li>)}
                  </ol>
                )}
              </>
            ) : canShip ? (
              <>
                {sh && <p className="hint">Shiprocket has the order but no courier yet{'. '}Fix what the message says (usually wallet balance or an unserviceable pincode) and press the button again.</p>}
                <p className="hint">Books the order with Shiprocket, picks its recommended courier, schedules the pickup and creates the label. Packed parcel size:</p>
                <div className="four">
                  {[['weight', 'Weight (kg)'], ['length', 'Length (cm)'], ['breadth', 'Breadth (cm)'], ['height', 'Height (cm)']].map(([k, l]) => (
                    <label key={k} className="lbl">{l}<input inputMode="decimal" value={box[k]} onChange={(e) => setBox({ ...box, [k]: e.target.value })} /></label>
                  ))}
                </div>
                <button className="btn" onClick={() => call('create')} disabled={busy}>{busy ? 'Booking…' : 'Ship with Shiprocket'}</button>
              </>
            ) : <p className="hint">{o.status === 'shipped' || o.status === 'delivered' ? 'Shipped without Shiprocket. Add the courier below if you want customers to see it.' : 'Shipments can be booked once the order is confirmed or paid.'}</p>}
          </section>

          {!sh?.awb && <section className="grp">
            <h2>Shipping details (manual)</h2>
            <div className="two">
              <label className="lbl">Courier<input value={ship.courier} maxLength={60} onChange={(e) => setShip({ ...ship, courier: e.target.value })} placeholder="Delhivery" /></label>
              <label className="lbl">Tracking number<input value={ship.tracking} maxLength={80} onChange={(e) => setShip({ ...ship, tracking: e.target.value })} /></label>
            </div>
            <label className="lbl">Internal note<textarea rows={3} maxLength={1000} value={ship.note} onChange={(e) => setShip({ ...ship, note: e.target.value })} /><small>Only visible here, never to the customer.</small></label>
            <button className="btn btn--line" onClick={saveShip} disabled={busy || !dirty}>Save shipping details</button>
          </section>}
        </div>

        <aside className="edit__rail">
          {NEXT[o.status] && (
            <section className="grp">
              <h2>Next step</h2>
              <div className="stack">
                {NEXT[o.status].map(([s, label], i) => ask === s ? (
                  <div key={s} className="confirm">
                    <p>{HOLDS_STOCK.includes(o.status) ? 'The items go back into stock. ' : ''}This cannot be undone.</p>
                    <div className="line"><button className="btn btn--danger" onClick={() => move(s)} disabled={busy}>Yes, {label.toLowerCase()}</button><button className="btn btn--ghost" onClick={() => setAsk(null)}>Keep</button></div>
                  </div>
                ) : (
                  <button key={s} className={`btn ${i === 0 && s !== 'cancelled' ? '' : 'btn--line'}`} disabled={busy} onClick={() => (s === 'cancelled' || s === 'failed' ? setAsk(s) : move(s))}>{label}</button>
                ))}
              </div>
            </section>
          )}
          <section className="grp">
            <h2>Customer</h2>
            <dl className="kv">
              <div><dt>Name</dt><dd><Link to={`/customers/${o.phone}`} className="cell-link">{o.customer_name || 'Guest'}</Link></dd></div>
              <div><dt>Phone</dt><dd className="tnum"><a href={`tel:${o.phone}`} className="ul">{o.phone}</a></dd></div>
              {o.email && <div><dt>Email</dt><dd><a href={`mailto:${o.email}`} className="ul">{o.email}</a></dd></div>}
              <div><dt>Account</dt><dd>{o.user_id ? 'Signed in at checkout' : 'Guest checkout'}</dd></div>
            </dl>
          </section>
          {o.affiliate && (
            <section className="grp">
              <h2>Affiliate</h2>
              <dl className="kv">
                <div><dt>Referred by</dt><dd><Link to={`/affiliates/${o.affiliate.id}`} className="cell-link">{o.affiliate.name}</Link> <span className="kv__ref">{o.affiliate.code}</span></dd></div>
                <div><dt>Commission</dt><dd className="tnum">{inr(o.affiliate_commission)}{o.payout_id && ' · paid'}</dd></div>
              </dl>
            </section>
          )}
          <section className="grp">
            <h2>Deliver to</h2>
            <address className="addr">{addr}</address>
            <button className="btn btn--line btn--sm" onClick={copy}>Copy address</button>
            {o.is_gift && <p className="hint">Gift order{o.gift_note ? `: “${o.gift_note}”` : '.'}</p>}
          </section>
          <section className="grp">
            <h2>Payment</h2>
            <dl className="kv">
              <div><dt>Method</dt><dd>{o.payment_method === 'cod' ? 'Cash on delivery' : 'Online (Razorpay)'}</dd></div>
              <div><dt>Status</dt><dd>{o.refund_id ? <Status tone="mute">Refunded</Status> : o.paid_at ? <Status tone="ok">Paid</Status> : <Status tone="warn">Not paid</Status>}</dd></div>
              {o.paid_at && <div><dt>Paid on</dt><dd>{when(o.paid_at)}</dd></div>}
              {o.rzp_payment_id && <div><dt>Reference</dt><dd className="tnum kv__ref">{o.rzp_payment_id}</dd></div>}
              {o.refund_id && <div><dt>Refunded</dt><dd className="tnum">{inr(o.refund_amount)} on {when(o.refunded_at)}</dd></div>}
            </dl>
            {o.status === 'pending' && o.expires_at && <p className="hint">Stock is held until {when(o.expires_at)}, then released.</p>}
            {o.rzp_payment_id && !o.refund_id && (
              <div className="pay-act">
                {o.status === 'cancelled' && <p className="callout" role="status">This order was cancelled after the customer paid. Refund them to finish.</p>}
                {refunding
                  ? <div className="confirm"><p>Refund {inr(o.total)} to the customer's original payment method? This cannot be undone.</p>{refundErr && <p className="callout" role="alert"><strong>Razorpay said:</strong> {refundErr}</p>}<div className="line line--start"><button className="btn btn--danger" onClick={refund} disabled={busy}>{busy ? 'Refunding…' : refundErr ? 'Try again' : 'Yes, refund'}</button><button className="btn btn--ghost" onClick={() => { setRefunding(false); setRefundErr(''); }} disabled={busy}>{refundErr ? 'Close' : 'Keep'}</button></div></div>
                  : <button className="btn btn--line" onClick={() => setRefunding(true)}>Refund {inr(o.total)}</button>}
                {o.status !== 'cancelled' && !refunding && <p className="hint">To cancel and refund: cancel the order first (it returns the stock), then refund.</p>}
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
