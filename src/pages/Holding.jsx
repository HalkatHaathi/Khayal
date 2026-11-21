import { useEffect, useState } from 'react';
import { A } from '../content';
import { useCatalog } from '../store';
import { useSignup } from '../components/NewsletterForm';
import { Facebook, Instagram, XIcon } from '../components/Icons';
import { remaining } from '../holding';

const pad = (n) => String(n).padStart(2, '0');

function Countdown({ date }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const r = remaining(date, now);
  if (!r) return <p className="hold__soon">Launching very soon</p>;
  return (
    <dl className="hold__count" aria-label="Time until launch">
      {[['Days', r.d], ['Hours', pad(r.h)], ['Minutes', pad(r.m)], ['Seconds', pad(r.s)]].map(([l, v]) => <div key={l}><dd className="tnum">{v}</dd><dt>{l}</dt></div>)}
    </dl>
  );
}

/** The "coming soon" page shown while the holding switch is on in the admin. The waitlist is the newsletter list: same sign-up, same welcome email. */
export default function Holding() {
  const { content } = useCatalog();
  const h = content.site.holding, { social } = content.site;
  const { err, state, submit } = useSignup();
  const [email, setEmail] = useState('');
  useEffect(() => { document.title = 'KHYAL'; }, []);

  return (
    <main className="hold">
      <div className={`hold__bg ${h.image ? 'has-img' : ''}`}>{h.image && <img className="bg-img" src={h.image} alt="" />}</div>
      <div className="hold__copy">
        <h1>{h.title}</h1>
        {h.text && <p className="hold__text">{h.text}</p>}
        {h.countdown && h.date && <Countdown date={h.date} />}
        {h.waitlist && (state === 'done' ? (
          <p className="hold__done" role="status">You're on the list. We'll email you the moment we launch.</p>
        ) : (
          <form className="hold__form" onSubmit={(e) => { e.preventDefault(); submit({ email }); }} noValidate>
            <label className="hold__field"><span className="sr-only">Email address</span>
              <input type="email" autoComplete="email" placeholder="Your email" maxLength="254" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(err)} aria-describedby={err ? 'hold-err' : undefined} /></label>
            <button type="submit" disabled={state === 'busy'}>{state === 'busy' ? 'Please wait…' : h.button || 'Join the waitlist'}</button>
            {(err || state === 'fail') && <p id="hold-err" className="hold__err" role="alert">{err || "We couldn't sign you up just now. Please try again."}</p>}
          </form>
        ))}
        <div className="hold__social">
          {social.instagram && <A to={social.instagram} aria-label="Instagram"><Instagram size={20} /></A>}
          {social.facebook && <A to={social.facebook} aria-label="Facebook"><Facebook size={20} /></A>}
          {social.x && <A to={social.x} aria-label="X"><XIcon size={18} /></A>}
        </div>
      </div>
    </main>
  );
}
