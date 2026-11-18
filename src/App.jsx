import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Floaters from './components/Floaters';
import { CartDrawer, MenuDrawer, SearchOverlay } from './components/Drawers';
import Home from './pages/Home';
import Stub from './pages/Stub';
import Collection from './pages/Collection';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Order from './pages/Order';
import Search from './pages/Search';
import Track from './pages/Track';
import Auth from './pages/Auth';
import Account from './pages/Account';
import Info, { CustomPage, policySlugs } from './pages/Info';
import CheckoutModal from './components/CheckoutModal';
import { useCart } from './cart';
import { useCatalog } from './store';

export default function App() {
  const [open, setOpen] = useState(null); // 'menu' | 'search' | 'cart' | null
  const { pathname } = useLocation();
  const [checkout, setCheckout] = useState(false);
  const close = () => setOpen(null);
  const goCheckout = () => { setOpen(null); setCheckout(true); };
  const { count } = useCart();
  const { status, retry, content } = useCatalog();
  const heroFirst = content.home.sections.find((s) => s.visible !== false)?.type === 'hero';
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => { // fade the first-paint loader (index.html) away once there is something to show, but never faster than 0.9s so the pulse is seen
    if (status === 'loading') return;
    const el = document.getElementById('boot');
    if (!el) return;
    const t = setTimeout(() => { el.classList.add('is-done'); setTimeout(() => el.remove(), 700); }, Math.max(0, 900 - performance.now()));
    return () => clearTimeout(t);
  }, [status]);

  return (
    <>
      <Header onMenu={() => setOpen('menu')} onSearch={() => setOpen('search')} onCart={() => setOpen('cart')} cartCount={count} />
      <div className={pathname === '/' && heroFirst ? '' : 'page-pad'}>
        {status === 'loading' && <main className="stub" aria-busy="true"><p>Loading…</p></main>}
        {status === 'error' && (
          <main className="stub" role="alert"><h1>We couldn't load the store</h1><p>Check your connection and try again.</p><button className="btn-line" onClick={retry}>Try again</button></main>
        )}
        {status === 'ready' && <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collections/:handle" element={<Collection />} />
          <Route path="/products/:slug" element={<Product onAdded={() => setOpen('cart')} onCheckout={goCheckout} />} />
          <Route path="/collections/:handle/products/:slug" element={<Product onAdded={() => setOpen('cart')} onCheckout={goCheckout} />} />
          <Route path="/cart" element={<Cart onCheckout={goCheckout} />} />
          <Route path="/order/:id" element={<Order />} />
          <Route path="/search" element={<Search />} />
          <Route path="/track" element={<Track />} />
          <Route path="/account" element={<Account />} />
          <Route path="/account/reset" element={<Auth mode="reset" />} />
          <Route path="/account/login" element={<Auth mode="login" />} />
          <Route path="/account/register" element={<Auth mode="register" />} />
          <Route path="/account/forgot" element={<Auth mode="forgot" />} />
          <Route path="/about" element={<Info page="about" />} />
          <Route path="/contact" element={<Info page="contact" />} />
          {policySlugs.map((k) => <Route key={k} path={`/policies/${k}`} element={<Info page={k} />} />)}
          <Route path="/pages/:slug" element={<CustomPage />} />
          <Route path="/blog" element={<Stub soon />} />
          <Route path="*" element={<Stub />} />
        </Routes>}
      </div>
      <Footer />
      <Floaters />
      <MenuDrawer open={open === 'menu'} onClose={close} />
      <SearchOverlay open={open === 'search'} onClose={close} />
      <CartDrawer open={open === 'cart'} onClose={close} onCheckout={goCheckout} />
      <CheckoutModal open={checkout} onClose={() => setCheckout(false)} />
    </>
  );
}
