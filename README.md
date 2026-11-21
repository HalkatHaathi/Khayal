# Khyal storefront

React + Vite storefront on Supabase (Postgres, auth, row-level security). Online payment runs on Razorpay; cash on delivery also works end to end.

## Run it

```bash
npm install
cp .env.example .env.local     # then fill in the two public values
npm run dev                    # http://localhost:5173
npm run build && npm run preview   # production build with the security headers, http://localhost:4173
```

Without `.env.local` the site runs on the bundled sample catalogue and cannot place orders.

## Environment variables

| Name | Where | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | build-time, browser | no |
| `VITE_SUPABASE_ANON_KEY` | build-time, browser (the `sb_publishable_…` key) | no, public by design |

**Never** put the `sb_secret_…` / service-role key, the database password or any Razorpay secret in a `VITE_` variable: those are shipped to every visitor. Server-side secrets go in Supabase secrets (`supabase secrets set NAME=value`).

## Database

Run in this order in the Supabase SQL Editor (each file is safe to re-run), then the seed on a **dev** project only:

| File | What it does |
|---|---|
| `supabase/migrations/0001_init.sql` | Tables, row-level security, sign-up trigger |
| `supabase/migrations/0002_pricing.sql` | `shop_settings`, `user_carts`, `quote_cart()` server-side pricing, COD fee |
| `supabase/migrations/0003_orders.sql` | `create_order()`, `get_order()`, stock reservation, payment hooks |
| `supabase/migrations/0004_admin.sql` | Admin access (`admins`, `is_admin()`), admin read/write policies, order status RPC, `product-images` storage bucket |
| `supabase/migrations/0006_admin_orders.sql` | Courier/tracking/internal note on orders, inbox handled flag, unsubscribe policy (admin phase 2) |
| `supabase/migrations/0007_content.sql` | `site_content` + `pages` tables, `site-images` bucket, starter page copy (admin phase 3) |
| `supabase/migrations/0008_shipping.sql` | Shiprocket shipments, tracking events, `get_tracking()` for the order page, pickup-location setting |
| `supabase/migrations/0009_tracking.sql` | `track_order()`: the public /track page (order number + mobile number) |
| `supabase/migrations/0010_razorpay.sql` | Razorpay: payment columns, `apply_payment()` (what counts as paid), `get_order()` with hold time and refund state |
| `supabase/migrations/0012_show_stock.sql` | Per-product switch: show the "Only 3 left" count on the storefront or hide it |
| `supabase/migrations/0013_emails.sql` | Lets the admin save email templates (`site_content` key `emails`) |
| `supabase/migrations/0005_hardening.sql` | Size limits on user-written columns, locks the trigger function |
| `supabase/seed.sql` | **Sample** catalogue, coupon `KHAYAL10`. Replaces the whole catalogue. Regenerate with `node scripts/gen-seed.mjs` |


How money is decided: the browser never sends prices. `quote_cart()` and `create_order()` look up prices, stock, coupon rules, shipping and the COD fee in the database. Edit shipping, the free-shipping threshold and the COD fee in the `shop_settings` table; coupons live in `coupons`.

## Admin site (`admin/`)

A separate, self-contained app (own `package.json`) meant for its own subdomain, e.g. `admin.yourdomain.com`. Same Supabase project, same two `VITE_` variables.

```bash
cd admin && npm install
cp .env.example .env.local     # same values as the storefront
npm run dev                    # http://localhost:5174
```

1. Run `supabase/migrations/0004_admin.sql`, then make yourself an admin (the last lines of that file: create an account on the storefront, then insert your user id into `admins`).
2. Deploy: a second project on the same repo with **Root Directory = `admin`** (build `npm run build`, output `dist`). `admin/vercel.json` and `admin/public/_headers` carry the routing and security headers.
3. `VITE_STORE_URL` (optional) sets the "View storefront" link.

Covers: dashboard, orders (status changes, tracking, packing slip), customers, products, inventory, collections, discounts, messages, subscribers, and shop settings. Also storefront content: home page blocks, navigation, pages and site details (announcement bar, WhatsApp, socials). Needs `0004`, `0006` and `0007`. Content defaults live in `src/content.jsx` (storefront) and `admin/src/content.js`; the storefront looks the same until something is saved.

## Shiprocket (shipping and tracking)

Booking and tracking run in two Supabase Edge Functions in `supabase/functions`, so the Shiprocket password never reaches a browser. The admin's order page gets a **Ship with Shiprocket** button; customers see the courier's updates on their order page.

1. Run `supabase/migrations/0008_shipping.sql`.
2. In Shiprocket: Settings, API, Configure, **Create an API User** (a separate email from your login). Add your pickup address under Settings, Pickup Addresses, and put its exact name in the admin under Settings, Shiprocket.
3. Each function is one self-contained file, so you can also paste `supabase/functions/<name>/index.ts` straight into the Supabase dashboard editor (Edge Functions, Deploy a new function). For `parcel-updates` switch off "Verify JWT" there. Or set the secrets and deploy (needs the [Supabase CLI](https://supabase.com/docs/guides/cli), logged in and linked to the project):

```bash
supabase secrets set SHIPROCKET_EMAIL='api-user@example.com' SHIPROCKET_PASSWORD='...' SHIPROCKET_WEBHOOK_TOKEN="$(openssl rand -hex 24)" SHIPROCKET_FALLBACK_EMAIL='orders@yourdomain.com'
supabase functions deploy shiprocket-ship
supabase functions deploy parcel-updates --no-verify-jwt
```

4. In Shiprocket: Settings, API, Webhooks. (The function is called `parcel-updates` on purpose: Shiprocket refuses webhook addresses that contain words like "shiprocket".) URL `https://<project-ref>.supabase.co/functions/v1/parcel-updates`, token = the `SHIPROCKET_WEBHOOK_TOKEN` you just set (print it with `supabase secrets list` digest only, so keep your own copy).
5. Book a **test order first**. Field names and the COD amount were written from Shiprocket's API reference and have not been run against your account.

Delivered and in-transit updates move the order to shipped / delivered by themselves. Returns (RTO) and failed deliveries are only flagged: cancel the order in the admin when the parcel is back so its stock is restored. Cancelling a booked shipment is done in the Shiprocket panel for now.

## Razorpay (online payments)

How a payment is trusted: the browser never decides. The `pay` Edge Function (`supabase/functions/pay/index.ts`) asks **Razorpay's own API** whether the payment is captured and for exactly how much, and only then does the database mark the order paid (`apply_payment`, row-locked, safe to repeat). Two independent paths do this, so a closed browser tab never loses a payment: the browser's "I paid" call, and Razorpay's webhook. A payment that arrives for an order already cancelled or released, a second payment for an order already paid, or one with the wrong amount is **refunded automatically**. Unit tests: `node --test supabase/functions/pay/pay.test.mjs`.

Set up (do it in **Test mode** first, nothing real moves):
1. Run `supabase/migrations/0010_razorpay.sql` in the Supabase SQL Editor.
2. Razorpay Dashboard (Test mode) → Account & Settings → **API Keys** → Generate Test Key. Keep the Key Id and Key Secret.
3. Razorpay → **Webhooks** → Add: URL `https://<project-ref>.supabase.co/functions/v1/pay`, a secret you invent (any long random string), events **payment.captured**, **payment.authorized**, **order.paid**.
4. Supabase → Edge Functions → Secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (the string from step 3).
5. Supabase → Edge Functions → Deploy a new function named **pay**, paste `supabase/functions/pay/index.ts`, and turn **Verify JWT off** (Razorpay's webhook carries no Supabase login; every action authenticates itself).
6. Admin → Settings → turn **Online payment** on. It shows TEST or LIVE so you always know which mode you are in.
7. Place a test order on the storefront and pay with Razorpay's test card `4111 1111 1111 1111`, any future expiry, any CVV, OTP `1234` where asked (success); Razorpay's docs list cards and UPI IDs that fail.

Going live: complete Razorpay's activation, generate **Live** keys, replace the three secrets (the webhook needs its own live-mode entry in the dashboard), redeploy nothing, and check the Settings page says LIVE. Refunds are in the admin order page (Cancel the order first so the stock returns, then Refund).

## Resend (newsletter welcome email)

The sign-up form on the home page calls the `subscribe` Edge Function (`supabase/functions/subscribe/index.ts`). It saves the address, adds it to a Resend audience (optional) and sends a welcome email. **The email's subject, wording and layout are edited in the admin (Emails page)**, with a live preview and a "send me a test" button; run `supabase/migrations/0013_emails.sql` first so the page can save. The renderer exists twice (the function and `admin/src/lib/emailHtml.js`, for the preview); the test suite fails if they differ, so after changing it copy the marked block across. The email goes out only the first time an address signs up. If the function is not deployed or Resend is down, sign-ups still work (the form falls back to saving the address directly). Tests: `node --test supabase/functions/subscribe/subscribe.test.mjs`.

1. Resend → **API Keys** → create a key (sending access). Resend → **Domains** → add `khyal.store`, add the DNS records it shows (at GoDaddy or wherever the domain's DNS is managed today; email records don't need Cloudflare) and press Verify. Until it is verified you can only test with `onboarding@resend.dev`, which delivers to your own Resend account email.
2. Optional: Resend → **Audiences** → create one and copy its id, so every sign-up also appears there and you can send broadcasts from Resend.
3. Supabase → Edge Functions → Secrets: `RESEND_API_KEY`, `RESEND_FROM` (for example `KHYAL <hello@khyal.store>`), optionally `RESEND_REPLY_TO` (the inbox customers' replies should reach, e.g. your Gmail until Google Workspace exists), `RESEND_AUDIENCE_ID` and `SITE_URL`. Resend cannot send *from* a Gmail address: the From must be on a domain you own and verified in Resend.
4. Supabase → Edge Functions → deploy a function named **subscribe** with the code from `supabase/functions/subscribe/index.ts` and **Verify JWT off**.
5. The same Resend key can also send Supabase's sign-up and password emails: Supabase → Project Settings → Authentication → SMTP → host `smtp.resend.com`, port `465`, user `resend`, password = the API key, sender = your verified address.

## Supabase dashboard settings to check before launch

- Authentication → URL Configuration: Site URL = your domain; add `https://your-domain/**` and `http://localhost:5173/**` to Redirect URLs.
- Authentication → Sign In / Providers → Email: set the minimum password length to at least 8 (the form asks for 8, but the server setting is what is enforced). Turn on leaked-password protection if your plan has it.
- Authentication → SMTP Settings: add your own mail sender; the built-in one allows only a few emails per hour.
- Project Settings → API Keys: rotate the secret key if it was ever pasted into chat or committed.

## Deploy

Static build: `npm run build`, publish `dist/`. Set the two `VITE_` variables on the host.

- **Vercel**: `vercel.json` handles routing and security headers.
- **Netlify / Cloudflare Pages**: `public/_redirects` and `public/_headers` do the same.
- The Content-Security-Policy appears in `vercel.json`, `public/_headers` and `vite.config.js` (for local preview). Keep the three in sync. Razorpay Checkout's origins are already in it.

## Known gaps

- No order emails yet (needs a mail provider). New orders are only visible in the `orders` table until the admin site exists.
- No phone verification for guest COD orders; `create_order` limits 3 orders per phone per day as a stopgap.
- No captcha on the newsletter, contact and sign-up forms; Supabase rate-limits auth, the other two are open to repeated submissions.
- Product photos, real copy, policies and the size chart are placeholders.
