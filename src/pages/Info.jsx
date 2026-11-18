import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCatalog } from '../store';
import Stub from './Stub';

// shortcut: placeholder copy. Replace with the brand's real story and legally reviewed policies before launch.
const PAGES = {
  about: {
    title: 'About Khyal',
    body: [
      ['Rooted in Stories', 'Khyal is a streetwear label built on craft, culture and contemporary expression, stitched together with purpose. Every piece starts with a story and an artisan who can tell it in cloth.'],
      ['Made by hand', 'Block printing, hand embroidery and screen printing are done in small batches by the people who know the work best. That is why some pieces sell out and are never restocked.'],
    ],
  },
  shipping: {
    title: 'Shipping policy',
    body: [
      ['Delivery times', 'Orders ship within 3–5 working days and reach most addresses in India in 4–7 days.'],
      ['Shipping charges', 'Shipping is free on orders of Rs. 15,000 and above. Charges for smaller orders are shown at checkout.'],
    ],
  },
  returns: {
    title: 'Returns & Exchange',
    body: [
      ['Exchanges', 'Unworn pieces with tags can be exchanged within 7 days of delivery, subject to stock.'],
      ['Final sale', 'Limited-edition and sale pieces cannot be returned or exchanged.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    body: [
      ['What we collect', 'Details you give us when you order, sign up or contact us: name, email, phone number and delivery address.'],
      ['How we use it', 'To fulfil orders, answer questions and, if you opt in, send updates. We do not sell your data.'],
    ],
  },
  terms: {
    title: 'Terms of Service',
    body: [
      ['Using this site', 'By using this site and placing an order you agree to these terms and to our shipping and returns policies.'],
      ['Pricing', 'Prices are in Indian rupees and may change without notice. An order is confirmed once payment succeeds.'],
    ],
  },
};
export const policySlugs = ['shipping', 'returns', 'privacy', 'terms'];

function Contact({ to }) {
  const [v, setV] = useState({ name: '', email: '', message: '' });
  const [err, setErr] = useState({});
  const [state, setState] = useState('idle'); // idle | busy | done | fail
  const submit = async (e) => {
    e.preventDefault();
    const n = {};
    if (!v.name.trim()) n.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(v.email)) n.email = 'Enter a valid email address.';
    if (!v.message.trim()) n.message = 'Write a message.';
    setErr(n);
    if (Object.keys(n).length) return;
    if (!supabase) {
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(`Message from ${v.name}`)}&body=${encodeURIComponent(`${v.message}\n\n${v.name} (${v.email})`)}`;
      return;
    }
    setState('busy');
    const { error } = await supabase.from('contact_messages').insert({ name: v.name.trim(), email: v.email.trim(), message: v.message.trim() });
    setState(error ? 'fail' : 'done');
  };
  const F = (k, label, props = {}) => (
    <label className="field field--auth">
      {props.rows ? <textarea rows="4" placeholder=" " value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-invalid={Boolean(err[k])} />
        : <input type={props.type} placeholder=" " value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-invalid={Boolean(err[k])} autoComplete={props.auto} />}
      <span>{label}</span>
      {err[k] && <em className="field__err" role="alert">{err[k]}</em>}
    </label>
  );
  if (state === 'done') return <p className="auth__note" role="status">Thanks, your message is on its way. We will reply within two working days.</p>;
  return (
    <form onSubmit={submit} noValidate className="info__form">
      {F('name', 'Name', { auto: 'name' })}{F('email', 'Email', { type: 'email', auto: 'email' })}{F('message', 'Message', { rows: 4 })}
      <button className="btn-dark" type="submit" disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Send'}</button>
      {state === 'fail' && <p className="auth__note auth__note--err" role="alert">We couldn't send that. Please try again.</p>}
    </form>
  );
}

/** Text from the admin (public.pages) wins; the copy above is the fallback before migration 0007 or when a page is missing. */
export default function Info({ page }) {
  const { pages, content } = useCatalog();
  const db = pages[page];
  const fb = page === 'contact' ? { title: 'Contact us', body: [['We read every message', 'Questions about an order, a fit or a collaboration: write to us and we will reply within two working days.']] } : PAGES[page];
  const c = db ? { title: db.title, body: db.body.map((x) => [x.h, x.t]) } : fb;
  const title = c?.title;
  useEffect(() => { if (title) document.title = `${title} – KHYAL`; }, [title]);
  if (!c) return <Stub />;
  return (
    <main className="info">
      <h1>{c.title}</h1>
      {c.body.map(([h, t], i) => <section key={i}>{h && <h2>{h}</h2>}<p className="info__text">{t}</p></section>)}
      {page === 'contact' && <Contact to={content.site.email} />}
      <Link to="/" className="ul ul--sm">Return to Store</Link>
    </main>
  );
}

export const CustomPage = () => <Info page={useParams().slug} />;
