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
