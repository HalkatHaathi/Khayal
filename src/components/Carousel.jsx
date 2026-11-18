import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from './Icons';

/** Scroll-snap track with prev/next arrows (shown on hover, hidden at the ends). `peek` shows part of the next card. */
export default function Carousel({ children, peek = false, label }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  useEffect(() => {
    const el = ref.current;
    const update = () =>
      setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);

  const go = (dir) => {
    const el = ref.current;
    el.scrollBy({ left: dir * el.clientWidth * 0.92, behavior: 'smooth' });
  };

  return (
    <div className={`carousel ${peek ? 'carousel--peek' : ''}`} role="region" aria-roledescription="carousel" aria-label={label}>
      <div className="carousel__track" ref={ref}>{children}</div>
      {!edge.start && (
        <button className="carousel__btn carousel__btn--prev" onClick={() => go(-1)} aria-label="Previous"><ArrowLeft size={22} /></button>
      )}
      {!edge.end && (
        <button className="carousel__btn carousel__btn--next" onClick={() => go(1)} aria-label="Next"><ArrowRight size={22} /></button>
      )}
    </div>
  );
}
