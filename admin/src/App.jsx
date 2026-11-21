import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Icon } from './lib/ui';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Products from './pages/Products';
import ProductEdit from './pages/ProductEdit';
import Inventory from './pages/Inventory';
import Collections from './pages/Collections';
import CollectionEdit from './pages/CollectionEdit';
import Orders from './pages/Orders';
import Shipments from './pages/Shipments';
import OrderDetail from './pages/OrderDetail';
import Customers, { CustomerDetail } from './pages/Customers';
import Messages from './pages/Messages';
import Subscribers from './pages/Subscribers';
import Discounts from './pages/Discounts';
import DiscountEdit from './pages/DiscountEdit';
import Settings from './pages/Settings';
import HomeEditor from './pages/HomeEditor';
import Navigation from './pages/Navigation';
import ContentPages from './pages/ContentPages';
import PageEdit from './pages/PageEdit';
import Site from './pages/Site';
import Emails from './pages/Emails';

const NAV = [
  ['Sales', [['/', 'Overview', Icon.Overview, true], ['/orders', 'Orders', Icon.Bag], ['/shipments', 'Shipments', Icon.Truck], ['/customers', 'Customers', Icon.People]]],
  ['Catalogue', [['/products', 'Products', Icon.Box], ['/inventory', 'Inventory', Icon.Stock], ['/collections', 'Collections', Icon.Grid]]],
  ['Marketing', [['/discounts', 'Discounts', Icon.Tag], ['/messages', 'Messages', Icon.Mail], ['/emails', 'Emails', Icon.Doc], ['/subscribers', 'Subscribers', Icon.People]]],
  ['Storefront', [['/home', 'Home page', Icon.Home], ['/navigation', 'Navigation', Icon.Menu], ['/pages', 'Pages', Icon.Doc], ['/site', 'Site', Icon.Globe]]],
  ['Store', [['/settings', 'Settings', Icon.Cog]]],
];
function Shell() {
  const { user, signOut, preview } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="shell">
      <header className="mbar">
        <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon.Menu /></button>
        <span className="word">KHYAL</span>
        <span className="mbar__tag">Admin</span>
      </header>
      <div className={`scrim ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`side ${open ? 'is-open' : ''}`}>
        <div className="side__brand"><span className="word">KHYAL</span><span className="side__tag">Admin</span></div>
        <nav aria-label="Main">
          {NAV.map(([group, items]) => (
            <div key={group}>
              <p className="side__sub">{group}</p>
              {items.map(([to, label, Ico, end]) => <NavLink key={to} to={to} end={end} className="nav"><Ico />{label}</NavLink>)}
            </div>
          ))}
        </nav>
        <div className="side__foot">
          <a className="nav" href={import.meta.env.VITE_STORE_URL || 'http://localhost:5173'} target="_blank" rel="noreferrer"><Icon.External />View storefront</a>
          <p className="side__user" title={user?.email}>{user?.email}</p>
          <button className="nav" onClick={signOut}><Icon.Out />{preview ? 'Preview mode' : 'Sign out'}</button>
        </div>
      </aside>
      <main className="main" id="main">
        <div className="page" key={pathname.split('/')[1]}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductEdit />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/collections/:slug" element={<CollectionEdit />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/shipments" element={<Shipments />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:phone" element={<CustomerDetail />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/subscribers" element={<Subscribers />} />
            <Route path="/discounts" element={<Discounts />} />
            <Route path="/discounts/:code" element={<DiscountEdit />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/home" element={<HomeEditor />} />
            <Route path="/navigation" element={<Navigation />} />
            <Route path="/pages" element={<ContentPages />} />
            <Route path="/pages/:slug" element={<PageEdit />} />
            <Route path="/site" element={<Site />} />
            <Route path="/emails" element={<Emails />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const { ready, user, admin, enabled } = useAuth();
  if (!ready || (user && admin === null)) return <div className="boot" aria-busy="true"><span className="word">KHYAL</span></div>;
  if (!enabled || !user || admin !== true) return <Login />;
  return <Shell />;
}
