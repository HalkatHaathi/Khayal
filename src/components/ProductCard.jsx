import { Link } from 'react-router-dom';
import Media from './Media';
import { Plus } from './Icons';
import { inr } from '../data';

export default function ProductCard({ product: p, compact = false }) {
  const to = `/products/${p.slug}`;
  return (
    <article className="card">
      <Link to={to} className="card__link" aria-label={p.name}>
        <div className="card__img">
          <Media src={p.img} tone={p.tone} kind={p.kind} alt={p.name} />
          <Media src={p.imgAlt} tone={p.alt} kind={p.kind} alt="" className="card__alt" />
          {!compact && <span className="card__add" aria-hidden="true"><Plus size={18} /></span>}
        </div>
        <div className="card__meta">
          <h3 className="card__name">{p.name}</h3>
          {p.craft && !compact && <p className="card__craft">{p.craft}</p>}
          <p className="card__price">
            {p.from && 'From '}{inr(p.price)}
            {p.was && <s>{inr(p.was)}</s>}
          </p>
        </div>
      </Link>
    </article>
  );
}
