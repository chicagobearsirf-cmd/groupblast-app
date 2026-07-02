-- Stripe billing: link user_plans rows to Stripe customers/subscriptions so
-- the stripe-webhook edge function can flip plan state automatically.
-- Payment flow: TrialGate opens a Stripe Payment Link with
-- client_reference_id=<user_id>; the webhook maps it back here.

alter table public.user_plans
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create unique index if not exists user_plans_stripe_customer_id_key
  on public.user_plans (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists user_plans_stripe_subscription_id_key
  on public.user_plans (stripe_subscription_id)
  where stripe_subscription_id is not null;
