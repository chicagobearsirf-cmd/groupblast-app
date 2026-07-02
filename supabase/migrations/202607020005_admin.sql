-- Admin dashboard support.
-- All admin reads use security-definer RPCs because the client cannot read
-- auth.users and should not bypass RLS directly.

alter table public.user_plans
  add column if not exists is_admin boolean not null default false;

insert into
  public.user_plans (user_id, is_admin)
select
  id,
  true
from
  auth.users
where
  id in (
    '0d216897-f95e-4a1a-97b8-a66bd7fccf39'::uuid,
    '1b5395be-0a4e-4b60-85f9-08d5059f61ab'::uuid
  )
on conflict (user_id) do update
set
  is_admin = true;

create or replace function public.admin_assert_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.user_plans
    where user_id = v_uid
      and is_admin = true
  ) then
    raise exception 'not_authorized';
  end if;
end;
$$;

-- check_trial_status: adds is_admin while preserving the current trial,
-- device clamp, promo, and content add-on fields.
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
    'is_admin', coalesce(v_plan.is_admin, false),
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

create or replace function public.admin_list_customers()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_assert_admin();

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'email', u.email,
        'plan', p.plan,
        'is_pilot', p.is_pilot,
        'is_admin', p.is_admin,
        'trial_started_at', p.trial_started_at,
        'trial_ends_at', p.trial_ends_at,
        'promo_code', p.promo_code,
        'discount_percent', p.discount_percent,
        'created_at', p.created_at
      )
      order by p.created_at desc
    )
    from public.user_plans p
    left join auth.users u on u.id = p.user_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_assert_admin();

  return (
    select jsonb_build_object(
      'total_users', count(*),
      'trialing', count(*) filter (where plan = 'trial' and now() < trial_ends_at),
      'active', count(*) filter (where plan = 'active'),
      'expired', count(*) filter (where plan = 'expired' or (plan = 'trial' and now() >= trial_ends_at)),
      'pilots', count(*) filter (where is_pilot = true or plan = 'pilot'),
      'admins', count(*) filter (where is_admin = true)
    )
    from public.user_plans
  );
end;
$$;

create or replace function public.admin_list_promo_codes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_assert_admin();

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'code', promo_rows.code,
        'affiliate_name', promo_rows.affiliate_name,
        'affiliate_contact', promo_rows.affiliate_contact,
        'discount_percent', promo_rows.discount_percent,
        'commission_percent', promo_rows.commission_percent,
        'paying_customers', promo_rows.paying_customers,
        'trialing_customers', promo_rows.trialing_customers
      )
      order by promo_rows.created_at asc
    )
    from (
      select
        pc.code,
        pc.affiliate_name,
        pc.affiliate_contact,
        pc.discount_percent,
        pc.commission_percent,
        pc.created_at,
        count(up.user_id) filter (where up.plan = 'active') as paying_customers,
        count(up.user_id) filter (where up.plan = 'trial' and now() < up.trial_ends_at) as trialing_customers
      from public.promo_codes pc
      left join public.user_plans up
        on regexp_replace(upper(coalesce(up.promo_code, '')), '[^A-Z0-9]', '', 'g')
         = regexp_replace(upper(pc.code), '[^A-Z0-9]', '', 'g')
      where coalesce(pc.commission_percent, 0) > 0
      group by pc.code, pc.affiliate_name, pc.affiliate_contact, pc.discount_percent,
        pc.commission_percent, pc.created_at
    ) promo_rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_promo_affiliate(
  p_code text,
  p_name text,
  p_contact text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  v_row public.promo_codes%rowtype;
begin
  perform public.admin_assert_admin();

  if v_code = '' then
    raise exception 'code_required';
  end if;

  update public.promo_codes
  set affiliate_name = nullif(trim(coalesce(p_name, '')), ''),
      affiliate_contact = nullif(trim(coalesce(p_contact, '')), '')
  where regexp_replace(upper(code), '[^A-Z0-9]', '', 'g') = v_code
  returning * into v_row;

  if not found then
    raise exception 'promo_not_found';
  end if;

  return jsonb_build_object(
    'code', v_row.code,
    'affiliate_name', v_row.affiliate_name,
    'affiliate_contact', v_row.affiliate_contact,
    'discount_percent', v_row.discount_percent,
    'commission_percent', v_row.commission_percent
  );
end;
$$;

grant execute on function public.check_trial_status(uuid, text) to authenticated;
grant execute on function public.admin_list_customers() to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_list_promo_codes() to authenticated;
grant execute on function public.admin_set_promo_affiliate(text, text, text) to authenticated;
