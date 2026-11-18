import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { BOOKED, Empty, Failed, ORDER_TONE as TONE, PageHead, Status, TO_SHIP, Thumb, inr, ok, stockState, useAsync, when, LOW } from '../lib/ui';

export default function Overview() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [orders, products] = await Promise.all([
      supabase.from('orders').select('id,number,customer_name,phone,status,total,payment_method,created_at').order('created_at', { ascending: false }).limit(200).then(ok),
      supabase.from('products').select('id,slug,name,tone,kind,is_active,product_sizes(size,stock),product_images(url,position)').then(ok),
    ]);
    const ship = await supabase.from('shipments').select('status'); // exists after migration 0008
    return { orders, products, stuck: ship.error ? 0 : ship.data.filter((x) => ['attention', 'rto'].includes(x.status)).length };
  });

  if (error) return <Failed error={error} retry={reload} />;
  if (loading || !data) return <PageHead title="Overview" />;

  const { orders, products, stuck } = data;
  const week = Date.now() - 7 * 864e5;
  const recent = orders.filter((o) => BOOKED(o) && new Date(o.created_at) > week);
  const revenue = recent.reduce((a, o) => a + o.total, 0);
  const toShip = orders.filter((o) => TO_SHIP(o));
  const live = products.filter((p) => p.is_active);
  const out = live.filter((p) => stockState(p.product_sizes) === 'out');
  const low = live.filter((p) => stockState(p.product_sizes) === 'low');

  return (
    <>
      <PageHead title="Overview" />
      <p className="lede">
        {recent.length
          ? <><strong>{inr(revenue)}</strong> booked in the last 7 days across {recent.length} {recent.length === 1 ? 'order' : 'orders'}. </>
          : <>No orders in the last 7 days. </>}
        {toShip.length ? <><Link to="/orders?view=ship"><strong>{toShip.length}</strong> {toShip.length === 1 ? 'is' : 'are'} waiting to ship</Link>. </> : 'Nothing is waiting to ship. '}
        {stuck > 0 && <><Link to="/shipments?view=attention"><strong>{stuck}</strong> {stuck === 1 ? 'parcel needs' : 'parcels need'} attention</Link>. </>}
        {out.length + low.length ? <><Link to="/inventory?attention=1"><strong>{out.length + low.length}</strong> {out.length + low.length === 1 ? 'product needs' : 'products need'} restocking</Link>.</> : 'Stock looks healthy.'}
      </p>

      <div className="cols">
        <section>
          <h2 className="sec-t">Restock</h2>
          {out.length + low.length === 0 ? <Empty title="All live products are stocked">Sizes at {LOW} or fewer will show here.</Empty> : (
            <ul className="rows">
              {[...out, ...low].slice(0, 8).map((p) => {
                const img = [...p.product_images].sort((a, b) => a.position - b.position)[0]?.url;
                const risky = p.product_sizes.filter((s) => s.stock <= LOW).sort((a, b) => a.stock - b.stock);
                return (
                  <li key={p.id}>
                    <Link to={`/inventory?q=${encodeURIComponent(p.name)}`} className="row">
                      <Thumb src={img} tone={p.tone} kind={p.kind} />
                      <span className="row__main">{p.name}<small>{risky.map((s) => `${s.size} ${s.stock}`).join(' · ')}</small></span>
                      <Status tone={stockState(p.product_sizes) === 'out' ? 'err' : 'warn'}>{stockState(p.product_sizes) === 'out' ? 'Sold out' : 'Low'}</Status>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="sec-t">Recent orders</h2>
          {orders.length === 0 ? <Empty title="No orders yet">New orders appear here as customers check out.</Empty> : (
            <table className="tbl">
              <thead><tr><th>Order</th><th>Customer</th><th className="num">Total</th><th>Status</th></tr></thead>
              <tbody>
                {orders.slice(0, 8).map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/orders/${o.id}`} className="cell-link tnum">#{o.number}</Link><small className="sub">{when(o.created_at)}</small></td>
                    <td>{o.customer_name || o.phone}<small className="sub">{o.payment_method === 'cod' ? 'Cash on delivery' : 'Prepaid'}</small></td>
                    <td className="num tnum">{inr(o.total)}</td>
                    <td><Status tone={TONE[o.status]}>{o.status}</Status></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="hint"><Link to="/orders" className="cell-link">All orders</Link></p>
        </section>
      </div>
    </>
  );
}
