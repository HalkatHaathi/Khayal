import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Empty, Failed, Icon, PageHead, Status, dateOnly, inr, ok, useAsync } from '../lib/ui';

export const couponState = (c) => (!c.active ? ['mute', 'Off'] : c.expires_at && new Date(c.expires_at) < new Date() ? ['err', 'Expired'] : ['ok', 'Live']);

export default function Discounts() {
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(async () => {
    const [coupons, used] = await Promise.all([
      supabase.from('coupons').select('*').order('code').then(ok),
      supabase.from('orders').select('coupon_code').not('coupon_code', 'is', null).not('status', 'in', '(cancelled,failed)').limit(5000).then(ok),
    ]);
    const uses = {}; used.forEach((o) => { uses[o.coupon_code] = (uses[o.coupon_code] || 0) + 1; });
    return { coupons, uses };
  });
  if (error) return <Failed error={error} retry={reload} />;
  return (
    <>
      <PageHead title="Discounts" sub="Percentage codes customers enter in the cart. Prices and rules are always re-checked by the database at checkout.">
        <Link to="/discounts/new" className="btn"><Icon.Plus size={14} />Add code</Link>
      </PageHead>
      {loading || !data ? null : data.coupons.length === 0 ? <Empty title="No discount codes yet"><Link to="/discounts/new" className="btn">Create a code</Link></Empty> : (
        <table className="tbl tbl--click">
          <thead><tr><th>Code</th><th className="num">Off</th><th className="hide-sm">Minimum spend</th><th className="hide-sm">Ends</th><th className="num">Used</th><th>Status</th><th><span className="sr">Edit</span></th></tr></thead>
          <tbody>
            {data.coupons.map((c) => { const [tone, label] = couponState(c); return (
              <tr key={c.code} onClick={() => nav(`/discounts/${c.code}`)}>
                <td><Link to={`/discounts/${c.code}`} className="cell-link tnum" onClick={(e) => e.stopPropagation()}>{c.code}</Link>{c.first_order_only && <small className="sub">First orders only</small>}</td>
                <td className="num tnum">{c.percent}%</td><td className="hide-sm tnum">{c.min_subtotal ? inr(c.min_subtotal) : 'None'}</td>
                <td className="hide-sm">{c.expires_at ? dateOnly(c.expires_at) : 'No end date'}</td><td className="num tnum">{data.uses[c.code] || 0}</td><td><Status tone={tone}>{label}</Status></td><td className="num"><Icon.Right size={16} /></td>
              </tr>
            ); })}
          </tbody>
        </table>
      )}
    </>
  );
}
