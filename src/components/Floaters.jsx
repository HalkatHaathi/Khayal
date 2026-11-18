import { useEffect, useState } from 'react';
import { ArrowUp, WhatsApp } from './Icons';
import { useCatalog } from '../store';

export default function Floaters() {
  const [show, setShow] = useState(false);
  const wa = useCatalog().content.site.whatsapp.replace(/\D/g, '');
  useEffect(() => {
    const f = () => setShow(window.scrollY > window.innerHeight * 0.8);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  return (
    <>
      <button className={`totop ${show ? 'is-on' : ''}`} aria-label="Back to top" tabIndex={show ? 0 : -1}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={20} /></button>
      {wa && <a className="wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp"><WhatsApp /></a>}
    </>
  );
}
