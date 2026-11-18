import { Minus, Plus } from './Icons';
import { inr } from '../data';
import { useCart } from '../cart';

export const FREE_SHIP = 15000;

export function ShipBar() {
  const { subtotal, freeShipMin } = useCart();
  const FREE = freeShipMin ?? FREE_SHIP; // server value once priced; this default only covers the first moments
  const left = Math.max(0, FREE - subtotal);
  return (
    <div className="ship">
      <p>{left ? <>You are {inr(left).replace('.00', '')} away from free shipping.</> : 'You have unlocked free shipping.'}</p>
      <div className="ship__bar" role="progressbar" aria-valuemin={0} aria-valuemax={FREE} aria-valuenow={Math.min(subtotal, FREE)} aria-label="Progress to free shipping">
        <i style={{ width: `${Math.min(100, (subtotal / FREE) * 100)}%` }} />
      </div>
    </div>
  );
}

export function GiftRow() {
  const { gift, setGift } = useCart();
  return (
    <div className="gift">
      <button onClick={() => setGift({ ...gift, on: !gift.on })} aria-expanded={gift.on}>
        <span>Is this a gift?</span>{gift.on ? <Minus size={14} /> : <Plus size={14} />}
      </button>
      {gift.on && (
        <label>
          <span className="sr-only">Gift message</span>
          <textarea rows="3" maxLength="200" placeholder="Add a gift message (optional)" value={gift.note}
            onChange={(e) => setGift({ ...gift, note: e.target.value })} />
        </label>
      )}
    </div>
  );
}

