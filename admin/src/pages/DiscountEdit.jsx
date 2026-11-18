import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Failed, Icon, PageHead, Switch, ok, useAsync, useToast } from '../lib/ui';

const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '');

export default function DiscountEdit() {
  const { code } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    if (code === 'new') return null;
    const c = await supabase.from('coupons').select('*').eq('code', code).maybeSingle().then(ok);
    if (!c) throw new Error('That code does not exist.');
    return c;
  }, [code]);
  if (error) return <Failed error={error} retry={reload} />;
  if (loading) return <PageHead title="Discount" />;
  return <Editor key={code} c={data} />;
}

function Editor({ c }) {
  const nav = useNavigate();
  const toast = useToast();
  const isNew = !c;
  const [f, setF] = useState({ code: c?.code || '', percent: String(c?.percent ?? 10), min: String(c?.min_subtotal ?? 0), first: c?.first_order_only || false, active: c?.active ?? true, ends: toLocal(c?.expires_at) });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async () => {
    const percent = Number(f.percent), min = Number(f.min);
    if (!/^[A-Z0-9_-]{3,20}$/.test(f.code)) return setErr('The code needs 3 to 20 capital letters, numbers, hyphens or underscores.');
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) return setErr('Percent off must be a whole number from 1 to 100.');
    if (!Number.isInteger(min) || min < 0) return setErr('Minimum spend must be whole rupees, 0 or more.');
    setErr(''); setBusy(true);
    const row = { percent, min_subtotal: min, first_order_only: f.first, active: f.active, expires_at: f.ends ? new Date(f.ends).toISOString() : null };
    // existing codes are UPDATEd (not upserted); .select() lets us notice when the database changed nothing
    const q = isNew ? supabase.from('coupons').insert({ code: f.code, ...row }) : supabase.from('coupons').update(row).eq('code', c.code);
    const { data: saved, error: e } = await q.select();
    if (e || !saved?.length) { setBusy(false); return setErr(e ? (e.code === '23505' ? 'That code already exists.' : e.message) : 'Nothing was saved. Sign in again and check this account is in the admins table.'); }
    toast('Discount saved'); nav('/discounts');
  };
  const remove = async () => {
    setBusy(true);
    const { error: e } = await supabase.from('coupons').delete().eq('code', c.code);
    if (e) { setBusy(false); setConfirmDel(false); return setErr(e.code === '23503' ? 'This code has been used on orders, so it cannot be deleted. Switch it off instead.' : e.message); }
    toast('Discount deleted'); nav('/discounts');
  };

  return (
    <>
      <Link to="/discounts" className="back"><Icon.Back size={14} />Discounts</Link>
      <PageHead title={isNew ? 'New discount code' : c.code} />
      <div className="edit edit--one">
        <div className="edit__main">
          <section className="grp">
            <h2>Code</h2>
            <label className="lbl">Code<input value={f.code} disabled={!isNew} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="WELCOME10" /><small>{isNew ? 'Customers type this at checkout.' : 'Fixed once created, because past orders refer to it.'}</small></label>
            <div className="two">
              <label className="lbl">Percent off<input inputMode="numeric" value={f.percent} onChange={set('percent')} /></label>
              <label className="lbl">Minimum spend (Rs.)<input inputMode="numeric" value={f.min} onChange={set('min')} /><small>0 means no minimum. Measured before shipping.</small></label>
            </div>
            <label className="lbl">Ends<input type="datetime-local" value={f.ends} onChange={set('ends')} /><small>Leave empty to keep it running.</small></label>
            <label className="chk"><input type="checkbox" checked={f.first} onChange={set('first')} />First order only</label>
            <div className="line line--gap"><span>{f.active ? 'On: customers can use it' : 'Off: the code is refused'}</span><Switch on={f.active} onChange={(v) => setF({ ...f, active: v })} label="Code is on" /></div>
          </section>
          {!isNew && (
            <section className="grp danger"><h2>Delete</h2>
              <p className="hint">Only possible while no order has used it.</p>
              {confirmDel ? <div className="line"><button className="btn btn--danger" onClick={remove} disabled={busy}>Delete for good</button><button className="btn btn--ghost" onClick={() => setConfirmDel(false)}>Keep it</button></div>
                : <button className="btn btn--line" onClick={() => setConfirmDel(true)}><Icon.Trash size={14} />Delete code</button>}
            </section>
          )}
        </div>
      </div>
      <div className="savebar is-dirty" role="region" aria-label="Save">
        <span className={err ? 'err' : ''} role={err ? 'alert' : undefined}>{err || ' '}</span>
        <div><Link to="/discounts" className="btn btn--ghost">Cancel</Link><button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save discount'}</button></div>
      </div>
    </>
  );
}
