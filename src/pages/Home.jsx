import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Carousel from '../components/Carousel';
import Media from '../components/Media';
import ProductCard from '../components/ProductCard';
import NewsletterForm from '../components/NewsletterForm';
import { ArrowRight } from '../components/Icons';
import { A } from '../content';
import { useCatalog } from '../store';

/** Fade-up each .reveal once as it enters; content stays visible if JS/IO is unavailable (see .js .reveal). */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

const ShopNow = ({ to, small }) => (
  <Link to={to} className={`btn-dark ${small ? 'btn-dark--solo' : ''}`}>Shop now <ArrowRight size={12} /></Link>
);

const Row = ({ title, sub, to, products, peek, upper }) => (
  <section className="sec">
    <div className="sec__head reveal">
      <div>
        <h2 className={`sec__title ${upper ? 'sec__title--caps' : ''}`}>{title}</h2>
        {sub && <p className="sec__sub">{sub}</p>}
      </div>
      <ShopNow to={to} />
    </div>
    <Carousel peek={peek} label={title}>
      {products.map((p) => <ProductCard key={p.slug} product={p} />)}
    </Carousel>
  </section>
);

/** Photo behind a block. Without one, the block keeps its built-in colour treatment. */
const Photo = ({ src }) => (src ? <img className="bg-img" src={src} alt="" loading="lazy" /> : null);

export default function Home() {
  const { collections, content } = useCatalog();
  useReveal();
  const render = (s) => {
    switch (s.type) {
      case 'hero': return (
        <section key={s.id} className="hero">
          {[['', 'h1'], ['2', 'h2']].map(([n, Tag]) => {
            const img = s['image' + n]; const label = s['label' + n] ?? (n ? '' : s.title); // s.title: hero saved before it had two halves
            return (
              <A key={n} to={s['link' + n] || s.link} className="hero__half" aria-label={label}>
                <div className={`hero__bg hero__bg--${n || 1} ${img ? 'has-img' : ''}`}><Photo src={img} /></div>
                <Tag className="hero__title">{label}</Tag>
                {s.cta && <span className="hero__cta">{s.cta}</span>}
              </A>
            );
          })}
        </section>
      );
      case 'products': return <Row key={s.id} title={s.title} sub={s.sub} to={`/collections/${s.collection}`} products={collections[s.collection]?.items ?? []} peek={s.peek} upper={s.upper} />;
      case 'banner': return (
        <A key={s.id} to={s.link} className="banner" aria-label={[s.title, s.sub].filter(Boolean).join(', ')}>
          <div className={`banner__bg ${s.image ? 'has-img px' : ''}`} style={s.image ? { backgroundImage: `url("${encodeURI(s.image)}")` } : undefined} />
          <div className="banner__copy">
            <h2>{s.title}</h2>
            {s.sub && <p>{s.sub}</p>}
            {s.cta && <span className="btn-dark btn-dark--solo">{s.cta}</span>}
          </div>
        </A>
      );
      case 'categories': return (
        <section key={s.id} className="trio" aria-label="Shop by category">
          {s.items.map((c, i) => (
            <A key={i} to={c.to} className="trio__item">
              <Media tone={c.tone || '#cfc8bd'} src={c.image} />
              <span className="trio__name">{c.name}</span>
              <span className="trio__go">Shop Now</span>
            </A>
          ))}
        </section>
      );
      case 'fullscreen': return (
        <section key={s.id} className="full">
          <div className={`full__bg ${s.image ? 'has-img' : ''}`}><Photo src={s.image} /></div>
          <div className="full__copy reveal">
            <h2>{s.title}</h2>
            {s.text && <p>{s.text}</p>}
            {s.cta && <A to={s.link} className="btn-dark btn-dark--wide">{s.cta} <ArrowRight size={12} /></A>}
          </div>
        </section>
      );
      case 'instagram': return (
        <section key={s.id} className="insta">
          <h2 className="sec__title sec__title--caps reveal">{s.title}</h2>
          <div className="insta__grid">
            {s.items.map((x, i) => <A key={i} to={x.link || s.link} aria-label={`Instagram post ${i + 1}`}><Media tone={x.tone || '#cfc8bd'} src={x.image} /></A>)}
          </div>
        </section>
      );
      case 'story': return (
        <section key={s.id} className="story">
          <div className={`story__bg ${s.image ? 'has-img' : ''}`}><Photo src={s.image} /></div>
          <div className="story__copy reveal">
            <h2>{s.title}</h2>
            {s.text && <p>{s.text}</p>}
            {s.cta && <A to={s.link} className="btn-dark btn-dark--wide">{s.cta} <ArrowRight size={12} /></A>}
          </div>
        </section>
      );
      case 'newsletter': return (
        <section key={s.id} className="news">
          <Media tone="#6d5b3c" src={s.image} className="news__img" />
          <NewsletterForm kicker={s.kicker} title={s.title} text={s.text} />
        </section>
      );
      default: return null;
    }
  };
  return <main>{content.home.sections.filter((s) => s.visible !== false).map(render)}</main>;
}
