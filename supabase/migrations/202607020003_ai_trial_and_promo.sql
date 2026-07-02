-- Self-serve 24-hour free trial + discount codes for the Automated Content
-- add-on. Mirrors the base-plan promo_codes pattern (202606300003) but as a
-- separate table/RPC pair since the AI add-on is priced and billed
-- independently ($60/mo flat, manual billing, not tied to the base $97).

alter table public.ai_entitlements
  add column if not exists trial_started_at timestamptz,
  add column if not exists discount_code text,
  add column if not exists discount_amount_cents integer not null default 0;

comment on column public.ai_entitlements.trial_started_at is
  'When the user started their one-time 24-hour Automated Content trial. Set once via start_ai_trial(); never reset.';

-- Known discount codes for the add-on. Add rows here for future codes.
create table if not exists public.ai_promo_codes (
  code text primary key,
  discount_amount_cents integer not null check (discount_amount_cents > 0 and discount_amount_cents < 6000),
  description text not null default '',
  active boolean not null default true
);

comment on table public.ai_promo_codes is
  'Discount codes for the $60/mo Automated Content add-on, redeemable via apply_ai_promo_code(). Manual billing only -- honor the discounted price by hand until this tier is on Stripe.';

insert into public.ai_promo_codes (code, discount_amount_cents, description)
values ('AI40OFF', 4000, '$40 off Automated Content -- $20/mo instead of $60/mo')
on conflict (code) do update set
  discount_amount_cents = excluded.discount_amount_cents,
  description = excluded.description;

create or replace function public.apply_ai_promo_code(p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_promo public.ai_promo_codes%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_uid <> p_user_id then raise exception 'not_authorized'; end if;

  select * into v_promo
  from public.ai_promo_codes
  where code = upper(trim(p_code)) and active = true;

  if v_promo.code is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  insert into public.ai_entitlements (user_id, discount_code, discount_amount_cents)
  values (p_user_id, v_promo.code, v_promo.discount_amount_cents)
  on conflict (user_id) do update
    set discount_code = excluded.discount_code,
        discount_amount_cents = excluded.discount_amount_cents;

  return jsonb_build_object(
    'ok', true,
    'code', v_promo.code,
    'discount_amount_cents', v_promo.discount_amount_cents
  );
end;
$$;

grant execute on function public.apply_ai_promo_code(uuid, text) to authenticated;

-- One-time, one-day free trial of Automated Content. Requires the base plan
-- to still have access (matches the fact the whole app is gated by
-- TrialGate anyway, but this guards direct RPC calls too).
create or replace function public.start_ai_trial(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.user_plans%rowtype;
  v_ai public.ai_entitlements%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_uid <> p_user_id then raise exception 'not_authorized'; end if;

  select * into v_plan from public.user_plans where user_id = p_user_id;
  if v_plan.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_base_access');
  end if;
  if not v_plan.is_pilot and v_plan.plan = 'expired' then
    return jsonb_build_object('ok', false, 'error', 'no_base_access');
  end if;
  if not v_plan.is_pilot and v_plan.plan = 'trial' and now() >= v_plan.trial_ends_at then
    return jsonb_build_object('ok', false, 'error', 'no_base_access');
  end if;

  insert into public.ai_entitlements (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_ai from public.ai_entitlements where user_id = p_user_id;

  if v_ai.addon_active then
    return jsonb_build_object('ok', false, 'error', 'already_active');
  end if;
  if v_ai.trial_started_at is not null then
    return jsonb_build_object('ok', false, 'error', 'trial_already_used');
  end if;

  update public.ai_entitlements set trial_started_at = now() where user_id = p_user_id;

  return jsonb_build_object('ok', true, 'trial_ends_at', now() + interval '1 day');
end;
$$;

grant execute on function public.start_ai_trial(uuid) to authenticated;

-- check_trial_status: ai_access now also true during an active trial window,
-- plus surfaces trial/discount state so the client can show the right CTA.
create or replace function public.check_trial_status(p_user_id uuid, p_device_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.user_plans%rowtype;
  v_device public.device_trials%rowtype;
  v_ai public.ai_entitlements%rowtype;
  v_now timestamptz := now();
  v_days_remaining integer := 0;
  v_status text;
  v_has_access boolean := false;
  v_ai_access boolean := false;
  v_ai_trial_active boolean := false;
begin
  if p_user_id is null then raise exception 'user_id_required'; end if;
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_uid <> p_user_id then raise exception 'not_authorized'; end if;

  insert into public.user_plans (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_plan from public.user_plans where user_id = p_user_id;

  if p_device_id is not null and length(trim(p_device_id)) between 8 and 128
     and not v_plan.is_pilot and v_plan.plan = 'trial' then
    insert into public.device_trials (device_id, first_user_id, trial_ends_at)
    values (trim(p_device_id), p_user_id, v_plan.trial_ends_at)
    on conflict (device_id) do nothing;

    select * into v_device from public.device_trials
    where device_id = trim(p_device_id);

    if found and v_device.first_user_id <> p_user_id
       and v_device.trial_ends_at < v_plan.trial_ends_at then
      update public.user_plans
        set trial_ends_at = v_device.trial_ends_at
      where user_id = p_user_id;
      v_plan.trial_ends_at := v_device.trial_ends_at;
    end if;
  end if;

  if v_plan.is_pilot or v_plan.plan = 'pilot' then
    v_status := 'pilot'; v_has_access := true;
  elsif v_plan.plan = 'active' then
    v_status := 'active'; v_has_access := true;
  elsif v_now < v_plan.trial_ends_at then
    v_status := 'trial'; v_has_access := true;
  else
    v_status := 'expired'; v_has_access := false;
    update public.user_plans set plan = 'expired'
    where user_id = p_user_id and plan = 'trial';
  end if;

  select * into v_ai from public.ai_entitlements where user_id = p_user_id;

  if v_has_access and v_ai.user_id is not null then
    v_ai_trial_active := v_ai.trial_started_at is not null
      and v_now < v_ai.trial_started_at + interval '1 day';
    v_ai_access := coalesce(v_ai.addon_active, false) or v_ai_trial_active;
  end if;

  v_days_remaining := greatest(0,
    ceil(extract(epoch from (v_plan.trial_ends_at - v_now)) / 86400.0)::integer);

  return jsonb_build_object(
    'status', v_status,
    'has_access', v_has_access,
    'is_pilot', v_status = 'pilot',
    'trial_started_at', v_plan.trial_started_at,
    'trial_ends_at', v_plan.trial_ends_at,
    'days_remaining', v_days_remaining,
    'ai_access', v_ai_access,
    'ai_trial_active', v_ai_trial_active,
    'ai_trial_used', v_ai.trial_started_at is not null,
    'ai_trial_ends_at', case when v_ai.trial_started_at is not null
      then v_ai.trial_started_at + interval '1 day' else null end,
    'ai_discount_code', v_ai.discount_code,
    'ai_discount_cents', coalesce(v_ai.discount_amount_cents, 0),
    'promo_code', v_plan.promo_code,
    'discount_percent', v_plan.discount_percent
  );
end;
$$;

grant execute on function public.check_trial_status(uuid, text) to authenticated;
