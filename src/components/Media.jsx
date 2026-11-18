import { useState } from 'react';

const SHAPES = {
  tee: 'M30 20 45 12q15 10 30 0l15 8 18 24-14 10-8-8v60H34V46l-8 8L12 44Z',
  long: 'M34 18 46 12q14 9 28 0l12 6 16 76-13 4-9-44v58H40V60l-9 44-13-4 16-82Z',
  kurta: 'M38 14 48 10q12 8 24 0l10 4 14 70-12 3-6-34v70H42V63l-6 34-12-3Z',
};

/** Image slot. Shows /public/images file when `src` loads; otherwise a tonal block + silhouette. */
export default function Media({ src, tone = '#cfc8bd', kind, alt = '', className = '', children }) {
  const [ok, setOk] = useState(Boolean(src));
  return (
    <div className={`media ${className}`} style={{ background: tone }}>
      {!ok && kind && (
        <svg className="media__shape" viewBox="0 0 120 120" aria-hidden="true">
          <path d={SHAPES[kind]} fill="currentColor" />
        </svg>
      )}
      {ok && <img src={src} alt={alt} loading="lazy" onError={() => setOk(false)} />}
      {children}
    </div>
  );
}
