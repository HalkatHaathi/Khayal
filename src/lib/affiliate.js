import { supabase } from './supabase';

// A visitor who arrives on ?ref=CODE is remembered for 30 days; a newer link replaces the older one (last click wins).
// The database decides whether the code is real and who is credited: this file only remembers and reports the click.
const KEY = 'khayal-ref';
const DAYS = 30;

export function captureRef() {
  try {
    const code = (new URLSearchParams(window.location.search).get('ref') || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return;
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    if (supabase && !sessionStorage.getItem(`${KEY}-${code}`)) { // one click per browser session, so a refresh is not counted again
      sessionStorage.setItem(`${KEY}-${code}`, '1');
      supabase.rpc('track_affiliate_click', { p_code: code }).then(() => {}, () => {});
    }
  } catch { /* private mode: no attribution, the store still works */ }
}

export function storedRef() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    return r && Date.now() - r.at < DAYS * 864e5 ? r.code : null;
  } catch { return null; }
}
