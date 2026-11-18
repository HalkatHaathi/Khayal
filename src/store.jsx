import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import { mergeContent } from './content';
import { buildCollections, catalog as sampleCatalog, collections as sampleCollections, fromRows } from './catalog';

const Ctx = createContext(null);

async function load() {
  const [p, c, l, st, sc, pg] = await Promise.all([
    supabase.from('products').select('*, product_sizes(size, stock), product_images(url, position)'),
    supabase.from('collections').select('*').order('sort'),
    supabase.from('collection_products').select('collection_slug, product_id, position'),
    supabase.from('shop_settings').select('*').maybeSingle(),
    supabase.from('site_content').select('key, value'),
    supabase.from('pages').select('slug, title, body'),
  ]);
  const err = p.error || c.error || l.error; // shop_settings may not exist before migration 0002: treat as defaults
  if (err) throw err;
  const catalog = fromRows(p.data, l.data);
  // site_content / pages may not exist before migration 0007: that is not an error, the built-in content is used
  const pages = Object.fromEntries((pg.data || []).map((x) => [x.slug, x]));
  return { catalog, collections: buildCollections(catalog, c.data, l.data), settings: st.data ?? null, content: mergeContent(sc.data), pages };
}

/**
 * Catalogue from Supabase. With no Supabase env vars (local dev) it uses the bundled sample data.
 * With env vars set it never falls back to sample data: wrong prices are worse than an error screen.
 */
export function CatalogProvider({ children }) {
  const [state, setState] = useState(supabase ? { status: 'loading' } : { status: 'ready', catalog: sampleCatalog, collections: sampleCollections, settings: { online_payments_enabled: false, cod_enabled: true, cod_fee: 150 }, content: mergeContent([]), pages: {} });
  const run = useCallback(() => {
    if (!supabase) return;
    setState({ status: 'loading' });
    load().then((d) => setState({ status: 'ready', ...d })).catch((e) => { console.error('catalogue load failed', e); setState({ status: 'error' }); });
  }, []);
  useEffect(run, [run]);

  const value = useMemo(() => {
    if (state.status !== 'ready') return { ...state, retry: run, catalog: [], collections: {}, popular: [], content: mergeContent([]), pages: {} };
    const best = state.collections['best-sellers']?.items ?? [];
    return { ...state, retry: run, popular: (best.length ? best : state.catalog).slice(0, 4) };
  }, [state, run]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCatalog = () => useContext(Ctx);
