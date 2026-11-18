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
    <Note title="One setup step left" action={<button className="btn btn--line btn--sm" onClick={signOut}>Sign out</button>}>
      The database has no admin access yet. Run <code>supabase/migrations/0004_admin.sql</code> in the Supabase SQL Editor, then reload.
    </Note>
  );
  else if (user && admin === false) body = (
    <Note title="This account is not an admin" action={<button className="btn btn--line btn--sm" onClick={signOut}>Sign out</button>}>
      You are signed in as {user.email}. An existing admin must add this account to the <code>admins</code> table.
    </Note>
  );
  else body = (
    <form onSubmit={submit} noValidate>
      <label className="field field--auth"><span>Email</span><input type="email" autoComplete="username" placeholder=" " required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoFocus /></label>
      <label className="field field--auth"><span>Password</span><input type="password" autoComplete="current-password" placeholder=" " required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
      {err && <p className="auth__note auth__note--err" role="alert">{err}</p>}
      <div className="auth__row"><button className="btn btn--sm" disabled={busy || !f.email || !f.password}>{busy ? 'Signing in…' : 'Sign in'}</button></div>
    </form>
  );

  return (
    <div className="auth-shell">
      <header className="auth-bar"><span className="word word--lg">KHAYAL</span></header>
      <main className="auth">
        <h1>Admin login</h1>
        <p className="auth__sub">Store management. Staff accounts only.</p>
        {body}
        <a className="ul ul--sm auth__back" href={import.meta.env.VITE_STORE_URL || 'http://localhost:5173'}>Return to Store</a>
        <p className="auth__legal">Access is limited to approved staff. Every sign-in is checked against the admin list.</p>
      </main>
    </div>
  );
}

const Note = ({ title, children, action }) => (
  <div className="auth__note" role="alert"><strong>{title}</strong><br />{children}{action && <div className="auth__act">{action}</div>}</div>
);
