import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Failed, PageHead, Switch, ok, useAsync, useToast } from '../lib/ui';

/** Asks the `pay` function whether Razorpay is configured, and in which mode. null = unknown (not deployed yet). */
function useRazorpay() {
  const [h, setH] = useState(undefined);
  useEffect(() => { supabase.functions.invoke('pay', { body: { action: 'health' } }).then(({ data, error }) => setH(error ? null : data)); }, []);
  return h;
}

export default function Settings() {
  const { data, error, loading, reload } = useAsync(() => supabase.from('shop_settings').select('*').limit(1).maybeSingle().then(ok));
  if (error) return <Failed error={error} retry={reload} />;
  if (loading) return <PageHead title="Settings" />;
  if (!data) return <Failed error={{ message: 'No settings row found. Run 0002_pricing.sql.' }} />;
  return <Form s={data} />;
}

const NUM = [
  ['shipping_fee', 'Shipping fee (Rs.)', 'Charged when the cart is under the free-shipping line.'],
  ['free_shipping_min', 'Free shipping from (Rs.)', 'Carts at or above this subtotal ship free.'],
  ['max_qty_per_line', 'Most units per item', 'Per product and size in one order.'],
  ['cod_fee', 'Cash on delivery fee (Rs.)', 'Added to cash-on-delivery orders.'],
  ['return_days', 'Return window (days)', 'Days after delivery that a customer can return or exchange. Affiliate commission is approved when this window ends. Write {{return_days}} in the Returns policy or any page to show it.'],
];

function Form({ s }) {
  const toast = useToast();
  const rz = useRazorpay();
  const [f, setF] = useState(() => ({ ...s, ...Object.fromEntries(NUM.map(([k]) => [k, String(s[k])])) }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify({ ...s, ...Object.fromEntries(NUM.map(([k]) => [k, String(s[k])])) });

  const save = async () => {
    const bad = NUM.find(([k]) => !/^\d+$/.test(f[k]) || (k === 'max_qty_per_line' && Number(f[k]) < 1) || (k === 'return_days' && Number(f[k]) > 90));
    if (bad) return setErr(`${bad[1]} must be a whole number${bad[0] === 'max_qty_per_line' ? ', 1 or more' : bad[0] === 'return_days' ? ' from 0 to 90' : ', 0 or more'}.`);
    setErr(''); setBusy(true);
    const patch = { cod_enabled: f.cod_enabled, online_payments_enabled: f.online_payments_enabled, ...(f.shiprocket_pickup ? { shiprocket_pickup: f.shiprocket_pickup.trim() } : {}), ...Object.fromEntries(NUM.map(([k]) => [k, Number(f[k])])) };
    const { data: saved, error: e } = await supabase.from('shop_settings').update(patch).eq('id', true).select();
    setBusy(false);
    if (e || !saved?.length) return setErr(e?.message || 'Nothing was saved. Sign in again and check this account is in the admins table.');
    toast('Settings saved'); setTimeout(() => window.location.reload(), 600);
  };

  return (
    <>
      <PageHead title="Settings" sub="Changes apply to the storefront immediately. No deploy needed." />
      <div className="edit edit--one">
        <div className="edit__main">
          <section className="grp">
            <h2>Shipping</h2>
            <div className="two">
              {NUM.slice(0, 2).map(([k, l, h]) => <label key={k} className="lbl">{l}<input inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /><small>{h}</small></label>)}
            </div>
          </section>
          <section className="grp">
            <h2>Payment</h2>
            <div className="line line--gap"><span>Cash on delivery</span><Switch on={f.cod_enabled} onChange={(v) => setF({ ...f, cod_enabled: v })} label="Cash on delivery" /></div>
            <label className="lbl">{NUM[3][1]}<input inputMode="numeric" value={f.cod_fee} onChange={(e) => setF({ ...f, cod_fee: e.target.value })} /><small>{NUM[3][2]}</small></label>
            <div className="line line--gap"><span>Online payment (Razorpay)</span><Switch on={f.online_payments_enabled} onChange={(v) => setF({ ...f, online_payments_enabled: v })} label="Online payment" disabled={!f.online_payments_enabled && !rz?.configured} /></div>
            <p className="hint">{rz === undefined ? 'Checking Razorpay…' : rz === null ? 'The payment function is not deployed yet, so online payment cannot be turned on. See the README, Razorpay section.'
              : !rz.configured ? 'Razorpay keys are missing. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET in Supabase, then reload.'
              : rz.mode === 'test' ? 'Razorpay is connected in TEST mode: no real money moves. Switch the keys to live before taking real orders.' : 'Razorpay is connected in LIVE mode. Real money moves.'}</p>
          </section>
          <section className="grp">
            <h2>Returns</h2>
            <label className="lbl">{NUM[4][1]}<input inputMode="numeric" value={f.return_days} onChange={(e) => setF({ ...f, return_days: e.target.value })} /><small>{NUM[4][2]}</small></label>
          </section>
          <section className="grp">
            <h2>Shiprocket</h2>
            <label className="lbl">Pickup location name<input value={f.shiprocket_pickup || ''} maxLength={60} onChange={(e) => setF({ ...f, shiprocket_pickup: e.target.value })} /><small>Exactly as it appears in Shiprocket, Settings, Pickup Addresses. Parcels are collected from there.</small></label>
          </section>
          <section className="grp">
            <h2>Limits</h2>
            <label className="lbl">{NUM[2][1]}<input inputMode="numeric" value={f.max_qty_per_line} onChange={(e) => setF({ ...f, max_qty_per_line: e.target.value })} /><small>{NUM[2][2]}</small></label>
          </section>
        </div>
      </div>
      <div className={`savebar ${dirty ? 'is-dirty' : ''}`} role="region" aria-label="Save">
        <span className={err ? 'err' : ''} role={err ? 'alert' : undefined}>{err || (dirty ? 'You have unsaved changes' : 'All changes saved')}</span>
        <div><button className="btn" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save settings'}</button></div>
      </div>
    </>
  );
}
