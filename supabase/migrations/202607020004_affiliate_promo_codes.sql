-- Affiliate / partner promo codes.
--
-- Ian's buddies promote GroupBlast and each hand out ONE code. A customer who
-- redeems it gets 5% off the monthly plan; the buddy who owns the code earns a
-- 15% commission. Attribution is by the code itself: user_plans.promo_code
-- already records which code a customer used, so we just need to know which
-- buddy owns which code and what commission they're owed.
--
-- These are seeded ONCE here so new buddies can be onboarded with zero code
-- changes: hand out an unused code, then fill in affiliate_name/affiliate_contact
-- with a plain SQL UPDATE (or leave blank and track by code). Ten are seeded;
-- add more anytime with an INSERT into promo_codes.
--
-- Discount honoring is still manual today (same as MILITARY10) — redemption
-- records the discount on user_plans and passes the code into the checkout /
-- mailto. When Stripe goes live, create a matching 5% promotion code in Stripe
-- for each of these so prefilled_promo_code actually discounts at checkout.

-- 1. Attribution columns on the existing promo_codes table.
alter table public.promo_codes
  add column if not exists commission_percent integer not null default 0
    check (commission_percent >= 0 and commission_percent <= 100),
  add column if not exists affiliate_name text not null default '',
  add column if not exists affiliate_contact text not null default '';

comment on column public.promo_codes.commission_percent is
  'Percent of the customer''s payment owed to the affiliate who owns this code.';
comment on column public.promo_codes.affiliate_name is
  'Which buddy owns this code. Fill in when you hand the code out.';

-- 2. Seed 10 partner codes: 5% customer discount, 15% affiliate commission.
--    Unambiguous alphabet (no 0/O/1/I/L) so nobody mistypes them.
insert into public.promo_codes (code, discount_percent, commission_percent, description)
values
  ('GBPARTNER-6R5ABJ', 5, 15, 'Partner referral code'),
  ('GBPARTNER-J7FHAZ', 5, 15, 'Partner referral code'),
  ('GBPARTNER-WCES8D', 5, 15, 'Partner referral code'),
  ('GBPARTNER-ZQXT3A', 5, 15, 'Partner referral code'),
  ('GBPARTNER-Z69GB2', 5, 15, 'Partner referral code'),
  ('GBPARTNER-CRH9X3', 5, 15, 'Partner referral code'),
  ('GBPARTNER-Q55956', 5, 15, 'Partner referral code'),
  ('GBPARTNER-KYA4HB', 5, 15, 'Partner referral code'),
  ('GBPARTNER-MVJZ2G', 5, 15, 'Partner referral code'),
  ('GBPARTNER-9CT2UG', 5, 15, 'Partner referral code')
on conflict (code) do update set
  discount_percent = excluded.discount_percent,
  commission_percent = excluded.commission_percent,
  description = excluded.description;

-- 3. Make redemption forgiving: customers may type the code without the dash,
--    with spaces, or in any case. Normalize both sides to letters+digits only.
--    MILITARY10 (no dash) is unaffected.
create or replace function public.apply_promo_code(p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_promo public.promo_codes%rowtype;
  v_normalized text := regexp_replace(upper(trim(p_code)), '[^A-Z0-9]', '', 'g');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_uid <> p_user_id then
    raise exception 'not_authorized';
  end if;

  select * into v_promo
  from public.promo_codes
  where regexp_replace(upper(code), '[^A-Z0-9]', '', 'g') = v_normalized
    and active = true
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  update public.user_plans
    set promo_code = v_promo.code,
        discount_percent = v_promo.discount_percent
  where user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'code', v_promo.code,
    'discount_percent', v_promo.discount_percent
  );
end;
$$;

grant execute on function public.apply_promo_code(uuid, text) to authenticated;

-- 4. Payout report: one row per affiliate code with how many customers are on it
--    and the estimated monthly commission owed. Assumes the $97 base plan; edit
--    the 97 here if the price changes. Read it with:  select * from affiliate_payouts;
create or replace view public.affiliate_payouts as
select
  pc.code,
  pc.affiliate_name,
  pc.affiliate_contact,
  pc.discount_percent,
  pc.commission_percent,
  count(up.user_id) filter (where up.plan = 'active')                 as paying_customers,
  count(up.user_id) filter (where up.plan = 'trial')                  as trialing_customers,
  round(
    count(up.user_id) filter (where up.plan = 'active')
      * (97 * (1 - pc.discount_percent / 100.0))
      * (pc.commission_percent / 100.0)
  , 2)                                                                 as est_monthly_commission_usd
from public.promo_codes pc
left join public.user_plans up
  on regexp_replace(upper(up.promo_code), '[^A-Z0-9]', '', 'g')
   = regexp_replace(upper(pc.code), '[^A-Z0-9]', '', 'g')
where pc.commission_percent > 0
group by pc.code, pc.affiliate_name, pc.affiliate_contact,
         pc.discount_percent, pc.commission_percent
order by paying_customers desc, pc.code;

comment on view public.affiliate_payouts is
  'Per-affiliate commission report. paying_customers x list price x (1-discount) x commission%.';
