import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Carousel from '../components/Carousel';
import Media from '../components/Media';
import ProductCard from '../components/ProductCard';
import { ArrowLeft, ArrowRight, Close, Minus, Plus } from '../components/Icons';
import { Panel } from '../components/Drawers';
import { SIZES } from '../catalog';
import { useCatalog } from '../store';
import { inr } from '../data';
import { useCart } from '../cart';

const WAIST = ['28', '30', '32', '34', '36'];
const PANTS_ADD = 4500; // shortcut: flat add-on for the "with pants" set; move to per-product variant pricing with the backend.
const COPY = {
  'Kurtas': 'A celebration of timeless Indian craftsmanship, cut long with a relaxed drape and finished by hand. Made in small batches so every piece carries its own character.',
  'Jackets': 'A statement layer built around surface work: structured shoulders, a relaxed body and details that reward a closer look. Made in small batches.',
  'Sweatshirts & Hoodies': 'Heavyweight, brushed on the inside and finished with surface work that sets it apart. An oversized, easy fit made for layering.',
  'Shirts': 'A relaxed shirt with a printed surface and a boxy, easy fit. Soft on the skin and built to be worn open or buttoned.',
  'T-shirts': 'A heavyweight, boxy tee with an artwork print placed by hand. Cut oversized for an easy drop at the shoulder.',
  'Pants': 'A wide, easy trouser with a high waist and a clean line from hip to hem.',
};
// shortcut: placeholder garment measurements (inches). Replace with the real chart; per-product charts would need a column in the database.
const CHART = [['S', 38, 28], ['M', 40, 29], ['L', 42, 30], ['XL', 44, 31], ['XXL', 46, 32]];
const PANTS_CHART = [['28', 28, 40], ['30', 30, 40.5], ['32', 32, 41], ['34', 34, 41.5], ['36', 36, 42]];

/** True on phones: the size guide rises from the bottom there, and slides in from the right on larger screens. */
function useNarrow() {
  const q = '(max-width: 820px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  return m;
}

function SizeGuide({ open, onClose, side, pants, size }) {
  const [unit, setUnit] = useState('in');
  const rows = pants ? PANTS_CHART : CHART;
  const heads = pants ? ['Waist', 'Length'] : ['Chest', 'Length'];
  const fmt = (n) => (unit === 'in' ? n : Math.round(n * 2.54));
  return (
    <Panel open={open} onClose={onClose} side={side} label="Size guide" className="guide">
      <div className="panel__top">
        <span className="panel__title panel__title--left">Size guide</span>
        <button className="panel__close" onClick={onClose} aria-label="Close size guide"><Close size={20} /></button>
      </div>
      <div className="guide__body">
        <div className="guide__unit" role="radiogroup" aria-label="Units">
          {[['in', 'Inches'], ['cm', 'Centimetres']].map(([k, l]) => <button key={k} role="radio" aria-checked={unit === k} className={unit === k ? 'is-on' : ''} onClick={() => setUnit(k)}>{l}</button>)}
        </div>
        <table>
          <thead><tr><th scope="col">Size</th><th scope="col">{heads[0]}</th><th scope="col">{heads[1]}</th></tr></thead>
          <tbody>{rows.map(([s, a, b]) => <tr key={s} className={s === size ? 'is-on' : ''}><th scope="row">{s}{s === size && <em>Your size</em>}</th><td className="tnum">{fmt(a)}</td><td className="tnum">{fmt(b)}</td></tr>)}</tbody>
        </table>
        <h3>How to measure</h3>
        <ul>
          <li><b>{heads[0]}.</b> {pants ? 'Across the top of the waistband, laid flat, doubled.' : 'Across the garment from armpit to armpit, laid flat, doubled.'}</li>
          <li><b>Length.</b> {pants ? 'From the top of the waistband to the hem.' : 'From the highest point of the shoulder down to the hem.'}</li>
          <li>Numbers are of the garment, not the body. Between two sizes, take the larger for a relaxed fit.</li>
        </ul>
      </div>
    </Panel>
  );
}

function Gallery({ p }) {
  const ref = useRef(null);
  const [i, setI] = useState(0);
  const slides = Array.from({ length: p.gallery?.length || 6 }, (_, k) => ({ src: p.gallery?.[k], tone: k % 2 ? p.alt : p.tone }));
  const step = () => ref.current.firstElementChild.getBoundingClientRect().width;
  const go = (d) => ref.current.scrollBy({ left: d * step(), behavior: 'smooth' });
  useEffect(() => {
    const el = ref.current;
    const f = () => setI(Math.round(el.scrollLeft / step()));
    el.addEventListener('scroll', f, { passive: true });
    return () => el.removeEventListener('scroll', f);
  }, []);
  return (
    <div className={`pdp__gallery pdp__gallery--${p.layout || 'feature'}`} role="region" aria-roledescription="carousel" aria-label={`${p.name} photos`}>
      <div className={`pdp__track pdp__track--${p.layout || 'feature'}`} ref={ref}>
        {slides.map((s, k) => (
          <div key={k} className="pdp__slide"><Media src={s.src} tone={s.tone} kind={p.kind} alt={`${p.name}, view ${k + 1}`} /></div>
        ))}
      </div>
      <div className="pdp__nav">
        <button onClick={() => go(-1)} aria-label="Previous photo"><ArrowLeft size={16} /></button>
        <button onClick={() => go(1)} aria-label="Next photo"><ArrowRight size={16} /></button>
        <span aria-live="polite">{i + 1} / {slides.length}</span>
      </div>
    </div>
  );
}

/** Defined at module level on purpose: inside the page it would remount on every state change and snap open sections shut. */
const Acc = ({ title, children }) => (
  <details><summary>{title}<Plus size={16} className="acc__i acc__i--plus" /><Minus size={16} className="acc__i acc__i--minus" /></summary>{children}</details>
);

function SizeRow({ label, hint, values, value, onPick, disabled = () => false, onGuide }) {
  return (
    <div className="opt">
      <p className="opt__head">{label}: <b>{value}</b> {hint && <em>{hint}</em>}</p>
      <div className="opt__grid" role="radiogroup" aria-label={label}>
        {values.map((v) => (
          <button key={v} role="radio" aria-checked={value === v} disabled={disabled(v)} className={`opt__btn ${value === v ? 'is-on' : ''}`} onClick={() => onPick(v)}>{v}</button>
        ))}
      </div>
      {onGuide && <button className="link buy__guide" onClick={onGuide}>Size guide</button>}
    </div>
  );
}

export default function Product({ onAdded, onCheckout }) {
  const { slug } = useParams();
  const cart = useCart();
  const { catalog } = useCatalog();
  const p = catalog.find((x) => x.slug === slug);
  const isKurta = p?.type === 'Kurtas';
  const isPants = p?.type === 'Pants';
  const sizes = isPants ? WAIST : SIZES;
  const has = (s) => p.sizes.includes(s);

  const [set, setSet] = useState('Without Pants');
  const [size, setSize] = useState(null);
  const [pants, setPants] = useState('28');
  const [qty, setQty] = useState(1);
  const [more, setMore] = useState(false);
  const [guide, setGuide] = useState(false);
  const narrow = useNarrow();
  const left = p ? (size ? (p.stock[size] ?? 0) : p.left) : 0; // stock is per size
  useEffect(() => { if (qty > left) setQty(Math.max(1, left)); }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!p) return;
    setSize(sizes.find(has) || null); setSet('Without Pants'); setPants('28'); setQty(1); setMore(false); setGuide(false);
    document.title = `${p.name} – KHYAL`;
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) {
    return (
      <main className="empty"><p>Product not found</p><Link to="/collections/new-arrivals" className="btn-line">Continue shopping</Link></main>
    );
  }

  const withPants = isKurta && set === 'With Pants';
  const price = p.price + (withPants ? (p.pantsAddon ?? PANTS_ADD) : 0);
  const canBuy = p.inStock && size;
  const related = catalog.filter((x) => x.type === p.type && x.slug !== p.slug);
  const relatedList = (related.length >= 4 ? related : [...related, ...catalog.filter((x) => x.type !== p.type && x.slug !== p.slug)]).slice(0, 8);

  const item = () => ({
    key: [p.slug, set, size, withPants && pants].join('|'), slug: p.slug, name: p.name, price, tone: p.tone, kind: p.kind, img: p.img,
    qty, max: left,
    opts: [...(isKurta ? [['Set', set]] : []), [isKurta ? 'Kurta Size' : isPants ? 'Waist' : 'Size', size], ...(withPants ? [['Pants Size', pants]] : [])],
  });
  const add = () => { cart.add(item()); onAdded(); };
  const buyNow = () => { cart.add(item()); onCheckout(); };

  const off = p.was ? Math.round((1 - p.price / p.was) * 100) : 0;
  const addon = withPants ? (p.pantsAddon ?? PANTS_ADD) : 0;

  return (
    <main className="pdp">
      <div className="pdp__top">
        <Gallery key={p.slug} p={p} />
        <section className="buy" aria-labelledby="buy-title">
          {off > 0 && <span className="buy__badge">−{off}%</span>}
          <h1 id="buy-title">{p.name}</h1>
          <p className="buy__price"><span className={p.was ? 'is-sale' : ''}>{p.from ? 'From ' : ''}{inr(price)}</span>{p.was && <s>{inr(p.was + addon)}</s>}</p>
          <p className="buy__craft">{p.craft.split('+')[0].trim() || 'Made in small batches'}</p>

          {isKurta && (
            <div className="opt">
              <p className="opt__head">Set: <b>{set}</b></p>
              <div className="opt__grid opt__grid--2" role="radiogroup" aria-label="Set">
                {['Without Pants', 'With Pants'].map((s) => (
                  <button key={s} role="radio" aria-checked={set === s} className={`opt__btn ${set === s ? 'is-on' : ''}`} onClick={() => setSet(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          <SizeRow label={isKurta ? 'Kurta Size' : isPants ? 'Waist' : 'Size'} hint="Regular fit" values={sizes} value={size}
            onPick={setSize} disabled={(s) => !p.inStock || !has(s)} onGuide={() => setGuide(true)} />
          {withPants && <SizeRow label="Pants Size" hint="Regular fit" values={WAIST} value={pants} onPick={setPants} />}

          <p className={`avail ${!p.inStock ? 'is-out' : size && left <= 5 ? 'is-low' : ''}`} aria-live="polite">
            {!p.inStock ? 'Sold out' : !size ? 'Select a size' : left <= 5 ? `Only ${left} left in ${size}, no restocking` : `Size ${size} available`}
          </p>

          <div className="buy__cta">
            <div className="qty">
              <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity"><Minus size={14} /></button>
              <span aria-live="polite">{qty}</span>
              <button onClick={() => setQty(Math.min(left, qty + 1))} aria-label="Increase quantity" disabled={qty >= left}><Plus size={14} /></button>
            </div>
            <button className="btn-solid" onClick={add} disabled={!canBuy}>Add To Cart</button>
          </div>
          <button className="btn-outline btn-outline--lg buy__now" onClick={buyNow} disabled={!canBuy}>Shop Now</button>
          <p className="buy__ship">Free shipping on orders of Rs. 15,000 and above</p>

        </section>
      </div>

      <div className="acc">
        <Acc title="Description"><p>{p.desc || COPY[p.type]}</p><p>Model is 6 ft and wears size M.</p></Acc>
        <Acc title="Details"><ul><li>{p.craft || 'Made by hand'}</li><li>Oversized, relaxed fit</li><li>Made in India, in small batches</li></ul></Acc>
        <Acc title="Delivery and returns"><p>Orders ship within 3–5 working days and arrive in 4–7 days across India. Unworn pieces with tags can be exchanged within 7 days of delivery. Limited-edition pieces are final sale.</p></Acc>
        <Acc title="Wash and care"><p>Dry clean recommended. If washing at home, hand wash cold with a mild detergent, turn inside out and dry in shade. Do not bleach or tumble dry.</p></Acc>
      </div>

      <section className="related">
        <h2>Related products</h2>
        <Carousel label="Related products">
          {relatedList.map((x) => <ProductCard key={x.slug} product={x} />)}
        </Carousel>
      </section>

      <SizeGuide open={guide} onClose={() => setGuide(false)} side={narrow ? 'bottom' : 'right'} pants={isPants} size={size} />
    </main>
  );
}
