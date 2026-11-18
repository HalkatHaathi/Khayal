import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** null until .env.local is filled in, so callers can fall back to the bundled sample catalogue. */
export const supabase = url && key ? createClient(url, key) : null;
