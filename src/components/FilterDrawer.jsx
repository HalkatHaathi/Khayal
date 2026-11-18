import { useState } from 'react';
import { Panel } from './Drawers';
import { Close, Minus, Plus } from './Icons';
import { PRICE_MAX, SIZES } from '../catalog';

const AVAIL = [['in', 'In stock'], ['out', 'Out of stock']];

function Group({ title, count, children }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="fgroup">
      <button className="fgroup__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}{count > 0 && ` (${count})`}</span>{open ? <Minus size={16} /> : <Plus size={16} />}
      </button>
      {open && <div className="fgroup__body">{children}</div>}
    </section>
  );
}

const Check = ({ checked, onChange, label }) => (
  <label className="check">
    <input type="checkbox" checked={checked} onChange={onChange} /><i aria-hidden="true" /><span>{label}</span>
  </label>
);

export default function FilterDrawer({ open, onClose, f, toggle, setPrice, reset, count, types, chips }) {
  const active = chips.length;
  const clamp = (v) => Math.min(PRICE_MAX, Math.max(0, Number(v) || 0));
  return (
    <Panel open={open} onClose={onClose} side="left" label="Filters" className="filters">
      <div className="panel__top filters__top">
        <h2 className="filters__title">FILTERS{active > 0 && ` (${active})`}</h2>
        <button onClick={onClose} aria-label="Close filters"><Close size={20} /></button>
      </div>
      <div className="filters__scroll">
        {active > 0 && (
          <ul className="chips">
            {chips.map(([k, v, label]) => (
              <li key={k + v}><button onClick={() => toggle(k, v)} aria-label={`Remove ${label}`}>{label} <Close size={9} /></button></li>
            ))}
          </ul>
        )}
        <Group title="Size" count={f.size.length}>
          {SIZES.map((s) => <Check key={s} label={s} checked={f.size.includes(s)} onChange={() => toggle('size', s)} />)}
        </Group>
        <Group title="Availability" count={f.avail.length}>
          {AVAIL.map(([v, l]) => <Check key={v} label={l} checked={f.avail.includes(v)} onChange={() => toggle('avail', v)} />)}
        </Group>
        <Group title="Price">
          <div className="range">
            <div className="range__track" />
            <div className="range__fill" style={{ left: `${(f.min / PRICE_MAX) * 100}%`, right: `${100 - (f.max / PRICE_MAX) * 100}%` }} />
            <input type="range" min="0" max={PRICE_MAX} step="500" value={f.min} aria-label="Minimum price"
              onChange={(e) => setPrice(Math.min(+e.target.value, f.max - 500), f.max)} />
            <input type="range" min="0" max={PRICE_MAX} step="500" value={f.max} aria-label="Maximum price"
              onChange={(e) => setPrice(f.min, Math.max(+e.target.value, f.min + 500))} />
          </div>
          <div className="price-in">
            <label><span>₹</span><input inputMode="numeric" value={f.min} aria-label="Minimum price in rupees" onChange={(e) => setPrice(Math.min(clamp(e.target.value), f.max), f.max)} /></label>
            <b>–</b>
            <label><span>₹</span><input inputMode="numeric" value={f.max} aria-label="Maximum price in rupees" onChange={(e) => setPrice(f.min, Math.max(clamp(e.target.value), f.min))} /></label>
          </div>
        </Group>
        <Group title="Fit For" count={f.fit.length}>
          <Check label="Men" checked={f.fit.includes('Men')} onChange={() => toggle('fit', 'Men')} />
        </Group>
        <Group title="Product Type" count={f.type.length}>
          {types.map((t) => <Check key={t} label={t} checked={f.type.includes(t)} onChange={() => toggle('type', t)} />)}
        </Group>
      </div>
      <div className="filters__foot">
        {active > 0 && <button className="btn-outline" onClick={reset}>Reset</button>}
        <button className="btn-outline" onClick={onClose}>View {count} {count === 1 ? 'item' : 'items'}</button>
      </div>
    </Panel>
  );
}
