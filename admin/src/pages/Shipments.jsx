import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Empty, Failed, Icon, PageHead, Status, ok, useAsync, useToast, when } from '../lib/ui';

export const SHIP_TONE = { created: 'warn', awaiting_pickup: 'warn', in_transit: 'ok', out_for_delivery: 'ok', delivered: 'mute', attention: 'err', rto: 'err', cancelled: 'err' };
export const SHIP_LABEL = { created: 'Created', awaiting_pickup: 'Awaiting pickup', in_transit: 'In transit', out_for_delivery: 'Out for delivery', delivered: 'Delivered', attention: 'Needs attention', rto: 'Returning to you', cancelled: 'Cancelled' };
const ACTIVE = ['awaiting_pickup', 'in_transit', 'out_for_delivery'];
const VIEWS = [
  ['active', 'On the move', (s) => ACTIVE.includes(s.status)],
  ['attention', 'Needs attention', (s) => ['attention', 'rto'].includes(s.status)],
  ['delivered', 'Delivered', (s) => s.status === 'delivered'],
  ['all', 'All', () => true],
];
const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);

export default function Shipments() {
  const nav = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') || 'active';
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  // shortcut: the latest 500 shipments; add paging when you pass that
  const { data, error, loading, reload } = useAsync(() =>
    supabase.from('shipments').select('order_id,awb,courier,status,status_label,etd,updated_at,orders(number,customer_name,phone)').not('awb', 'is', null).order('updated_at', { ascending: false }).limit(500).then(ok));

  const rows = data ?? [];
  const counts = useMemo(() => Object.fromEntries(VIEWS.map(([k, , f]) => [k, rows.filter(f).length])), [rows]);
  const f = VIEWS.find(([k]) => k === view)?.[2] || VIEWS[0][2];
  const ql = q.trim().toLowerCase();
  const shown = rows.filter((s) => f(s) && (!ql || `${s.awb} ${s.orders?.number} ${s.orders?.customer_name || ''} ${s.courier || ''}`.toLowerCase().includes(ql)));

  // asks Shiprocket for fresh scans one parcel at a time (it rate-limits), at most 25 per press
  const refreshAll = async () => {
    const todo = rows.filter((s) => ACTIVE.includes(s.status)).slice(0, 25);
    let done = 0, failed = 0;
    for (const s of todo) {
      setBusy(`Checking ${++done} of ${todo.length}…`);
      const { error: e } = await supabase.functions.invoke('shiprocket-ship', { body: { action: 'refresh', order_id: s.order_id } });
      if (e) failed++;
    }
    setBusy('');
    toast(failed ? `${todo.length - failed} updated, ${failed} could not be checked` : `${todo.length} parcels checked`, failed ? 'err' : 'ok');
    reload();
  };

  if (error) return <Failed error={error} retry={reload} />;
  return (
    <>
      <PageHead title="Shipments" sub={loading ? ' ' : `${counts.active} on the move · ${counts.attention} need attention`}>
        <button className="btn btn--line" onClick={refreshAll} disabled={Boolean(busy) || counts.active === 0}>{busy || 'Refresh parcels on the move'}</button>
      </PageHead>
      <div className="tabs" role="tablist">
        {VIEWS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'is-on' : ''} onClick={() => setSp({ view: k }, { replace: true })}>{label}<span className="tnum">{counts[k]}</span></button>
        ))}
      </div>
      <div className="bar"><label className="search"><Icon.Search size={16} /><input type="search" placeholder="Order number, tracking number or name" aria-label="Search shipments" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
      <p className="hint">Updates arrive from the courier automatically. Refresh only if a parcel looks stuck.</p>

      {!loading && shown.length === 0 ? <Empty title={rows.length ? 'Nothing here' : 'No shipments yet'}>{rows.length ? '' : 'Book one from an order page with Ship with Shiprocket.'}</Empty> : (
        <table className="tbl tbl--click">
          <thead><tr><th>Order</th><th>Customer</th><th className="hide-sm">Courier</th><th className="hide-sm">Tracking number</th><th>Status</th><th className="hide-sm">Last update</th></tr></thead>
          <tbody>
            {shown.map((s) => {
              const quiet = ACTIVE.includes(s.status) ? daysSince(s.updated_at) : 0;
              return (
                <tr key={s.order_id} onClick={() => nav(`/orders/${s.order_id}`)}>
                  <td><Link to={`/orders/${s.order_id}`} className="cell-link tnum" onClick={(e) => e.stopPropagation()}>#{s.orders?.number}</Link></td>
                  <td>{s.orders?.customer_name || '—'}<small className="sub tnum">{s.orders?.phone}</small></td>
                  <td className="hide-sm">{s.courier || '—'}</td><td className="hide-sm tnum">{s.awb}</td>
                  <td><Status tone={SHIP_TONE[s.status]}>{SHIP_LABEL[s.status]}</Status>{s.etd && ACTIVE.includes(s.status) && <small className="sub">Due {new Date(s.etd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small>}</td>
                  <td className="hide-sm">{when(s.updated_at)}{quiet >= 3 && <small className="sub st--warn">No news for {quiet} days</small>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
