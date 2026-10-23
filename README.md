# The Bet — with Pro paywall (Stripe Payment Link version)

Bragging rights only. BB (bragging bucks) are play money: no purchases, no cash-out, 18+ only.
Pro is a feature unlock (one-time, via Stripe) that lets a player write their own forfeits.
Selling BB is never allowed — only the feature.

## Security hardening (run migration-003)
`supabase/migration-003-security.sql` moves every game action server-side:
- pick / accept-forfeit / settle / veto are now RPCs — balances, state transitions, and
  permissions are enforced in Postgres, not the browser
- `guard_profiles_pro` blocks anyone from setting their own Pro flag (purchase or redeem code only)
- `guard_bets_update` blocks direct bet edits; only Report still updates from the client
- Crew creators can rotate the invite code (Guide tab) if it leaks
- Share cards no longer include the invite code; use the separate **Recruit** button to share it deliberately
- Passwords now require 8+ characters (raise the dashboard minimum too: Supabase → Authentication → Sign In / Passwords)
- Supabase JS is vendored locally (`vendor/supabase.min.js`) — no CDN supply-chain risk; CSP + anti-framing headers via vercel.json + meta tags

### 1. Database
Supabase → SQL Editor → New query → paste all of `schema.sql` (original) → Run.
Then New query → paste all of `supabase/migration-002-pro.sql` → Run.
Then New query → paste all of `supabase/migration-003-security.sql` → Run.
This adds `profiles.pro`, the `forfeits` table, and the trigger that rejects custom
forfeits from non-Pro players (server-side, cannot be bypassed in the browser).

### 2. Stripe payment link (already created — verify 3 settings)
In Stripe Dashboard → Payment links → your link:
1. **After payment:** set "Redirect to your website" → `https://thebet.website/?checkout=success`
   (or your Vercel URL if the domain is not attached yet).
2. Make sure it is a **one-time payment** price.
3. Keep the price in sync with `PRO_PRICE` at the top of `index.html` (display only).

No secret key in the client. The publishable key is not needed for this flow.

### 3. Supabase Edge Function (the only one)
The `stripe-webhook` function marks profiles Pro after a paid checkout.
With the Supabase CLI installed and linked:
```
supabase link --project-ref <your-project-ref>
supabase functions deploy stripe-webhook
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx STRIPE_WEBHOOK_SECRET=whsec_xxx
```
- `STRIPE_SECRET_KEY`: Stripe Dashboard → Developers → API keys → **Secret** key. Never share it, never commit it.
- `STRIPE_WEBHOOK_SECRET`: from step 4.

### 4. Stripe webhook
- **Local test:** `stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook`
  (it prints a `whsec_...` — put that in `STRIPE_WEBHOOK_SECRET`)
- **Production:** Stripe Dashboard → Developers → Webhooks → Add endpoint:
  `https://<your-project>.functions.supabase.co/stripe-webhook`
  Select the `checkout.session.completed` event → copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

### 5. Deploy
1. `index.html` already has your Supabase URL + publishable key and your payment link baked in.
2. Push to GitHub or drag the folder into Vercel → deploy → attach `thebet.website` (Vercel → Settings → Domains).

### 6. Test the money path
1. Sign up (18+ box), create a crew.
2. New bet → type a custom forfeit → paywall → Unlock Pro.
3. Pay with a real card (live key) or swap in test keys + `4242 4242 4242 4242` first.
4. You return to `thebet.website/?checkout=success` → PRO pill lights up → custom forfeit posts.
5. As a second non-Pro account, try a custom forfeit → rejected by the database trigger.

## Architecture
- Paywall button → Stripe Payment Link with `?client_reference_id=<user id>`.
- Stripe fires `checkout.session.completed` → `stripe-webhook` verifies the signature,
  checks `payment_status === 'paid'`, sets `profiles.pro = true` for that user ID.
- The Postgres trigger enforces Pro-only custom forfeits on every bet insert.

## Custom-forfeit tokens (migration-004)
`supabase/migration-004-tokens.sql` flips the paywall: everyone writes custom forfeits free.
- 10 tokens at signup; this migration grants existing (pre-launch) users 100 — Founding Crew
- posting a custom forfeit costs 1 token (Pro unlimited, no charge)
- earn +1 back when a bet you created settles with 4+ players
- silent-drop moderation: critical (minor+sexual) or toxic forfeits are never stored, hash-logged
  to `mod_log`, and get the same generic error. Swap the regex blocklists for a real classifier
  API inside `post_bet()` when you are ready — the hook is marked.
- negative BB balances are now allowed (leaderboard drama is the point)

## Free Pro codes (hand out to people)
1. Supabase → SQL Editor:
   `insert into promo_codes(code, max_uses) values ('LAUNCH2026', 500), ('FRIENDS50', 50);`
   (codes are uppercase; max_uses caps total redemptions)
2. Anyone can enter a code in the paywall ("Have a free code?") → Pro unlocks instantly.
3. Track usage: `select code, uses, max_uses from promo_codes;`
4. Retire a code: `update promo_codes set active=false where code='FRIENDS50';`

## Before real traffic
- Turn email confirmation ON (Supabase → Auth → Providers → Email).
- This version trusts crew members with each other's bets. Before strangers can join crews,
  move settle/accept/pick into Supabase functions.
- Add Terms + Privacy pages, a block-user feature, and an admin way to remove forfeits/bets
  (custom forfeits are user-generated content on an 18+ app).
- Have a gaming attorney review before adding any real stakes or sponsor prizes.
