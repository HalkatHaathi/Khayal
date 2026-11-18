import { aw26, viraam, bestSellers, popular, kurtas, pants } from './data';

export const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
export const WAIST = ['28', '30', '32', '34', '36'];
export const PRICE_MAX = 90000;
const SIZE_ORDER = [...SIZES, ...WAIST];

/**
 * Product shape used everywhere in the UI:
 * { id?, slug, name, craft, desc, price, was, from, tone, alt, kind, type, fit, pantsAddon,
 *   sizes[] (sizes with stock), stock{size:n}, inStock, left (max stock), date (higher = newer), bestRank, img, imgAlt, gallery[] }
 */

/** DB rows -> UI product. */
export function fromRows(products, links) {
  const rank = new Map();
  links.filter((l) => l.collection_slug === 'best-sellers').forEach((l) => rank.set(l.product_id, l.position));
  return [...products].sort((a, b) => b.sort - a.sort).map((r, i) => {
    const stock = Object.fromEntries(r.product_sizes.map((s) => [s.size, s.stock]));
    const sizes = Object.keys(stock).filter((s) => stock[s] > 0).sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
    const gallery = [...r.product_images].sort((a, b) => a.position - b.position).map((x) => x.url);
    return {
      id: r.id, slug: r.slug, name: r.name, craft: r.craft, desc: r.description, price: r.price, was: r.compare_at ?? undefined,
      from: r.price_from, tone: r.tone, alt: r.alt_tone, kind: r.kind, type: r.type, fit: r.fit, pantsAddon: r.pants_addon,
      sizes, stock, inStock: sizes.length > 0, left: Math.max(0, ...Object.values(stock)), date: products.length - i,
      bestRank: rank.has(r.id) ? rank.get(r.id) : 99, img: gallery[0], imgAlt: gallery[1], gallery, layout: r.gallery_layout || 'feature',
    };
  });
}

/** Collection definitions + links -> { slug: { title, items } }. Manual collections use links; others are rule-based. */
export function buildCollections(catalog, defs, links) {
  const out = {};
  for (const d of defs) {
    const linked = links.filter((l) => l.collection_slug === d.slug).sort((a, b) => a.position - b.position);
    let items;
    if (linked.length) items = linked.map((l) => catalog.find((p) => p.id === l.product_id)).filter(Boolean);
    else if (d.all_products) items = catalog;
    else if (d.on_sale) items = catalog.filter((p) => p.was);
    else if (d.type_filter) items = catalog.filter((p) => p.type === d.type_filter);
    else items = [];
    out[d.slug] = { title: d.title, items };
  }
  return out;
}

// ---------- bundled sample data: used only when Supabase env vars are missing ----------
const TYPE = {
  'ember-contour-hoodie': 'Sweatshirts & Hoodies', 'trompe-sweatshirt': 'Sweatshirts & Hoodies',
  'sabz-bagh-jacket': 'Jackets', 'night-jungle-jacket': 'Jackets', 'ash-bomber': 'Jackets',
  'indigo-overshirt': 'Shirts', 'clay-shirt': 'Shirts', 'sketch-shirt': 'Shirts', 'daydream-shirt': 'Shirts',
  'wide-leg-trouser': 'Pants', 'charcoal-pant': 'Pants',
};
const typeOf = (x) => TYPE[x.slug] || (x.kind === 'kurta' ? 'Kurtas' : 'T-shirts');
const hash = (s) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0);

const seen = new Set();
export const catalog = [...aw26, ...viraam, ...bestSellers, ...popular, ...kurtas, ...pants]
  .filter((x) => !seen.has(x.slug) && seen.add(x.slug))
  .map((x, i) => {
    const h = hash(x.slug); const type = typeOf(x);
    const list = type === 'Pants' ? WAIST : SIZES.filter((_, k) => (h + k) % 7 !== 0);
    const inStock = h % 5 !== 0; const left = inStock ? (h % 9) + 1 : 0;
    return {
      ...x, id: x.slug, desc: '', pantsAddon: type === 'Kurtas' ? 4500 : null, type, fit: 'Men', date: i,
      sizes: inStock ? list : [], stock: Object.fromEntries(list.map((s) => [s, left])), inStock, left,
      bestRank: bestSellers.findIndex((b) => b.slug === x.slug) < 0 ? 99 : bestSellers.findIndex((b) => b.slug === x.slug), gallery: [],
    };
  });

export const COLLECTION_DEFS = [
  { slug: 'aw26', title: "Autumn Winter '26" }, { slug: 'viraam', title: 'Viraam 3.0' }, { slug: 'best-sellers', title: 'Best Sellers' },
  { slug: 'new-arrivals', title: 'New arrivals', all_products: true },
  { slug: 't-shirts', title: 'T-shirts', type_filter: 'T-shirts' }, { slug: 'jackets', title: 'Jackets', type_filter: 'Jackets' },
  { slug: 'kurtas', title: 'Kurtas', type_filter: 'Kurtas' }, { slug: 'hoodies', title: 'Sweatshirts & Hoodies', type_filter: 'Sweatshirts & Hoodies' },
  { slug: 'shirts', title: 'Shirts', type_filter: 'Shirts' }, { slug: 'bottoms', title: 'Bottoms', type_filter: 'Pants' },
  { slug: 'sale', title: 'Sale', on_sale: true }, { slug: 'women', title: 'Women' },
];
const STATIC_LINKS = [['aw26', aw26], ['viraam', viraam], ['best-sellers', bestSellers]]
  .flatMap(([slug, list]) => list.map((x, k) => ({ collection_slug: slug, product_id: x.slug, position: k })));
export const collections = buildCollections(catalog, COLLECTION_DEFS, STATIC_LINKS);

// ---------- sort / filter / search (pure) ----------
export const SORTS = [
  ['featured', 'Featured'], ['relevant', 'Most relevant'], ['best', 'Best selling'],
  ['az', 'Alphabetically, A-Z'], ['za', 'Alphabetically, Z-A'],
  ['low', 'Price, low to high'], ['high', 'Price, high to low'],
  ['old', 'Date, old to new'], ['new', 'Date, new to old'],
];
const SORT_FN = {
  az: (a, b) => a.name.localeCompare(b.name), za: (a, b) => b.name.localeCompare(a.name),
  low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price,
  old: (a, b) => a.date - b.date, new: (a, b) => b.date - a.date,
  best: (a, b) => a.bestRank - b.bestRank,
};

/** Read filter state out of URLSearchParams. */
export const readFilters = (sp) => ({
  size: sp.getAll('size'), avail: sp.getAll('avail'), type: sp.getAll('type'), fit: sp.getAll('fit'),
  min: Number(sp.get('min')) || 0, max: Number(sp.get('max')) || PRICE_MAX, sort: sp.get('sort') || 'featured',
});

export function applyFilters(items, f) {
  const out = items.filter((x) =>
    (!f.size.length || f.size.some((s) => x.sizes.includes(s))) &&
    (f.avail.length !== 1 || (f.avail[0] === 'in') === x.inStock) &&
    (!f.type.length || f.type.includes(x.type)) &&
    (!f.fit.length || f.fit.includes(x.fit)) &&
    x.price >= f.min && x.price <= f.max);
  return SORT_FN[f.sort] ? [...out].sort(SORT_FN[f.sort]) : out;
}

/** Every query word must appear in the product's name, type or craft. */
export function search(items, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return items.filter((x) => {
    const hay = `${x.name} ${x.type} ${x.craft}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
