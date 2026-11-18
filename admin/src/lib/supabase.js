import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Anon key only. Every admin write is allowed or refused by row-level security (public.is_admin()), never by this app. */
export const supabase = url && key ? createClient(url, key) : null;
