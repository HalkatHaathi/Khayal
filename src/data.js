// Placeholder catalogue. `img`/`imgAlt` are optional: drop files in /public/images and set the path;
// until then <Media> renders a tonal block + garment silhouette so layout can be judged.
export const inr = (n) => 'Rs. ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

export const p = (slug, name, craft, price, tone, alt, kind, from = false) => ({
  slug, name, craft, price, tone, alt, kind, from,
});

export const aw26 = [
  p('ember-contour-hoodie', 'Ember Contour Hoodie', 'Screen print +2', 12500, '#8e2f2c', '#6e2220', 'long'),
  p('sabz-bagh-jacket', "'Sabz Bagh' Jacket", 'Hand embroidery +2', 50000, '#86b79c', '#5f9479', 'long'),
  p('trompe-sweatshirt', "Trompe l'Oeil Sweatshirt", 'Screen print +1', 8000, '#d9d0bd', '#b9ad92', 'long'),
  p('night-jungle-jacket', 'Night Jungle Jacket', 'Hand embroidery +2', 75000, '#1f2a44', '#141b30', 'long'),
  p('ash-bomber', 'Ash Bomber', 'Block print +1', 18500, '#9b9388', '#7d766c', 'long'),
  p('indigo-overshirt', 'Indigo Overshirt', 'Hand embroidery', 14000, '#34476b', '#26344f', 'long'),
];

export const viraam = [
  p('persistence-tee', 'Persistence of Time T-Shirt', 'Block print +1', 6000, '#1c1c1f', '#2c2c31', 'tee'),
  p('crow-theory-tee', 'Crow Theory T-Shirt', 'Screen print', 5000, '#a9c4bd', '#8eaba3', 'tee'),
  p('mango-tee', 'Mango T-Shirt', 'Spray paint +1', 5500, '#3f8f78', '#d8d79a', 'tee'),
  p('gambler-tee', 'Gambler T-Shirt', 'Block print +2', 6000, '#8a8a84', '#6f6f69', 'tee'),
  p('salt-tee', 'Salt Wash T-Shirt', 'Spray paint', 5200, '#d6d1c6', '#bdb7aa', 'tee'),
  p('dusk-tee', 'Dusk Tee', 'Screen print +1', 5000, '#6a4a5a', '#523646', 'tee'),
];

export const bestSellers = [
  p('azul-jersey', 'Azul Block-Printed Jersey', 'Spray +2', 5000, '#e9eef5', '#bcd0e6', 'tee', true),
  p('nuit-jersey', 'Nuit Block-Printed Jersey', 'Block printing +1', 5000, '#22345c', '#182645', 'tee', true),
  p('lal-jersey', 'Lal Embroidered Jersey', 'Block printing +1', 5000, '#a42a2a', '#7f1f1f', 'tee', true),
  p('surkh-jersey', 'Surkh Jersey', 'Block printing +1', 5000, '#b8352f', '#8e2723', 'tee', true),
  p('mauve-tee', 'Mauve Block Print Tee', 'Block printing', 2250, '#b9a2a3', '#9d8586', 'tee'),
  p('clay-shirt', 'Clay Camp Shirt', 'Block printing', 4200, '#c7a58d', '#a98870', 'long'),
];

export const popular = [
  p('rose-blockprint-tee', 'Rose Blockprint Tee', '', 3759, '#2a1f22', '#3b2b30', 'tee'),
  p('mor-blockprint-tee', 'Mor Block Print Tee', '', 4699, '#1f1d1f', '#322e32', 'tee'),
  p('sketch-shirt', 'Sketch Stripe Shirt', '', 5699, '#b9bbb8', '#9ea09c', 'long'),
  p('daydream-shirt', 'Day Dreamer Shirt', '', 5599, '#d8b8ad', '#bd9a8e', 'long'),
].map((x, i) => (i === 0 ? { ...x, was: 4699 } : x));

export const kurtas = [
  p('royal-heritage-kurta', 'Royal Heritage Kurta', 'Block print', 10000, '#e6dfd0', '#cfc6b2', 'kurta', true),
  p('dichotomy-kurta-black', 'Dichotomy Kurta Black', 'Digital print', 10000, '#2c2f3a', '#1d2029', 'kurta', true),
  p('greyscale-kurta', 'Greyscale Kurta', 'Hand embroidery +2', 10000, '#ddd6c4', '#c4bba5', 'kurta', true),
  p('thinking-loud-kurta', 'Thinking Loud Kurta', 'Block print +3', 12000, '#16161a', '#25252b', 'kurta', true),
  p('midnight-kurta', 'Midnight Kurta', 'Hand embroidery +2', 10000, '#25365c', '#1a2644', 'kurta', true),
  p('emerald-kurta', 'Emerald Kurta', 'Block print +1', 10000, '#1d4a49', '#143533', 'kurta', true),
];

export const pants = [
  p('wide-leg-trouser', 'Wide Leg Trouser', 'Plain', 6500, '#3a2523', '#2a1a18', 'long'),
  p('charcoal-pant', 'Charcoal Pant', 'Plain', 5800, '#33353a', '#25272b', 'long'),
];

