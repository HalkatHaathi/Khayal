import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';

const Ctx = createContext(null);

/** Supabase session in React. With no Supabase env vars `enabled` is false and pages show a "not connected" notice. */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, ready: !supabase });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setState({ user: data.session?.user ?? null, ready: true }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ user: session?.user ?? null, ready: true }));
    return () => data.subscription.unsubscribe();
  }, []);

  const api = useMemo(() => ({
    ...state,
    enabled: Boolean(supabase),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, name) => supabase.auth.signUp({
      email, password, options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/account` },
    }),
    signOut: () => supabase.auth.signOut(),
    forgot: (email) => supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/account/reset` }),
    setPassword: (password) => supabase.auth.updateUser({ password }),
  }), [state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
