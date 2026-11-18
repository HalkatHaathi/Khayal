import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Media from '../components/Media';
import { GiftRow, ShipBar } from '../components/CartParts';
import { Lock, Minus, Plus } from '../components/Icons';
import { inr } from '../data';
import { useCart } from '../cart';

export default function Cart({ onCheckout }) {
  const { items, count, subtotal, setQty, remove, ready, quoting } = useCart();
  useEffect(() => { document.title = 'Your Shopping Cart – KHAYAL'; }, []);

  return (
    <main className="cartpg">
      <div className="cartpg__in">
        <section className="cartpg__list" aria-labelledby="cart-h">
          <div className="cartpg__head">
            <h1 id="cart-h">CART&nbsp;&nbsp;({count})</h1>
            <Link to="/collections/new-arrivals" className="btn-line btn-line--sm">Continue shopping</Link>
          </div>
          {items.length === 0 ? (
            <div className="cartpg__empty">
              <p>Your Cart is Empty</p>
              <Link to="/collections/new-arrivals" className="btn-line">Shop</Link>
            </div>
          ) : (
            <ul>
              {items.map((it) => (
                <li key={it.key} className="crow">
                  <Link to={`/products/${it.slug}`} className="crow__img"><Media tone={it.tone} kind={it.kind} src={it.img} alt={it.name} /></Link>
                  <div className="crow__info">
                    <Link to={`/products/${it.slug}`}>{it.name}</Link>
                    <dl>{it.opts.map(([k, v]) => <div key={k}><dt>{k}:</dt><dd>{v}</dd></div>)}</dl>
                    {it.issue && <p className="cart-item__issue" role="alert">{it.issue}</p>}
                  </div>
                  <p className="crow__price">{inr(it.price)}</p>
                  <div className="crow__qty">
                    <div className="qty qty--sm qty--inline">
                      <button onClick={() => setQty(it.key, it.qty - 1)} aria-label={`Decrease quantity of ${it.name}`}><Minus size={14} /></button>
                      <span>{it.qty}</span>
                      <button onClick={() => setQty(it.key, it.qty + 1)} aria-label={`Increase quantity of ${it.name}`} disabled={it.qty >= it.max}><Plus size={14} /></button>
                    </div>
                    <button className="cart-item__rm" onClick={() => remove(it.key)}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {items.length > 0 && (
          <aside className="cartpg__sum">
            <ShipBar />
            <p className="cart-foot__sub"><span>Subtotal</span><b aria-busy={quoting}>{inr(subtotal)}</b></p>
            <GiftRow />
            <p className="coupon-note">Use coupon code <b>KHAYAL10</b> for 10% off your first order.</p>
            <button className="btn-block btn-block--lock" disabled={!ready} onClick={onCheckout}><Lock size={14} /> Check out</button>
            <p className="cart-foot__note cart-foot__note--left">Prices include GST. Shipping and discount codes are shown at checkout</p>
          </aside>
        )}
      </div>
    </main>
  );
}
