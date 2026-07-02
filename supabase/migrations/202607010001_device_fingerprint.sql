-- Trial-abuse prevention via device fingerprint.
--
-- The desktop app generates a stable per-machine ID (stored in its data dir)
-- and passes it to check_trial_status. The first trial started on a device is
-- recorded here; any LATER account on the same device inherits that original
-- trial clock instead of getting a fresh 4 days. Pilot/active accounts are
-- never clamped.

create table if not exists public.device_trials (
  device_id text primary key,
  first_user_id uuid not null references auth.users(id) on delete cascade,
  trial_ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.device_trials is
  'First trial recorded per machine. Later accounts on the same device inherit this trial clock.';

-- No user-facing policies: only the security-definer function below touches it.
alter table public.device_trials enable row level security;

-- Replace the 1-arg version to avoid overload ambiguity; the 2-arg version has
-- a default so old app builds calling with only p_user_id keep working.
drop function if exists public.check_trial_status(uuid);

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
  v_now timestamptz := now();
  v_days_remaining integer := 0;
  v_status text;
  v_has_access boolean := false;
  v_ai_access boolean := false;
begin
  if p_user_id is null then raise exception 'user_id_required'; end if;
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_uid <> p_user_id then raise exception 'not_authorized'; end if;

  insert into public.user_plans (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_plan from public.user_plans where user_id = p_user_id;

  -- Device fingerprint: register this device's first trial, and clamp a NEW
  -- account's trial to the device's original clock. Never touches pilots or
  -- paying accounts.
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
    v_status := 'pilot'; v_has_access := true; v_ai_access := false;
  elsif v_plan.plan = 'active' then
    v_status := 'active'; v_has_access := true;
  elsif v_now < v_plan.trial_ends_at then
    v_status := 'trial'; v_has_access := true; v_ai_access := false;
  else
    v_status := 'expired'; v_has_access := false; v_ai_access := false;
    update public.user_plans set plan = 'expired'
    where user_id = p_user_id and plan = 'trial';
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
    'promo_code', v_plan.promo_code,
    'discount_percent', v_plan.discount_percent
  );
end;
$$;

grant execute on function public.check_trial_status(uuid, text) to authenticated;
