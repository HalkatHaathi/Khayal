import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Empty, Failed, Icon, ORDER_TONE, PageHead, Status, TO_SHIP, inr, ok, useAsync, when } from '../lib/ui';

const VIEWS = [
  ['all', 'All', () => true],
  ['ship', 'To ship', TO_SHIP],
  ['pending', 'Awaiting payment', (o) => o.status === 'pending'],
  ['shipped', 'Shipped', (o) => o.status === 'shipped'],
  ['delivered', 'Delivered', (o) => o.status === 'delivered'],
  ['closed', 'Cancelled', (o) => o.status === 'cancelled' || o.status === 'failed'],
];

export default function Orders() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') || 'all';
  const q = sp.get('q') || '';
  // shortcut: the latest 500 orders are loaded and filtered here; add server-side paging when you pass that
  const { data, error, loading, reload } = useAsync(() =>
    supabase.from('orders').select('id,number,customer_name,phone,status,total,payment_method,created_at,order_items(qty)').order('created_at', { ascending: false }).limit(500).then(ok));
  const put = (k, v) => setSp((p) => { const n = new URLSearchParams(p); if (v && v !== 'all') n.set(k, v); else n.delete(k); return n; }, { replace: true });

  const rows = data ?? [];
  const counts = useMemo(() => Object.fromEntries(VIEWS.map(([k, , f]) => [k, rows.filter(f).length])), [rows]);
  const f = VIEWS.find(([k]) => k === view)?.[2] || VIEWS[0][2];
  const ql = q.trim().toLowerCase().replace(/^#/, '');
  const shown = rows.filter((o) => f(o) && (!ql || `${o.number} ${o.customer_name || ''} ${o.phone}`.toLowerCase().includes(ql)));

  if (error) return <Failed error={error} retry={reload} />;
  return (
    <>
      <PageHead title="Orders" sub={loading ? ' ' : `${rows.length} orders${rows.length === 500 ? ' (latest 500)' : ''}`} />
      <div className="tabs" role="tablist">
        {VIEWS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'is-on' : ''} onClick={() => put('view', k)}>
            {label}<span className="tnum">{counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="bar">
        <label className="search"><Icon.Search size={16} /><input type="search" placeholder="Order number, name or phone" aria-label="Search orders" value={q} onChange={(e) => put('q', e.target.value)} /></label>
      </div>
      {!loading && shown.length === 0 ? <Empty title={rows.length ? 'No orders match' : 'No orders yet'}>{rows.length ? '' : 'Orders appear here as customers check out.'}</Empty> : (
        <table className="tbl tbl--click">
          <thead><tr><th>Order</th><th className="hide-sm">Placed</th><th>Customer</th><th className="hide-sm">Payment</th><th className="num hide-sm">Items</th><th className="num">Total</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.id} onClick={() => nav(`/orders/${o.id}`)}>
                <td><Link to={`/orders/${o.id}`} className="cell-link tnum" onClick={(e) => e.stopPropagation()}>#{o.number}</Link></td>
                <td className="hide-sm">{when(o.created_at)}</td>
                <td>{o.customer_name || '—'}<small className="sub tnum">{o.phone}</small></td>
                <td className="hide-sm">{o.payment_method === 'cod' ? 'Cash on delivery' : 'Prepaid'}</td>
                <td className="num tnum hide-sm">{o.order_items.reduce((a, i) => a + i.qty, 0)}</td>
                <td className="num tnum">{inr(o.total)}</td>
                <td><Status tone={ORDER_TONE[o.status]}>{o.status}</Status></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
