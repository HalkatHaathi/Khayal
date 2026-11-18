import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Empty, Failed, Icon, PageHead, dateOnly, ok, useAsync, useToast } from '../lib/ui';

export default function Subscribers() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const { error, loading, reload } = useAsync(async () => { setRows(await supabase.from('newsletter_subscribers').select('*').order('created_at', { ascending: false }).limit(5000).then(ok)); return 1; });

  const csv = () => {
    const esc = (v) => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; }; // neutralise spreadsheet formulas
    const body = ['email,name,subscribed', ...rows.map((r) => [r.email, r.name, r.created_at].map(esc).join(','))].join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([body], { type: 'text/csv' })), download: `subscribers-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };
  const del = async (r) => {
    if (!window.confirm(`Remove ${r.email} from the list?`)) return;
    const { error: e } = await supabase.from('newsletter_subscribers').delete().eq('email', r.email);
    if (e) return toast(e.message, 'err');
    setRows((x) => x.filter((y) => y.email !== r.email)); toast('Removed');
  };

  if (error) return <Failed error={error} retry={reload} />;
  const shown = rows.filter((r) => !q || `${r.email} ${r.name || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHead title="Subscribers" sub={loading ? ' ' : `${rows.length} on the newsletter list`}>
        <button className="btn btn--line" onClick={csv} disabled={!rows.length}><Icon.Upload size={14} style={{ transform: 'rotate(180deg)' }} />Export CSV</button>
      </PageHead>
      <div className="bar"><label className="search"><Icon.Search size={16} /><input type="search" placeholder="Search by email or name" aria-label="Search subscribers" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
      {!loading && shown.length === 0 ? <Empty title={rows.length ? 'No one matches' : 'No subscribers yet'} /> : (
        <table className="tbl">
          <thead><tr><th>Email</th><th className="hide-sm">Name</th><th>Joined</th><th /></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.email}><td>{r.email}</td><td className="hide-sm">{r.name || '—'}</td><td>{dateOnly(r.created_at)}</td>
                <td className="num"><button className="icon-btn" onClick={() => del(r)} aria-label={`Remove ${r.email}`}><Icon.Trash size={16} /></button></td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
