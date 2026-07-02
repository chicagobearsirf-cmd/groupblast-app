-- Automated Content add-on ($60/mo flat on top of the base plan).
--
-- To activate the add-on for a paying user:
--   insert into public.ai_entitlements (user_id, addon_active)
--   values ('<uid>', true)
--   on conflict (user_id) do update set addon_active = true;
-- To deactivate: update public.ai_entitlements set addon_active = false where user_id = '<uid>';
--
-- Generation limits are enforced server-side in the generate-content Edge
-- Function by counting ai_usage rows for the current calendar month. The
-- OpenAI key lives ONLY in Edge Function secrets, never in the client.

-- One row per account: the answers from the business-profile onboarding
-- wizard. Injected as hidden context into every generation so users never
-- write a prompt.
create table if not exists public.business_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null default '',
  business_type text not null default '',
  service_area text not null default '',
  target_customer text not null default '',
  tone text not null default '',
  offers text not null default '',
  differentiator text not null default '',
  never_say text not null default '',
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_profiles enable row level security;

drop policy if exists "users manage own business profile" on public.business_profiles;
create policy "users manage own business profile"
  on public.business_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists business_profiles_set_updated_at on public.business_profiles;
create trigger business_profiles_set_updated_at
before update on public.business_profiles
for each row execute function public.set_user_plans_updated_at();

-- Add-on entitlement + caps. Managed manually (SQL above) like base billing.
create table if not exists public.ai_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  addon_active boolean not null default false,
  monthly_generation_cap integer not null default 100,
  monthly_premium_cap integer not null default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_entitlements enable row level security;

drop policy if exists "users read own ai entitlement" on public.ai_entitlements;
create policy "users read own ai entitlement"
  on public.ai_entitlements for select
  using (auth.uid() = user_id);

drop trigger if exists ai_entitlements_set_updated_at on public.ai_entitlements;
create trigger ai_entitlements_set_updated_at
before update on public.ai_entitlements
for each row execute function public.set_user_plans_updated_at();

-- Append-only usage log; written only by the Edge Function (service role).
-- A "generation" for cap purposes = any row that produced an image.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('generate', 'regen_text', 'regen_image', 'tweak')),
  premium boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_month on public.ai_usage (user_id, created_at);

alter table public.ai_usage enable row level security;

drop policy if exists "users read own ai usage" on public.ai_usage;
create policy "users read own ai usage"
  on public.ai_usage for select
  using (auth.uid() = user_id);

-- Saved work-in-progress: caption + generated image, resumable any time.
create table if not exists public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null default '',
  goal text not null default '',
  caption text not null default '',
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_drafts_user on public.content_drafts (user_id, updated_at desc);

alter table public.content_drafts enable row level security;

drop policy if exists "users manage own drafts" on public.content_drafts;
create policy "users manage own drafts"
  on public.content_drafts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists content_drafts_set_updated_at on public.content_drafts;
create trigger content_drafts_set_updated_at
before update on public.content_drafts
for each row execute function public.set_user_plans_updated_at();

-- Public bucket for generated images: random UUID paths, nothing sensitive,
-- and public URLs render directly in <img> tags. Writes go through the
-- service role only.
insert into storage.buckets (id, name, public)
values ('generated-content', 'generated-content', true)
on conflict (id) do nothing;

-- check_trial_status: same behavior as 202607010001 (device clamping), plus
-- ai_access now reflects the per-user add-on entitlement for active AND pilot
-- accounts (pilots need it so Ian can test the feature on his own accounts).
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

  if v_status in ('active', 'pilot') then
    select exists (
      select 1 from public.ai_entitlements
      where user_id = p_user_id and addon_active
    ) into v_ai_access;
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
