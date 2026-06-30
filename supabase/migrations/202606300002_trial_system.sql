-- To flag pilot users: UPDATE public.user_plans SET is_pilot = true, plan = 'pilot' WHERE user_id = '<uid>';

create table if not exists public.user_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '10 days'),
  is_pilot boolean not null default false,
  plan text not null default 'trial' check (plan in ('trial', 'active', 'expired', 'pilot')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_plans is
  'Server-owned trial and pilot access state. Users may only read their own row.';

alter table public.user_plans enable row level security;

drop policy if exists "users can read own plan" on public.user_plans;
create policy "users can read own plan"
  on public.user_plans for select
  using (auth.uid() = user_id);

create or replace function public.set_user_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_plans_set_updated_at on public.user_plans;
create trigger user_plans_set_updated_at
before update on public.user_plans
for each row execute function public.set_user_plans_updated_at();

create or replace function public.prevent_trial_started_at_change()
returns trigger
language plpgsql
as $$
begin
  if new.trial_started_at is distinct from old.trial_started_at then
    raise exception 'trial_started_at is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists user_plans_trial_started_at_immutable on public.user_plans;
create trigger user_plans_trial_started_at_immutable
before update on public.user_plans
for each row execute function public.prevent_trial_started_at_change();

create or replace function public.create_user_plan_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_plans (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_user_plan on auth.users;
create trigger on_auth_user_created_create_user_plan
after insert on auth.users
for each row execute function public.create_user_plan_for_new_user();

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
          limit 1
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
    'ai_access', v_ai_access
  );
end;
$$;

grant execute on function public.check_trial_status(uuid) to authenticated;
