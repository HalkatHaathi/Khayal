import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const MODES = {
  login: { title: 'Login', cta: 'Sign in', fields: ['email', 'password'] },
  register: { title: 'Create account', cta: 'Create', fields: ['first', 'last', 'email', 'password'] },
  forgot: { title: 'Reset your password', cta: 'Submit', fields: ['email'] },
  reset: { title: 'Choose a new password', cta: 'Save password', fields: ['password', 'confirm'] },
};
const FIELD = {
  first: { label: 'First name', auto: 'given-name' }, last: { label: 'Last name', auto: 'family-name' },
  email: { label: 'Email', type: 'email', auto: 'email' },
  password: { label: 'Password', type: 'password' },
  confirm: { label: 'Confirm password', type: 'password', auto: 'new-password' },
};
const RULES = {
  first: (v) => (v.trim() ? '' : 'Enter your first name.'),
  last: (v) => (v.trim() ? '' : 'Enter your last name.'),
  email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? '' : 'Enter a valid email address.'),
  password: (v, mode) => (mode === 'login' ? (v ? '' : 'Enter your password.') : v.length < 8 ? 'Use at least 8 characters.' : ''),
  confirm: (v, mode, vals) => (v === vals.password ? '' : 'The passwords do not match.'),
};
const SENT = {
  register: 'Check your email: we sent a link to confirm your account.',
  forgot: 'If an account exists for that email, a reset link is on its way.',
};

export default function Auth({ mode }) {
  const m = MODES[mode];
  const auth = useAuth();
  const nav = useNavigate();
  const { state } = useLocation();
  const [vals, setVals] = useState({});
  const [errs, setErrs] = useState({});
  const [note, setNote] = useState('');
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = `${m.title} – KHAYAL`; setVals({}); setErrs({}); setNote(''); setFail(''); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    const next = Object.fromEntries(m.fields.map((f) => [f, RULES[f](vals[f] || '', mode, vals)]).filter(([, v]) => v));
    setErrs(next); setNote(''); setFail('');
    if (Object.keys(next).length) return;
    if (!auth.enabled) { setNote("Accounts aren't connected yet. Your details were checked but not sent anywhere."); return; }

    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await auth.signIn(vals.email.trim(), vals.password);
        if (error) setFail('That email and password do not match.'); // same message for unknown email and wrong password
        else nav(state?.from || '/account', { replace: true });
      } else if (mode === 'register') {
        const { data, error } = await auth.signUp(vals.email.trim(), vals.password, `${vals.first.trim()} ${vals.last.trim()}`);
        if (error) setFail('We could not create your account. Try again in a moment.');
        else if (data.session) nav('/account', { replace: true });
        else setNote(SENT.register);
      } else if (mode === 'forgot') {
        await auth.forgot(vals.email.trim()); // same reply whether or not the email exists
        setNote(SENT.forgot);
      } else {
        const { error } = await auth.setPassword(vals.password);
        if (error) setFail('We could not save that password. Request a new reset link and try again.');
        else nav('/account', { replace: true });
      }
    } finally { setBusy(false); }
  };

  const expired = mode === 'reset' && auth.ready && !auth.user;

  return (
    <main className="auth">
      <h1>{m.title}</h1>
      <p className="auth__sub">
        {mode === 'login' && <>Don't have an account? <Link to="/account/register" className="ul">Sign up here</Link>.</>}
        {mode === 'register' && <>Already have an account? <Link to="/account/login" className="ul">Sign in</Link>.</>}
        {mode === 'forgot' && 'We will send you an email to reset your password.'}
      </p>
      {expired ? (
        <p className="auth__note" role="alert">This reset link has expired. <Link to="/account/forgot" className="ul">Request a new one</Link>.</p>
      ) : (
        <form onSubmit={submit} noValidate>
          {m.fields.map((f) => (
            <label key={f} className="field field--auth">
              <input name={f} type={FIELD[f].type || 'text'} placeholder=" "
                autoComplete={FIELD[f].auto || (mode === 'login' ? 'current-password' : 'new-password')}
                value={vals[f] || ''} onChange={(e) => setVals({ ...vals, [f]: e.target.value })}
                aria-invalid={Boolean(errs[f])} aria-describedby={errs[f] ? `${f}-err` : undefined} />
              <span>{FIELD[f].label}</span>
              {errs[f] && <em id={`${f}-err`} className="field__err" role="alert">{errs[f]}</em>}
            </label>
          ))}
          <div className="auth__row">
            <button className="btn-dark" type="submit" disabled={busy}>{busy ? 'Please wait…' : m.cta}</button>
            {mode === 'login' && <Link to="/account/forgot" className="ul ul--sm">Forgot your password?</Link>}
          </div>
          {fail && <p className="auth__note auth__note--err" role="alert">{fail}</p>}
          {note && <p className="auth__note" role="status">{note}</p>}
          <Link to="/" className="ul ul--sm auth__back">Return to Store</Link>
          <p className="auth__legal">By continuing you agree to our <Link to="/policies/privacy" className="ul">Privacy Policy</Link> and <Link to="/policies/terms" className="ul">Terms of Service</Link>.</p>
        </form>
      )}
    </main>
  );
}
