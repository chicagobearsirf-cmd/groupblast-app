-- Lightweight in-app error reporting for the admin dashboard.
-- Clients may insert only their own privacy-safe summaries. Admin reads go
-- through security-definer RPCs so auth.users email can be joined centrally.

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (
    kind in (
      'crash',
      'post_fill_failed',
      'login_lost',
      'facebook_block',
      'api_error',
      'unhandled'
    )
  ),
  message text not null check (char_length(message) <= 500),
  context jsonb not null default '{}'::jsonb,
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);

create index if not exists app_errors_created_at_idx
  on public.app_errors (created_at desc);
create index if not exists app_errors_user_created_idx
  on public.app_errors (user_id, created_at desc);
create index if not exists app_errors_kind_created_idx
  on public.app_errors (kind, created_at desc);

alter table public.app_errors enable row level security;

drop policy if exists "Users insert their own app errors" on public.app_errors;
create policy "Users insert their own app errors"
on public.app_errors
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users do not read app errors directly" on public.app_errors;
create policy "Users do not read app errors directly"
on public.app_errors
for select
to authenticated
using (false);

create or replace function public.admin_list_errors(
  p_kind text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  perform public.admin_assert_admin();

  return jsonb_build_object(
    'rows',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', error_rows.id,
          'user_id', error_rows.user_id,
          'email', error_rows.email,
          'kind', error_rows.kind,
          'message', error_rows.message,
          'context', error_rows.context,
          'app_version', error_rows.app_version,
          'platform', error_rows.platform,
          'created_at', error_rows.created_at
        )
        order by error_rows.created_at desc
      )
      from (
        select
          e.id,
          e.user_id,
          u.email,
          e.kind,
          e.message,
          e.context,
          e.app_version,
          e.platform,
          e.created_at
        from public.app_errors e
        left join auth.users u on u.id = e.user_id
        where p_kind is null or e.kind = p_kind
        order by e.created_at desc
        limit v_limit
      ) error_rows
    ), '[]'::jsonb),
    'last_24h_count',
    (
      select count(*)
      from public.app_errors
      where created_at >= now() - interval '24 hours'
        and (p_kind is null or kind = p_kind)
    ),
    'last_24h_users',
    (
      select count(distinct user_id)
      from public.app_errors
      where created_at >= now() - interval '24 hours'
        and (p_kind is null or kind = p_kind)
    ),
    'by_kind',
    coalesce((
      select jsonb_object_agg(kind_counts.kind, kind_counts.count)
      from (
        select kind, count(*) as count
        from public.app_errors
        where created_at >= now() - interval '24 hours'
        group by kind
      ) kind_counts
    ), '{}'::jsonb)
  );
end;
$$;

grant insert on public.app_errors to authenticated;
grant execute on function public.admin_list_errors(text, integer) to authenticated;
