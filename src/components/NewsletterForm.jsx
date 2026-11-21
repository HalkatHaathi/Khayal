import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function NewsletterForm({ kicker = 'Newsletter', title = 'Sign up', text = 'Subscribe to get special offers, free giveaways, and once-in-a-lifetime deals.' }) {
  const [v, setV] = useState({ name: '', email: '' });
  const [err, setErr] = useState('');
  const [state, setState] = useState('idle'); // idle | busy | done | fail

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(v.email)) return setErr('Enter a valid email address.');
    setErr('');
    if (!supabase) return setState('done'); // local dev without Supabase: nothing to save
    setState('busy');
    const body = { email: v.email.trim().toLowerCase(), name: v.name.trim() };
    // the `subscribe` function saves the address and sends the welcome email through Resend; if it is not deployed (or is down) sign-ups still work
    const viaFn = await supabase.functions.invoke('subscribe', { body });
    if (!viaFn.error) return setState('done');
    const { error } = await supabase.from('newsletter_subscribers').insert({ email: body.email, name: body.name || null });
    // 23505 = already subscribed: say the same thing as a new signup so emails can't be probed
    setState(!error || error.code === '23505' ? 'done' : 'fail');
  };

  if (state === 'done') {
    return (
      <div className="news__form" role="status">
        <p className="news__kicker">{kicker}</p>
        <h2>You're on the list</h2>
        <p className="news__lede">Thanks for joining. Special offers and new drops will reach you first.</p>
      </div>
    );
  }
  return (
    <form className="news__form" onSubmit={submit} noValidate>
      <p className="news__kicker">{kicker}</p>
      <h2>{title}</h2>
      <p className="news__lede">{text}</p>
      <label className="field"><span>Name</span><input name="name" autoComplete="name" placeholder=" " maxLength="100"
        value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" placeholder=" " maxLength="254"
        value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} aria-invalid={Boolean(err)} aria-describedby={err ? 'news-err' : undefined} />
        {err && <em id="news-err" className="field__err" role="alert">{err}</em>}</label>
      <button className="btn-block" type="submit" disabled={state === 'busy'}>{state === 'busy' ? 'Please wait…' : 'Join'}</button>
      {state === 'fail' && <p className="co__err" role="alert">We couldn't sign you up just now. Please try again.</p>}
      <p className="news__legal">By joining you agree to our <Link to="/policies/privacy">Privacy Policy</Link> and <Link to="/policies/terms">Terms of Service</Link>.</p>
    </form>
  );
}
