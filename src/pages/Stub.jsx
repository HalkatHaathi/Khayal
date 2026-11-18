import { Link, useLocation } from 'react-router-dom';

export default function Stub({ soon }) {
  const { pathname } = useLocation();
  return (
    <main className="stub">
      <h1>{soon ? 'Coming soon' : 'Page not found'}</h1>
      <p>{pathname}</p>
      <Link to="/" className="btn-line">Return to Store</Link>
    </main>
  );
}
