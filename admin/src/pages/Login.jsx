import { useState } from 'react';
import { useAuth } from '../auth';

export default function Login() {
  const { enabled, user, admin, signIn, signOut } = useAuth();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await signIn(f.email.trim(), f.password);
    if (error) setErr(error.message === 'Invalid login credentials' ? 'That email and password do not match.' : error.message);
    setBusy(false);
  };

  let body;
  if (!enabled) body = <Note title="Not connected">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to admin/.env.local, then restart.</Note>;
  else if (user && admin === 'setup') body = (
    <Note title="One setup step left" action={<button className="btn btn--line" onClick={signOut}>Sign out</button>}>
      The database has no admin access yet. Run <code>supabase/migrations/0004_admin.sql</code> in the Supabase SQL Editor, then reload.
    </Note>
  );
  else if (user && admin === false) body = (
    <Note title="This account is not an admin" action={<button className="btn btn--line" onClick={signOut}>Sign out</button>}>
      You are signed in as {user.email}. An existing admin must add this account to the <code>admins</code> table.
    </Note>
  );
  else body = (
    <form onSubmit={submit} noValidate>
      <label className="field"><span>Email</span><input type="email" autoComplete="username" placeholder=" " required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoFocus /></label>
      <label className="field"><span>Password</span><input type="password" autoComplete="current-password" placeholder=" " required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
      {err && <p className="form-err" role="alert">{err}</p>}
      <button className="btn btn--block" disabled={busy || !f.email || !f.password}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );

  return (
    <main className="login">
      <div className="login__art" aria-hidden="true"><img src="/logo.webp" alt="" /></div>
      <div className="login__pane">
        <div className="login__box">
          <h1 className="word word--lg">KHAYAL</h1>
          <p className="login__sub">Store admin</p>
          {body}
        </div>
      </div>
    </main>
  );
}

const Note = ({ title, children, action }) => (
  <div className="note" role="alert"><h2>{title}</h2><p>{children}</p>{action}</div>
);
