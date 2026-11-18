import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same policy as vercel.json / public/_headers (admin never needs more than Supabase + Google Fonts). Keep the three in sync.
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

export default defineConfig({
  plugins: [react()],
  preview: { headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } },
});
