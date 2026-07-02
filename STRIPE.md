# Stripe billing setup

One-time dashboard setup (~15 minutes), then billing is fully automatic:
pay → webhook flips `user_plans.plan` to `active` → cancel/failed payments
flip it back to `expired`. No more manual SQL activation.

## How it fits together

1. Trial ends → TrialGate shows **Subscribe — $97/month**, which opens the
   Stripe Payment Link in the browser with `client_reference_id=<supabase
   user id>` and the user's email prefilled.
2. Stripe hosts checkout (cards, Apple/Google Pay, promo codes).
3. Stripe calls the `stripe-webhook` edge function → sets `plan='active'`
   and stores the customer/subscription ids on `user_plans`.
4. User switches back to the app window → the focus listener in
   `use-plan-status.ts` re-checks the plan → gate opens. No restart needed.
5. Cancellations and failed payments come through the same webhook →
   `plan='expired'` → gate closes on next focus/launch. `past_due` keeps
   access while Stripe retries the card. Pilot accounts are never touched.

## Dashboard steps (test mode first, then repeat in live mode)

1. **Product**: Products → Add product — "GroupBlast", $97.00 USD, recurring
   monthly.
2. **Coupon**: Products → Coupons → Create — 10% off, duration **forever**,
   then add promotion code `MILITARY10` to it.
3. **Payment Link**: Payment Links → New — pick the $97/mo price, toggle
   **Allow promotion codes** ON, confirmation page = default (or redirect to
   the GroupBlast site). Copy the `https://buy.stripe.com/...` URL.
4. **Webhook**: Developers → Webhooks → Add endpoint —
   URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
   Events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the signing secret (`whsec_...`).

## Supabase steps (GroupBlast project — the one in the AdWise Guys account)

1. Run `supabase/migrations/202607020001_stripe_billing.sql` in the SQL
   editor (adds `stripe_customer_id` / `stripe_subscription_id`).
2. Deploy the function (from the repo root, logged into the right account):

   ```sh
   supabase link --project-ref <project-ref>
   supabase secrets set STRIPE_SECRET_KEY=sk_... STRIPE_WEBHOOK_SECRET=whsec_...
   supabase functions deploy stripe-webhook
   ```

   (`verify_jwt=false` comes from `supabase/config.toml` — required, Stripe
   doesn't send a Supabase JWT; the function checks the Stripe signature
   instead.)

## App step

Add to `.env.local` on each build machine (and the ENV_LOCAL CI secret):

```
VITE_STRIPE_PAYMENT_LINK=https://buy.stripe.com/xxxx
```

Then rebuild the installers. With the variable empty the app falls back to
the old mailto flow, so nothing breaks in the meantime.

## Test-mode dry run (before flipping to live keys)

1. Use the test-mode payment link + test webhook secret.
2. Card `4242 4242 4242 4242`, any future expiry/CVC.
3. Confirm `user_plans.plan` flips to `active` and the gate opens on focus.
4. Cancel the subscription in the dashboard → confirm `plan='expired'`.

## Existing manually-activated customers

Rows flipped to `active` by hand have no `stripe_subscription_id`, so
webhooks never touch them — they keep working. Migrate them by sending each
one the payment link from inside the app (their user id rides along), or
leave them manual until renewal.
