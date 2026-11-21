// Holding page ("coming soon") rules, kept apart from the UI so they can be tested.
/** Is the holding page showing right now? `on` is the admin's switch; with autoLift it ends by itself at the launch time. */
export const isActive = (h, now = Date.now()) => Boolean(h?.on) && !(h.autoLift && h.date && now >= Date.parse(h.date));

/** Which pages stay reachable while it is showing. Everything else sends the visitor back to the holding page. */
export function allowed(pathname, h) {
  if (pathname === '/') return true;                      // the holding page itself
  if (pathname.startsWith('/account')) return true;       // sign-in stays open so the team can see the real store
  if (h.keepInfo && (pathname === '/about' || pathname === '/contact' || pathname.startsWith('/policies/') || pathname.startsWith('/pages/'))) return true;
  if (h.keepTrack && (pathname === '/track' || pathname.startsWith('/order/'))) return true;
  return false;
}

/** Time left until `date` as { d, h, m, s }, or null when there is no (valid) date or it has passed. */
export function remaining(date, now = Date.now()) {
  const t = Date.parse(date); if (!date || Number.isNaN(t) || t <= now) return null;
  const s = Math.floor((t - now) / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
}

const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
/** "#rrggbb" + a 0-100 strength -> rgba(...). */
export function rgba(color, pct) {
  const n = parseInt(color.slice(1), 16), a = Math.min(100, Math.max(0, Number(pct) || 0)) / 100;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
/**
 * The admin's look settings turned into CSS variables and layout classes. Anything invalid (a bad colour, an unknown option,
 * a strength outside 0-100) falls back to the built-in look, so a half-edited setting can never produce an unreadable page.
 */
export function look(h = {}) {
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  return {
    vars: {
      '--hold-bg': hex(h.bg, '#202020'), '--hold-fg': hex(h.fg, '#ffffff'), '--hold-ov': rgba(hex(h.overlay, '#000000'), h.overlayOpacity ?? 55),
      '--hold-btn-bg': hex(h.btnBg, '#ffffff'), '--hold-btn-fg': hex(h.btnFg, '#111111'),
    },
    cls: `hold--${pick(h.align, ['left', 'center'], 'center')} hold--v-${pick(h.valign, ['top', 'middle', 'bottom'], 'middle')} hold--${pick(h.titleSize, ['s', 'm', 'l'], 'm')}`,
    fg: hex(h.fg, '#ffffff'),
  };
}
