import { Link } from 'react-router-dom';

/**
 * Everything the admin site can edit. These are the defaults: the storefront looks exactly like this until a row exists in
 * public.site_content (keys 'home', 'menus', 'site'). admin/src/content.js holds a copy of the same defaults for the editor.
 */
export const DEFAULTS = {
  home: {
    sections: [
      { id: 'hero', type: 'hero', visible: true, cta: 'Shop now', label: "Autumn Winter '26", link: '/collections/aw26', image: '', label2: 'Best Sellers', link2: '/collections/best-sellers', image2: '' },
      { id: 'row-aw26', type: 'products', visible: true, collection: 'aw26', title: "Autumn Winter '26", sub: '', peek: false, upper: false },
      { id: 'banner-viraam', type: 'banner', visible: true, title: 'Viraam 3.0', sub: 'Limited Edition T-Shirts', cta: 'Shop now', link: '/collections/viraam', image: '' },
      { id: 'row-viraam', type: 'products', visible: true, collection: 'viraam', title: 'VIRAAM 3.0', sub: 'Limited Edition T-Shirts', peek: true, upper: true },
      { id: 'tiles', type: 'categories', visible: true, items: [
        { name: 'T-Shirts', to: '/collections/t-shirts', image: '', tone: '#7b1d1b' },
        { name: 'Jackets', to: '/collections/jackets', image: '', tone: '#6b93a8' },
        { name: 'Sweatshirts & Hoodies', to: '/collections/hoodies', image: '', tone: '#2a2c22' },
      ] },
      { id: 'row-best', type: 'products', visible: true, collection: 'best-sellers', title: 'Best Sellers', sub: '', peek: true, upper: false },
      { id: 'full', type: 'fullscreen', visible: true, title: 'Made by hand', text: 'Block printing, hand embroidery and screen printing, done in small batches by the people who know the work best.', cta: 'Our craft', link: '/about', image: '' },
      { id: 'insta', type: 'instagram', visible: true, title: '@KHYALWEAR', link: 'https://instagram.com', items: ['#c9a27c', '#3b3a38', '#a9b8ae', '#7a2b2b', '#e1d8c9', '#46566f'].map((tone) => ({ image: '', link: '', tone })) },
      { id: 'story', type: 'story', visible: true, title: 'Rooted in Stories', text: 'Craft, culture, and contemporary expression—stitched together with purpose', cta: 'Discover our journey', link: '/about', image: '' },
      { id: 'news', type: 'newsletter', visible: true, kicker: 'Newsletter', title: 'Sign up', text: 'Subscribe to get special offers, free giveaways, and once-in-a-lifetime deals.', image: '' },
    ],
  },
  menus: {
    nav: [
      { label: 'T-Shirts', to: '/collections/t-shirts' }, { label: 'Jackets', to: '/collections/jackets' }, { label: 'Kurtas', to: '/collections/kurtas' },
      { label: 'Hoodies', to: '/collections/hoodies' }, { label: 'Shirts', to: '/collections/shirts' },
    ],
    drawer: [
      { label: 'Shop', children: [
        { label: 'New arrivals', to: '/collections/new-arrivals' }, { label: 'Jackets', to: '/collections/jackets' }, { label: 'Sweatshirts & Hoodies', to: '/collections/hoodies' },
        { label: 'T-shirts', to: '/collections/t-shirts' }, { label: 'Kurtas', to: '/collections/kurtas' }, { label: 'Shirts', to: '/collections/shirts' },
        { label: 'Bottoms', to: '/collections/bottoms' }, { label: 'Women', to: '/collections/women' },
      ] },
      { label: 'Collections', children: [{ label: "Autumn Winter '26", to: '/collections/aw26' }, { label: 'Viraam 3.0', to: '/collections/viraam' }] },
      { label: 'Limited-Edition Collaborations', children: [{ label: 'Viraam 3.0', to: '/collections/viraam' }] },
      { label: 'Sale', to: '/collections/sale' },
    ],
    footer: [
      { title: 'Resources', links: [{ label: 'Track your order', to: '/track' }, { label: 'Blog', to: '/blog' }, { label: 'About KHYAL', to: '/about' }, { label: 'Contact Us', to: '/contact' }] },
      { title: 'Quick Links', links: [{ label: 'Shipping policy', to: '/policies/shipping' }, { label: 'Returns & Exchange', to: '/policies/returns' }, { label: 'Privacy Policy', to: '/policies/privacy' }, { label: 'Terms of Service', to: '/policies/terms' }] },
    ],
  },
  site: {
    announcement: { on: false, text: '', link: '' },
    whatsapp: '910000000000', // shortcut: placeholder, set the real number in the admin
    email: 'hello@khyal.store',
    social: { instagram: 'https://instagram.com', facebook: 'https://facebook.com', x: 'https://x.com' },
    copyright: '© K H Y A L 2026',
    holding: { on: false, title: 'Something new is coming', text: 'We are putting the finishing touches on our next collection. Join the waitlist and be the first to know.', date: '', countdown: true, autoLift: false, image: '', waitlist: true, button: 'Join the waitlist', keepInfo: true, keepTrack: true,
      bg: '#202020', overlay: '#000000', overlayOpacity: 55, fg: '#ffffff', btnBg: '#ffffff', btnFg: '#111111', align: 'center', valign: 'middle', titleSize: 'm', showLogo: false },
    tracking: { title: 'Track your order', intro: 'Enter your order number and the mobile number you used at checkout.', help: 'Questions about a parcel? Message us on WhatsApp and quote your order number.' },
  },
};

/** DB rows [{key, value}] -> content, falling back to DEFAULTS per area so a half-edited site never breaks. */
export function mergeContent(rows) {
  const m = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  const s = m.site || {};
  return {
    home: Array.isArray(m.home?.sections) ? m.home : DEFAULTS.home,
    menus: { ...DEFAULTS.menus, ...(m.menus || {}) },
    site: { ...DEFAULTS.site, ...s, announcement: { ...DEFAULTS.site.announcement, ...s.announcement }, social: { ...DEFAULTS.site.social, ...s.social }, tracking: { ...DEFAULTS.site.tracking, ...s.tracking }, holding: { ...DEFAULTS.site.holding, ...s.holding } },
  };
}

/** Links are typed in the admin: only same-site paths and http(s) are followed, so a pasted javascript: URL does nothing. */
export const isExternal = (to) => /^https?:\/\//i.test(to || '');
export function A({ to, children, ...rest }) {
  if (isExternal(to)) return <a href={to} target="_blank" rel="noreferrer noopener" {...rest}>{children}</a>;
  return <Link to={to?.startsWith('/') ? to : '/'} {...rest}>{children}</Link>;
}
