import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Empty, Failed, PageHead, Status, ok, useAsync, useToast, when } from '../lib/ui';

export default function Messages() {
  const toast = useToast();
  const [open, setOpen] = useState('');
  const [rows, setRows] = useState([]);
  const { error, loading, reload } = useAsync(async () => { setRows(await supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(300).then(ok)); return 1; });

  const patch = async (m, handled) => {
    setRows((r) => r.map((x) => (x.id === m.id ? { ...x, handled } : x)));
    const { error: e } = await supabase.from('contact_messages').update({ handled }).eq('id', m.id);
    if (e) { toast(e.message, 'err'); reload(); }
  };
  const del = async (m) => {
    if (!window.confirm(`Delete the message from ${m.name}? This cannot be undone.`)) return;
    const { error: e } = await supabase.from('contact_messages').delete().eq('id', m.id);
    if (e) return toast(e.message, 'err');
    setRows((r) => r.filter((x) => x.id !== m.id)); toast('Message deleted');
  };

  if (error) return <Failed error={error} retry={reload} />;
  const todo = rows.filter((m) => !m.handled).length;
  return (
    <>
      <PageHead title="Messages" sub={loading ? ' ' : `${todo} to reply to · ${rows.length} total`} />
      {!loading && rows.length === 0 ? <Empty title="No messages yet">Messages from the contact form land here.</Empty> : (
        <ul className="rows">
          {rows.map((m) => (
            <li key={m.id} className={`msg ${m.handled ? 'is-dim' : ''}`}>
              <button className="msg__head" onClick={() => setOpen(open === m.id ? '' : m.id)} aria-expanded={open === m.id}>
                <span className="row__main">{m.name}<small>{m.message.slice(0, 90)}{m.message.length > 90 ? '…' : ''}</small></span>
                <Status tone={m.handled ? 'mute' : 'warn'}>{m.handled ? 'Handled' : 'New'}</Status>
                <span className="msg__when">{when(m.created_at)}</span>
              </button>
              {open === m.id && (
                <div className="msg__body">
                  <p>{m.message}</p>
                  <div className="line">
                    <a className="btn" href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message to Khayal')}`} onClick={() => !m.handled && patch(m, true)}>Reply by email</a>
                    <button className="btn btn--line" onClick={() => patch(m, !m.handled)}>{m.handled ? 'Mark as new' : 'Mark handled'}</button>
                    <button className="btn btn--ghost" onClick={() => del(m)}>Delete</button>
                  </div>
                  <small className="sub">{m.email}</small>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
