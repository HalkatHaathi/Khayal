import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Empty, Failed, Icon, PageHead, Status, dateOnly, ok, useAsync } from '../lib/ui';

export const CORE = { about: '/about', contact: '/contact', shipping: '/policies/shipping', returns: '/policies/returns', privacy: '/policies/privacy', terms: '/policies/terms' };
export const pagePath = (slug) => CORE[slug] || `/pages/${slug}`;

export default function ContentPages() {
  const { data, error, loading, reload } = useAsync(() => supabase.from('pages').select('slug,title,published,updated_at,sort').order('sort').order('title').then(ok));
  if (error) return <Failed error={error} retry={reload} />;
  return (
    <>
      <PageHead title="Pages" sub="About, contact, policies and any page you add.">
        <Link to="/pages/new" className="btn"><Icon.Plus size={14} />Add page</Link>
      </PageHead>
      {loading || !data ? null : data.length === 0 ? <Empty title="No pages yet">Run supabase/migrations/0007_content.sql to add the starter pages.</Empty> : (
        <table className="tbl tbl--click">
          <thead><tr><th>Page</th><th className="hide-sm">Address</th><th>Status</th><th className="hide-sm">Edited</th></tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.slug}>
                <td><Link to={`/pages/${p.slug}`} className="cell-link">{p.title}</Link>{CORE[p.slug] && <small className="sub">Built-in page</small>}</td>
                <td className="hide-sm">{pagePath(p.slug)}</td>
                <td><Status tone={p.published ? 'ok' : 'mute'}>{p.published ? 'Live' : 'Draft'}</Status></td>
                <td className="hide-sm">{dateOnly(p.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
