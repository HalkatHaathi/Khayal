import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { BOOKED, Empty, Failed, Icon, ORDER_TONE, PageHead, Status, dateOnly, inr, ok, useAsync, when } from '../lib/ui';

/** A customer is a phone number: guests have no account, and the phone is what orders are matched on. */
export default function Customers() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  // shortcut: built from the latest 1000 orders; move to a SQL view when the shop outgrows that
  const { data, error, loading, reload } = useAsync(() =>
    supabase.from('orders').select('phone,customer_name,email,user_id,status,total,created_at').order('created_at', { ascending: false }).limit(1000).then(ok));

  const list = useMemo(() => {
    const m = new Map();
    for (const o of data ?? []) {
      const c = m.get(o.phone) || { phone: o.phone, name: o.customer_name, email: o.email, account: false, orders: 0, spent: 0, last: o.created_at };
      c.orders += 1; if (BOOKED(o)) c.spent += o.total; c.email ||= o.email; c.name ||= o.customer_name; c.account ||= Boolean(o.user_id);
      m.set(o.phone, c);
    }
    return [...m.values()];
  }, [data]);
  const ql = q.toLowerCase();
  const shown = list.filter((c) => !ql || `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(ql));

  if (error) return <Failed error={error} retry={reload} />;
  return (
    <>
      <PageHead title="Customers" sub={loading ? ' ' : `${list.length} people have ordered`} />
      <div className="bar"><label className="search"><Icon.Search size={16} /><input type="search" placeholder="Name, phone or email" aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
      {!loading && shown.length === 0 ? <Empty title={list.length ? 'No customers match' : 'No customers yet'}>{list.length ? '' : 'Customers appear after their first order.'}</Empty> : (
        <table className="tbl tbl--click">
          <thead><tr><th>Customer</th><th className="hide-sm">Email</th><th className="num">Orders</th><th className="num">Spent</th><th className="hide-sm">Last order</th></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.phone} onClick={() => nav(`/customers/${c.phone}`)}>
                <td><Link to={`/customers/${c.phone}`} className="cell-link" onClick={(e) => e.stopPropagation()}>{c.name || 'Guest'}</Link><small className="sub tnum">{c.phone}{c.account ? ' · has account' : ''}</small></td>
                <td className="hide-sm">{c.email || '—'}</td><td className="num tnum">{c.orders}</td><td className="num tnum">{inr(c.spent)}</td><td className="hide-sm">{dateOnly(c.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function CustomerDetail() {
  const { phone } = useParams();
  const { data, error, loading, reload } = useAsync(() =>
    supabase.from('orders').select('id,number,customer_name,email,status,total,payment_method,created_at,shipping_address,order_items(qty)').eq('phone', phone).order('created_at', { ascending: false }).then(ok), [phone]);
  if (error) return <Failed error={error} retry={reload} />;
  if (loading || !data) return <PageHead title="Customer" />;
  if (!data.length) return <Failed error={{ message: 'No orders from that number.' }} />;
  const spent = data.filter(BOOKED).reduce((a, o) => a + o.total, 0);
  const a = data[0].shipping_address || {};
  return (
    <>
      <Link to="/customers" className="back"><Icon.Back size={14} />Customers</Link>
      <PageHead title={data.find((o) => o.customer_name)?.customer_name || 'Guest'} sub={`${data.length} ${data.length === 1 ? 'order' : 'orders'} · ${inr(spent)} spent · first order ${dateOnly(data[data.length - 1].created_at)}`} />
      <div className="edit">
        <section className="edit__main">
          <h2 className="sec-t">Orders</h2>
          <table className="tbl tbl--click tbl--flat">
            <tbody>
              {data.map((o) => (
                <tr key={o.id}>
                  <td><Link to={`/orders/${o.id}`} className="cell-link tnum">#{o.number}</Link><small className="sub">{when(o.created_at)}</small></td>
                  <td className="tnum">{o.order_items.reduce((s, i) => s + i.qty, 0)} items</td><td className="num tnum">{inr(o.total)}</td><td><Status tone={ORDER_TONE[o.status]}>{o.status}</Status></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <aside className="edit__rail">
          <section className="grp"><h2>Contact</h2>
            <p className="tnum"><a href={`tel:${phone}`} className="ul">{phone}</a></p>
            {data.find((o) => o.email) && <p><a href={`mailto:${data.find((o) => o.email).email}`} className="ul">{data.find((o) => o.email).email}</a></p>}
          </section>
          <section className="grp"><h2>Latest address</h2><address className="addr">{[a.line1, a.line2, `${a.city || ''}, ${a.state || ''} ${a.pincode || ''}`].filter(Boolean).join('\n')}</address></section>
        </aside>
      </div>
    </>
  );
}
