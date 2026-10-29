-- Milestone 1: identity, roles and row-level security for user profiles.

create type public.user_role as enum ('super_admin', 'admin', 'teacher');
create type public.user_status as enum ('active', 'inactive');

-- One row per auth user. Rows are created only by trusted server code (secret key);
-- public sign-up is disabled, so an auth user without a profile has no access.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (length(trim(full_name)) > 0),
  email      text not null,
  phone      text,
  role       public.user_role not null,
  status     public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_status_idx on public.profiles (role, status);

-- Keep updated_at current.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Role of the calling user, or null when the account is missing or inactive.
create function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.status = 'active';
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('super_admin', 'admin'), false);
$$;

revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- There must always be at least one active Super Admin (PRD §2.1).
create function public.prevent_last_super_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  remaining integer;
begin
  if old.role = 'super_admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'super_admin' or new.status <> 'active') then
    select count(*) into remaining
    from public.profiles
    where role = 'super_admin' and status = 'active' and id <> old.id;

    if remaining = 0 then
      raise exception 'Cannot remove or demote the last active super admin'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_keep_super_admin
before update or delete on public.profiles
for each row execute function public.prevent_last_super_admin();

-- Row-level security: read-only access from the client API.
alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy profiles_select_admin
on public.profiles
for select
to authenticated
using ((select public.is_admin()));
