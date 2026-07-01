-- Shortens the free trial from 10 days to 4 days, and adds a lightweight
-- promo-code mechanism for the military/first-responder discount.
--
-- Payment collection itself is still manual ("contact us to subscribe") --
-- no Stripe/payment processor is wired up yet. This just records which
-- discount a user is entitled to so it can be honored manually today, and
-- mapped onto a real checkout flow later.

alter table public.user_plans
  alter column trial_ends_at set default (now() + interval '4 days');

alter table public.user_plans
  add column if not exists promo_code text,
  add column if not exists discount_percent integer not null default 0;

-- Known promo codes. Add rows here for future codes instead of hardcoding
-- them in application code.
create table if not exists public.promo_codes (
  code text primary key,
  discount_percent integer not null check (discount_percent > 0 and discount_percent <= 100),
  description text not null default '',
  active boolean not null default true
);

comment on table public.promo_codes is
  'Discount codes redeemable via apply_promo_code(). Not tied to a payment processor yet.';

insert into public.promo_codes (code, discount_percent, description)
values ('MILITARY10', 10, 'Military / first responder discount')
on conflict (code) do update set
  discount_percent = excluded.discount_percent,
  description = excluded.description;

create or replace function public.apply_promo_code(p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_promo public.promo_codes%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_uid <> p_user_id then
    raise exception 'not_authorized';
  end if;

  select * into v_promo
  from public.promo_codes
  where code = upper(trim(p_code))
    and active = true;

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

-- Surface promo/discount info from check_trial_status too.
create or replace function public.check_trial_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.user_plans%rowtype;
  v_now timestamptz := now();
  v_days_remaining integer := 0;
  v_status text;
  v_has_access boolean := false;
  v_ai_access boolean := false;
begin
  if p_user_id is null then
    raise exception 'user_id_required';
  end if;

  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_uid <> p_user_id then
    raise exception 'not_authorized';
  end if;

  insert into public.user_plans (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select *
    into v_plan
  from public.user_plans
  where user_id = p_user_id;

  if v_plan.is_pilot or v_plan.plan = 'pilot' then
    v_status := 'pilot';
    v_has_access := true;
    v_ai_access := false;
  elsif v_plan.plan = 'active' then
    v_status := 'active';
    v_has_access := true;
    if to_regclass('public.team_members') is not null
      and to_regclass('public.ai_entitlements') is not null then
      execute $sql$
        select exists (
          select 1
          from public.team_members tm
          join public.ai_entitlements ae on ae.team_id = tm.team_id
          where tm.user_id = $1
            and ae.ai_addon_active = true
            and ae.status = 'active'
        )
      $sql$
      using p_user_id
      into v_ai_access;
    end if;
  elsif v_now < v_plan.trial_ends_at then
    v_status := 'trial';
    v_has_access := true;
    v_ai_access := false;
  else
    v_status := 'expired';
    v_has_access := false;
    v_ai_access := false;

    update public.user_plans
      set plan = 'expired'
    where user_id = p_user_id
      and plan = 'trial';
  end if;

  v_days_remaining := greatest(
    0,
    ceil(extract(epoch from (v_plan.trial_ends_at - v_now)) / 86400.0)::integer
  );

  return jsonb_build_object(
    'status', v_status,
    'has_access', v_has_access,
    'is_pilot', v_status = 'pilot',
    'trial_started_at', v_plan.trial_started_at,
    'trial_ends_at', v_plan.trial_ends_at,
    'days_remaining', v_days_remaining,
    'ai_access', v_ai_access,
    'promo_code', v_plan.promo_code,
    'discount_percent', v_plan.discount_percent
  );
end;
$$;

grant execute on function public.check_trial_status(uuid) to authenticated;
