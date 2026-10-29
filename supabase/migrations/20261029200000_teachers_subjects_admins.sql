-- Milestone 2: lesson types, teachers and their skills, invitations, admin permissions.
-- Business errors are raised with errcode P0001 and a stable message key that the app maps to Hebrew.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.lesson_types (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(trim(name)) between 1 and 60),
  default_duration_minutes integer not null check (default_duration_minutes between 5 and 240),
  color                    text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create unique index lesson_types_name_key on public.lesson_types (lower(trim(name)));

-- A teacher exists before they register; profile_id is set when they accept their invitation.
create table public.teachers (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name  text not null check (length(trim(full_name)) > 0),
  email      text not null check (email = lower(email)),
  phone      text,
  status     public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index teachers_email_key on public.teachers (email);
create index teachers_status_idx on public.teachers (status);

-- Deleting a lesson type that teachers still teach is blocked by the restrict FK (PRD §4.1).
create table public.teacher_skills (
  teacher_id     uuid not null references public.teachers (id) on delete cascade,
  lesson_type_id uuid not null references public.lesson_types (id) on delete restrict,
  primary key (teacher_id, lesson_type_id)
);

create index teacher_skills_lesson_type_idx on public.teacher_skills (lesson_type_id);

-- Special permissions per admin; enforced from Milestone 9.
create table public.admin_permissions (
  profile_id             uuid primary key references public.profiles (id) on delete cascade,
  delete_student_history boolean not null default false,
  updated_at             timestamptz not null default now()
);

create type public.invitation_role as enum ('admin', 'teacher');

-- Only the SHA-256 hash of the registration token is stored.
create table public.invitations (
  id         uuid primary key default gen_random_uuid(),
  email      text not null check (email = lower(email)),
  full_name  text not null,
  role       public.invitation_role not null,
  teacher_id uuid references public.teachers (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check ((role = 'teacher') = (teacher_id is not null))
);

-- At most one open invitation per email address.
create unique index invitations_open_email_key on public.invitations (email)
  where used_at is null and revoked_at is null;

create trigger lesson_types_set_updated_at
before update on public.lesson_types
for each row execute function public.set_updated_at();

create trigger teachers_set_updated_at
before update on public.teachers
for each row execute function public.set_updated_at();

create trigger admin_permissions_set_updated_at
before update on public.admin_permissions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.lesson_types enable row level security;
alter table public.teachers enable row level security;
alter table public.teacher_skills enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.invitations enable row level security;

revoke all on table public.lesson_types, public.teachers, public.teacher_skills,
  public.admin_permissions, public.invitations from anon, authenticated;

grant select, insert, delete on table public.lesson_types to authenticated;
grant update (name, default_duration_minutes, color) on table public.lesson_types to authenticated;
grant select on table public.teachers, public.teacher_skills, public.admin_permissions to authenticated;
-- invitations: no client access at all.

-- Any user with a profile (including an inactive teacher) can read lesson type names.
create policy lesson_types_select
on public.lesson_types for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

create policy lesson_types_insert_admin
on public.lesson_types for insert to authenticated
with check ((select public.is_admin()));

create policy lesson_types_update_admin
on public.lesson_types for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy lesson_types_delete_admin
on public.lesson_types for delete to authenticated
using ((select public.is_admin()));

-- A teacher (even inactive) sees only their own row; admins see all.
create policy teachers_select
on public.teachers for select to authenticated
using ((select public.is_admin()) or profile_id = (select auth.uid()));

create policy teacher_skills_select
on public.teacher_skills for select to authenticated
using (
  (select public.is_admin())
  or teacher_id in (select t.id from public.teachers t where t.profile_id = (select auth.uid()))
);

create policy admin_permissions_select
on public.admin_permissions for select to authenticated
using ((select public.current_user_role()) = 'super_admin' or profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.require_admin()
returns public.user_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_user_role();
begin
  if v_role is null or v_role not in ('super_admin', 'admin') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return v_role;
end;
$$;

create function public.require_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'super_admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
end;
$$;

-- True when the address already belongs to an account, a teacher, or an auth user.
create function public.email_in_use(p_email text, p_except_teacher uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where lower(email) = p_email)
      or exists (select 1 from public.teachers where email = p_email
                 and id is distinct from p_except_teacher)
      or exists (select 1 from auth.users where lower(email) = p_email);
$$;

-- ---------------------------------------------------------------------------
-- Lesson types
-- ---------------------------------------------------------------------------

-- Least-used color from the app's palette (palette order breaks ties).
create function public.pick_lesson_type_color(p_palette text[])
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_color text;
begin
  perform public.require_admin();
  select p.c into v_color
  from unnest(p_palette) with ordinality as p (c, ord)
  order by (select count(*) from public.lesson_types lt where lower(lt.color) = lower(p.c)), p.ord
  limit 1;
  return v_color;
end;
$$;

-- ---------------------------------------------------------------------------
-- Teachers
-- ---------------------------------------------------------------------------

-- Creates (p_id null) or updates a teacher and replaces their lesson types, atomically.
create function public.save_teacher(
  p_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_lesson_type_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_email text := lower(trim(p_email));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_profile uuid;
  v_old_email text;
begin
  perform public.require_admin();

  if p_lesson_type_ids is null or cardinality(p_lesson_type_ids) = 0 then
    raise exception 'skills_required' using errcode = 'P0001';
  end if;

  if v_id is null then
    if public.email_in_use(v_email) then
      raise exception 'email_taken' using errcode = 'P0001';
    end if;
    insert into public.teachers (full_name, email, phone)
    values (trim(p_full_name), v_email, v_phone)
    returning id into v_id;
  else
    select profile_id, email into v_profile, v_old_email
    from public.teachers where id = v_id for update;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;

    if v_email <> v_old_email then
      if v_profile is not null then
        raise exception 'email_locked' using errcode = 'P0001';
      end if;
      if public.email_in_use(v_email, v_id) then
        raise exception 'email_taken' using errcode = 'P0001';
      end if;
      -- A link sent to the old address must stop working.
      update public.invitations set revoked_at = now()
      where teacher_id = v_id and used_at is null and revoked_at is null;
    end if;

    update public.teachers
    set full_name = trim(p_full_name), email = v_email, phone = v_phone
    where id = v_id;

    if v_profile is not null then
      update public.profiles set full_name = trim(p_full_name), phone = v_phone where id = v_profile;
    end if;
  end if;

  delete from public.teacher_skills
  where teacher_id = v_id and lesson_type_id <> all (p_lesson_type_ids);

  insert into public.teacher_skills (teacher_id, lesson_type_id)
  select v_id, unnest(p_lesson_type_ids)
  on conflict do nothing;

  return v_id;
end;
$$;

-- Changes a teacher's status together with their account status.
create function public.set_teacher_status(p_teacher_id uuid, p_status public.user_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  perform public.require_admin();

  update public.teachers set status = p_status where id = p_teacher_id
  returning profile_id into v_profile;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if v_profile is not null then
    update public.profiles set status = p_status where id = v_profile;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

-- Admins may invite teachers only; only the Super Admin may invite admins.
-- The token itself is generated by the server; only its hash reaches the database.
create function public.create_invitation(
  p_role public.invitation_role,
  p_teacher_id uuid,
  p_full_name text,
  p_email text,
  p_token_hash text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller public.user_role := public.require_admin();
  v_name text;
  v_email text;
  v_profile uuid;
  v_expires timestamptz := now() + interval '7 days';
begin
  if p_role = 'admin' and v_caller <> 'super_admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if p_role = 'teacher' then
    select full_name, email, profile_id into v_name, v_email, v_profile
    from public.teachers where id = p_teacher_id for update;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    if v_profile is not null
       or exists (select 1 from public.profiles where lower(email) = v_email)
       or exists (select 1 from auth.users where lower(email) = v_email) then
      raise exception 'already_registered' using errcode = 'P0001';
    end if;
  else
    v_name := trim(p_full_name);
    v_email := lower(trim(p_email));
    if v_name is null or v_name = '' or v_email is null or v_email = '' then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
    if public.email_in_use(v_email) then
      raise exception 'email_taken' using errcode = 'P0001';
    end if;
  end if;

  -- A new link replaces any earlier open link for the same address.
  update public.invitations set revoked_at = now()
  where email = v_email and used_at is null and revoked_at is null;

  insert into public.invitations (email, full_name, role, teacher_id, token_hash, expires_at, created_by)
  values (v_email, v_name, p_role, case when p_role = 'teacher' then p_teacher_id end,
          p_token_hash, v_expires, (select auth.uid()));

  return v_expires;
end;
$$;

create function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller public.user_role := public.require_admin();
  v_role public.invitation_role;
begin
  select role into v_role from public.invitations
  where id = p_invitation_id and used_at is null and revoked_at is null
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_role = 'admin' and v_caller <> 'super_admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.invitations set revoked_at = now() where id = p_invitation_id;
end;
$$;

-- Open (unused, not revoked) invitations, for admin screens. Never returns token hashes.
create function public.list_open_invitations()
returns table (
  id uuid,
  email text,
  full_name text,
  role public.invitation_role,
  teacher_id uuid,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select i.id, i.email, i.full_name, i.role, i.teacher_id, i.expires_at
    from public.invitations i
    where i.used_at is null and i.revoked_at is null
    order by i.created_at desc;
end;
$$;

-- Called by the server (secret key) after it created the auth user for the invitee.
-- The role always comes from the invitation, never from the client.
create function public.accept_invitation(p_token_hash text, p_user_id uuid)
returns public.user_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_teacher public.teachers;
  v_role public.user_role;
begin
  select * into v_inv from public.invitations where token_hash = p_token_hash for update;
  if not found or v_inv.used_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;

  if v_inv.role = 'teacher' then
    select * into v_teacher from public.teachers where id = v_inv.teacher_id for update;
    if not found or v_teacher.profile_id is not null then
      raise exception 'invitation_invalid' using errcode = 'P0001';
    end if;

    v_role := 'teacher';
    insert into public.profiles (id, full_name, email, phone, role, status)
    values (p_user_id, v_teacher.full_name, v_teacher.email, v_teacher.phone, v_role, v_teacher.status);
    update public.teachers set profile_id = p_user_id where id = v_teacher.id;
  else
    v_role := 'admin';
    insert into public.profiles (id, full_name, email, role, status)
    values (p_user_id, v_inv.full_name, v_inv.email, v_role, 'active');
    insert into public.admin_permissions (profile_id) values (p_user_id);
  end if;

  update public.invitations set used_at = now() where id = v_inv.id;
  return v_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin management (Super Admin only)
-- ---------------------------------------------------------------------------

-- "Removing" an admin deactivates the account; it can be reactivated later.
create function public.set_admin_status(p_profile_id uuid, p_status public.user_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  if p_profile_id = (select auth.uid()) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.profiles set status = p_status where id = p_profile_id and role = 'admin';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.set_admin_permissions(p_profile_id uuid, p_delete_student_history boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_super_admin();
  if not exists (select 1 from public.profiles where id = p_profile_id and role = 'admin') then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  insert into public.admin_permissions (profile_id, delete_student_history)
  values (p_profile_id, p_delete_student_history)
  on conflict (profile_id) do update set delete_student_history = excluded.delete_student_history;
end;
$$;

-- Hands the Super Admin role to an active admin; the caller becomes an admin.
create function public.transfer_super_admin(p_target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  perform public.require_super_admin();

  -- Promote first, so the "last super admin" trigger allows the caller's demotion.
  update public.profiles set role = 'super_admin'
  where id = p_target_profile_id and role = 'admin' and status = 'active';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  update public.profiles set role = 'admin' where id = v_caller;
  insert into public.admin_permissions (profile_id) values (v_caller) on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Own profile
-- ---------------------------------------------------------------------------

-- Active users may edit their own name and phone; role, status and email are untouched.
create function public.update_own_profile(p_full_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if public.current_user_role() is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_full_name is null or trim(p_full_name) = '' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  update public.profiles set full_name = trim(p_full_name), phone = v_phone where id = v_uid;
  update public.teachers set full_name = trim(p_full_name), phone = v_phone where profile_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.require_admin(),
  public.require_super_admin(),
  public.email_in_use(text, uuid),
  public.pick_lesson_type_color(text[]),
  public.save_teacher(uuid, text, text, text, uuid[]),
  public.set_teacher_status(uuid, public.user_status),
  public.create_invitation(public.invitation_role, uuid, text, text, text),
  public.revoke_invitation(uuid),
  public.list_open_invitations(),
  public.accept_invitation(text, uuid),
  public.set_admin_status(uuid, public.user_status),
  public.set_admin_permissions(uuid, boolean),
  public.transfer_super_admin(uuid),
  public.update_own_profile(text, text)
from public, anon, authenticated;

grant execute on function
  public.pick_lesson_type_color(text[]),
  public.save_teacher(uuid, text, text, text, uuid[]),
  public.set_teacher_status(uuid, public.user_status),
  public.create_invitation(public.invitation_role, uuid, text, text, text),
  public.revoke_invitation(uuid),
  public.list_open_invitations(),
  public.set_admin_status(uuid, public.user_status),
  public.set_admin_permissions(uuid, boolean),
  public.transfer_super_admin(uuid),
  public.update_own_profile(text, text)
to authenticated;

grant execute on function public.accept_invitation(text, uuid) to service_role;
