import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

// Dev only: `?preview` skips the sign-in so the screens can be looked at. Reads work (the catalogue is public); writes are refused by RLS.
// import.meta.env.DEV is false in a production build, so this branch is removed from what you deploy.
const PREVIEW = import.meta.env.DEV && (new URLSearchParams(location.search).has('preview') || sessionStorage.getItem('preview') === '1');
if (PREVIEW) sessionStorage.setItem('preview', '1');

/**
 * Signed in is not enough: `admin` comes from public.is_admin(), which the database also enforces on every read and write.
 * admin: null = checking, true, false = signed in but not an admin, 'setup' = the 0004 migration has not been run.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, admin: null, ready: !supabase || PREVIEW });

  useEffect(() => {
    if (!supabase || PREVIEW) return;
    const apply = async (session) => {
      const user = session?.user ?? null;
      if (!user) return setState({ user: null, admin: false, ready: true });
      const { data, error } = await supabase.rpc('is_admin');
      setState({ user, admin: error ? 'setup' : data === true, ready: true });
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => { setTimeout(() => apply(session), 0); }); // defer: calling supabase inside this callback can deadlock
    return () => data.subscription.unsubscribe();
  }, []);

  const api = useMemo(() => PREVIEW ? { user: { email: 'preview (read-only)' }, admin: true, ready: true, enabled: true, preview: true, signIn: async () => ({}), signOut: async () => {} } : ({
    ...state,
    enabled: Boolean(supabase),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  }), [state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
