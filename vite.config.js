import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same security headers as vercel.json / public/_headers, so `npm run build && npm run preview` shows CSP problems before deploy.
// Keep the three in sync; when GoKwik is added, its script, frame and connect origins must be added to the CSP.
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

export default defineConfig({
  plugins: [react()],
  preview: { headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' } },
});
