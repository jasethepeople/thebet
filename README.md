# The Bet — with Pro paywall (Stripe Payment Link version)

Bragging rights only. BB (bragging bucks) are play money: no purchases, no cash-out, 18+ only.
Pro is a feature unlock (one-time, via Stripe) that lets a player write their own forfeits.
Selling BB is never allowed — only the feature.

## Setup (about 20 minutes)

### 1. Database
Supabase → SQL Editor → New query → paste all of `schema.sql` (original) → Run.
Then New query → paste all of `supabase/migration-002-pro.sql` → Run.
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

## Before real traffic
- Turn email confirmation ON (Supabase → Auth → Providers → Email).
- This version trusts crew members with each other's bets. Before strangers can join crews,
  move settle/accept/pick into Supabase functions.
- Add Terms + Privacy pages, a block-user feature, and an admin way to remove forfeits/bets
  (custom forfeits are user-generated content on an 18+ app).
- Have a gaming attorney review before adding any real stakes or sponsor prizes.
