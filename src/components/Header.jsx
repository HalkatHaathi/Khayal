import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Search, User, Bag } from './Icons';
import { useAuth } from '../auth';
import { A } from '../content';
import { useCatalog } from '../store';

/** Wordmark at the top of the page; the stamp takes its place once the header folds on scroll. */
export const Logo = () => (
  <>
    <span className="logo__word">KHYAL</span>
    <img className="logo__img" src="/logo.webp" alt="" aria-hidden="true" width="46" height="46" />
  </>
);

export default function Header({ onMenu, onSearch, onCart, cartCount = 0, holding = false }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { content } = useCatalog();
  const ann = content.site.announcement;
  const showAnn = ann.on && ann.text;
  const [scrolled, setScrolled] = useState(false);
  const overHero = (pathname === '/' || pathname === '/holding-preview') && !scrolled && (holding || content.home.sections.find((s) => s.visible !== false)?.type === 'hero');

  useEffect(() => { document.documentElement.style.setProperty('--ann', showAnn ? '34px' : '0px'); }, [showAnn]);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 10);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);

  return (
    <header className={`hdr ${overHero ? 'hdr--hero' : ''} ${scrolled ? 'hdr--scrolled' : ''} ${holding ? 'hdr--holding' : ''}`}>
      {showAnn && <div className="ann">{ann.link ? <A to={ann.link}>{ann.text}</A> : <span>{ann.text}</span>}</div>}
      <div className="hdr__bar">
        <div className="hdr__side">
          {!holding && <button onClick={onMenu} aria-label="Open menu"><Menu /></button>}
          {!holding && <button onClick={onSearch} aria-label="Search"><Search /></button>}
        </div>
        <Link to="/" className="logo" aria-label="Khyal home"><Logo /></Link>
        <div className="hdr__side hdr__side--end">
          <Link to={user ? '/account' : '/account/login'} aria-label={user ? 'My account' : 'Sign in'}><User /></Link>
          {!holding && (
            <button onClick={onCart} aria-label={`Cart, ${cartCount} items`} className="hdr__bag">
              <Bag />
              {cartCount > 0 && <span className="hdr__count">{cartCount}</span>}
            </button>
          )}
        </div>
      </div>
      {!holding && (
        <nav className="hdr__nav" aria-label="Categories">
          {content.menus.nav.map((i) => <A key={i.to + i.label} to={i.to}>{i.label}</A>)}
        </nav>
      )}
    </header>
  );
}
