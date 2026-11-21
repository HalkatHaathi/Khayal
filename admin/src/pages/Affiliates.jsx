import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Empty, Failed, Icon, PageHead, Status, inr, ok, useAsync } from '../lib/ui';

export default function Affiliates() {
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => supabase.rpc('admin_affiliates').then(ok));
  if (error) return <Failed error={error} retry={reload} />;
  const due = (data || []).reduce((n, a) => n + a.approved, 0);
  return (
    <>
      <PageHead title="Affiliates" sub={loading ? ' ' : due ? `${inr(due)} approved and waiting to be paid.` : 'Partners who earn commission on the orders they bring.'}>
        <Link to="/affiliates/new" className="btn"><Icon.Plus size={14} />Add affiliate</Link>
      </PageHead>
      {loading || !data ? null : data.length === 0 ? <Empty title="No affiliates yet"><Link to="/affiliates/new" className="btn">Add the first one</Link></Empty> : (
        <table className="tbl tbl--click">
          <thead><tr><th>Affiliate</th><th>Code</th><th className="num hide-sm">Rate</th><th className="num hide-sm">Clicks</th><th className="num">Orders</th><th className="num hide-sm">Sales</th><th className="num">To pay</th><th className="num hide-sm">Paid</th><th>Status</th><th><span className="sr">Open</span></th></tr></thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id} onClick={() => nav(`/affiliates/${a.id}`)}>
                <td><Link to={`/affiliates/${a.id}`} className="cell-link" onClick={(e) => e.stopPropagation()}>{a.name}</Link><small className="sub">{a.email}</small></td>
                <td className="tnum">{a.code}</td>
                <td className="num tnum hide-sm">{Number(a.rate)}%{a.buyer_percent > 0 && <small className="sub">{a.buyer_percent}% off for buyers</small>}</td>
                <td className="num tnum hide-sm">{a.clicks}</td><td className="num tnum">{a.orders}</td><td className="num tnum hide-sm">{inr(a.revenue)}</td>
                <td className="num tnum">{inr(a.approved)}{a.pending > 0 && <small className="sub">{inr(a.pending)} pending</small>}</td>
                <td className="num tnum hide-sm">{inr(a.paid)}</td>
                <td><Status tone={a.status === 'active' ? 'ok' : 'mute'}>{a.status === 'active' ? 'Active' : 'Paused'}</Status></td>
                <td className="num"><Icon.Right size={16} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
