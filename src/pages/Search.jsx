import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { search } from '../catalog';
import { useCatalog } from '../store';

export default function Search() {
  const [sp] = useSearchParams();
  const q = (sp.get('q') || '').trim();
  const { catalog } = useCatalog();
  const hits = search(catalog, q);
  useEffect(() => { document.title = `Search – KHYAL`; }, []);
  return (
    <main className="srch">
      <header className="srch__head">
        <h1>{q ? <>Results for “{q}”</> : 'Search'}</h1>
        {q && <p>{hits.length} {hits.length === 1 ? 'product' : 'products'}</p>}
      </header>
      {hits.length ? (
        <>
          <h2 className="sr-only">Products</h2>
          <div className="grid">{hits.map((p) => <ProductCard key={p.slug} product={p} />)}</div>
        </>
      ) : (
        <div className="empty">
          <p>{q ? 'No products found' : 'Type something in the search bar to begin'}</p>
          <Link to="/collections/new-arrivals" className="btn-line">Continue shopping</Link>
        </div>
      )}
    </main>
  );
}
