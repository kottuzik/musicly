-- Milestone 3: students, their contact details, and per-subject enrollment with a regular teacher.
-- Contact details live in their own table so teachers can never read them (ADR-9).
-- Business errors are raised with errcode P0001 and a stable message key that the app maps to Hebrew.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create type public.student_level as enum ('beginner', 'intermediate', 'advanced');
create type public.student_return_mode as enum ('notify', 'auto');

create table public.students (
  id                   uuid primary key default gen_random_uuid(),
  full_name            text not null check (length(trim(full_name)) between 2 and 100),
  birth_date           date not null check (birth_date > date '1900-01-01'),
  status               public.user_status not null default 'active',
  expected_return_date date,
  return_mode          public.student_return_mode,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- A return date always comes with an explicit choice, and only for inactive students.
  check ((expected_return_date is null) = (return_mode is null)),
  check (status = 'inactive' or expected_return_date is null)
);

create index students_name_idx on public.students (lower(full_name));
create index students_status_idx on public.students (status);

-- Admins only.
create table public.student_contacts (
  student_id   uuid primary key references public.students (id) on delete cascade,
  phone        text,
  email        text check (email = lower(email)),
  parent_name  text,
  parent_phone text,
  parent_email text check (parent_email = lower(parent_email)),
  updated_at   timestamptz not null default now()
);

create table public.student_subjects (
  id                      uuid primary key default gen_random_uuid(),
  student_id              uuid not null references public.students (id) on delete cascade,
  lesson_type_id          uuid not null references public.lesson_types (id) on delete restrict,
  regular_teacher_id      uuid not null references public.teachers (id) on delete restrict,
  level                   public.student_level not null,
  professional_background text check (length(professional_background) <= 2000),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (student_id, lesson_type_id)
);

create index student_subjects_teacher_idx on public.student_subjects (regular_teacher_id);
create index student_subjects_lesson_type_idx on public.student_subjects (lesson_type_id);

create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

create trigger student_contacts_set_updated_at
before update on public.student_contacts
for each row execute function public.set_updated_at();

create trigger student_subjects_set_updated_at
before update on public.student_subjects
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Teacher record of the calling user, only while they are an active teacher.
create function public.current_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from public.teachers t
  where t.profile_id = (select auth.uid())
    and public.current_user_role() = 'teacher';
$$;

-- Whether the calling (active) teacher is the regular teacher of the student in any subject.
-- A function, so the students/student_subjects policies do not recurse into each other.
create function public.is_my_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_subjects ss
    where ss.student_id = p_student_id
      and ss.regular_teacher_id = public.current_teacher_id()
  );
$$;

-- Teacher names only (no contact details), for showing who teaches a student's other subjects.
create function public.list_teacher_names()
returns table (id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return query select t.id, t.full_name from public.teachers t order by t.full_name;
end;
$$;

-- Today's date at the school.
create function public.school_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Jerusalem')::date;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.students enable row level security;
alter table public.student_contacts enable row level security;
alter table public.student_subjects enable row level security;

revoke all on table public.students, public.student_contacts, public.student_subjects from anon, authenticated;
grant select on table public.students, public.student_contacts, public.student_subjects to authenticated;

create policy students_select
on public.students for select to authenticated
using ((select public.is_admin()) or public.is_my_student(id));

create policy student_contacts_select_admin
on public.student_contacts for select to authenticated
using ((select public.is_admin()));

-- Teachers see every subject of their students (read-only for subjects they do not teach).
create policy student_subjects_select
on public.student_subjects for select to authenticated
using ((select public.is_admin()) or public.is_my_student(student_id));

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------

-- Creates (p_id null) or updates a student with their contact details.
create function public.save_student(
  p_id uuid,
  p_full_name text,
  p_birth_date date,
  p_phone text,
  p_email text,
  p_parent_name text,
  p_parent_phone text,
  p_parent_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
begin
  perform public.require_admin();

  if p_birth_date is null or p_birth_date > public.school_today() then
    raise exception 'birth_date_future' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.students (full_name, birth_date)
    values (trim(p_full_name), p_birth_date)
    returning id into v_id;
  else
    update public.students
    set full_name = trim(p_full_name), birth_date = p_birth_date
    where id = v_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
  end if;

  insert into public.student_contacts (student_id, phone, email, parent_name, parent_phone, parent_email)
  values (
    v_id,
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    nullif(trim(coalesce(p_parent_name, '')), ''),
    nullif(trim(coalesce(p_parent_phone, '')), ''),
    nullif(lower(trim(coalesce(p_parent_email, ''))), '')
  )
  on conflict (student_id) do update
  set phone = excluded.phone,
      email = excluded.email,
      parent_name = excluded.parent_name,
      parent_phone = excluded.parent_phone,
      parent_email = excluded.parent_email;

  return v_id;
end;
$$;

-- Active clears the return date. Inactive may set a future return date, which requires
-- an explicit notify/auto choice (no default, PRD §4.3). Cancelling future lessons comes in M6.
create function public.set_student_status(
  p_id uuid,
  p_status public.user_status,
  p_return_date date,
  p_return_mode public.student_return_mode
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  if p_status = 'active' then
    update public.students
    set status = 'active', expected_return_date = null, return_mode = null
    where id = p_id;
  else
    if p_return_date is null and p_return_mode is not null then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
    if p_return_date is not null then
      if p_return_date <= public.school_today() then
        raise exception 'return_date_past' using errcode = 'P0001';
      end if;
      if p_return_mode is null then
        raise exception 'return_mode_required' using errcode = 'P0001';
      end if;
    end if;
    update public.students
    set status = 'inactive', expected_return_date = p_return_date, return_mode = p_return_mode
    where id = p_id;
  end if;

  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- Creates (p_id null) or updates a student's enrollment in a subject.
create function public.save_student_subject(
  p_id uuid,
  p_student_id uuid,
  p_lesson_type_id uuid,
  p_teacher_id uuid,
  p_level public.student_level,
  p_background text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_lesson_type uuid := p_lesson_type_id;
  v_old_teacher uuid;
  v_background text := nullif(trim(coalesce(p_background, '')), '');
begin
  perform public.require_admin();

  if v_id is not null then
    -- The subject and student of an existing enrollment never change.
    select lesson_type_id, regular_teacher_id into v_lesson_type, v_old_teacher
    from public.student_subjects
    where id = v_id and student_id = p_student_id
    for update;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
  elsif not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.teacher_skills
    where teacher_id = p_teacher_id and lesson_type_id = v_lesson_type
  ) then
    raise exception 'teacher_not_qualified' using errcode = 'P0001';
  end if;

  -- An inactive teacher keeps existing enrollments but cannot be newly assigned (PRD §4.4).
  if p_teacher_id is distinct from v_old_teacher
     and not exists (select 1 from public.teachers where id = p_teacher_id and status = 'active') then
    raise exception 'teacher_inactive' using errcode = 'P0001';
  end if;

  if v_id is null then
    if exists (
      select 1 from public.student_subjects
      where student_id = p_student_id and lesson_type_id = v_lesson_type
    ) then
      raise exception 'subject_taken' using errcode = 'P0001';
    end if;
    insert into public.student_subjects (student_id, lesson_type_id, regular_teacher_id, level, professional_background)
    values (p_student_id, v_lesson_type, p_teacher_id, p_level, v_background)
    returning id into v_id;
  else
    update public.student_subjects
    set regular_teacher_id = p_teacher_id, level = p_level, professional_background = v_background
    where id = v_id;
  end if;

  return v_id;
end;
$$;

create function public.remove_student_subject(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  delete from public.student_subjects where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- Level and background only. Admins, or the active regular teacher of this enrollment.
create function public.update_professional_info(p_id uuid, p_level public.student_level, p_background text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher uuid;
begin
  select regular_teacher_id into v_teacher from public.student_subjects where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if not public.is_admin() and v_teacher is distinct from public.current_teacher_id() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.student_subjects
  set level = p_level, professional_background = nullif(trim(coalesce(p_background, '')), '')
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Milestone 2 change: a teacher cannot drop a subject they teach to a student.
-- ---------------------------------------------------------------------------

create or replace function public.save_teacher(
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

    if exists (
      select 1 from public.student_subjects ss
      where ss.regular_teacher_id = v_id and ss.lesson_type_id <> all (p_lesson_type_ids)
    ) then
      raise exception 'skill_in_use' using errcode = 'P0001';
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

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.current_teacher_id(),
  public.is_my_student(uuid),
  public.list_teacher_names(),
  public.school_today(),
  public.save_student(uuid, text, date, text, text, text, text, text),
  public.set_student_status(uuid, public.user_status, date, public.student_return_mode),
  public.save_student_subject(uuid, uuid, uuid, uuid, public.student_level, text),
  public.remove_student_subject(uuid),
  public.update_professional_info(uuid, public.student_level, text)
from public, anon, authenticated;

-- is_my_student / current_teacher_id are evaluated inside RLS policies, so the caller needs EXECUTE.
grant execute on function
  public.current_teacher_id(),
  public.is_my_student(uuid),
  public.list_teacher_names(),
  public.save_student(uuid, text, date, text, text, text, text, text),
  public.set_student_status(uuid, public.user_status, date, public.student_return_mode),
  public.save_student_subject(uuid, uuid, uuid, uuid, public.student_level, text),
  public.remove_student_subject(uuid),
  public.update_professional_info(uuid, public.student_level, text)
to authenticated;
