import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Empty, Failed, Icon, PageHead, Status, ok, useAsync } from '../lib/ui';

/** How a collection picks its products. Matches buildCollections() in the storefront: hand-picked links win over the rule columns. */
export const ruleOf = (c, n) => (n ? 'picked' : c.all_products ? 'all' : c.on_sale ? 'sale' : c.type_filter ? 'type' : 'picked');
const RULE = { picked: 'Hand-picked', all: 'Every product', sale: 'Products on sale', type: 'By category' };

export default function Collections() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [cols, links, products] = await Promise.all([
      supabase.from('collections').select('*').order('sort').then(ok),
      supabase.from('collection_products').select('collection_slug').then(ok),
      supabase.from('products').select('type,compare_at,is_active').then(ok),
    ]);
    return { cols, links, products };
  });
  if (error) return <Failed error={error} retry={reload} />;
  const count = (c) => {
    const n = data.links.filter((l) => l.collection_slug === c.slug).length;
    if (n) return n;
    const live = data.products.filter((p) => p.is_active);
    return c.all_products ? live.length : c.on_sale ? live.filter((p) => p.compare_at).length : c.type_filter ? live.filter((p) => p.type === c.type_filter).length : 0;
  };

  return (
    <>
      <PageHead title="Collections" sub="The groups customers browse. Categories are collections that list every product of a type.">
        <Link to="/collections/new" className="btn"><Icon.Plus size={14} />Add collection</Link>
      </PageHead>
      {loading || !data ? null : data.cols.length === 0 ? <Empty title="No collections yet" /> : (
        <table className="tbl tbl--click">
          <thead><tr><th>Collection</th><th>Products picked by</th><th className="num">Live products</th><th /></tr></thead>
          <tbody>
            {data.cols.map((c) => {
              const n = data.links.filter((l) => l.collection_slug === c.slug).length; const r = ruleOf(c, n); const total = count(c);
              return (
                <tr key={c.slug}>
                  <td><Link to={`/collections/${c.slug}`} className="cell-link">{c.title}</Link><small className="sub">/collections/{c.slug}</small></td>
                  <td>{RULE[r]}{r === 'type' && <small className="sub">{c.type_filter}</small>}</td>
                  <td className="num tnum">{total === 0 ? <Status tone="warn">Empty</Status> : total}</td>
                  <td className="num"><Link to={`/collections/${c.slug}`} aria-label={`Edit ${c.title}`}><Icon.Right size={16} /></Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
