-- Milestone 9, step 1: soft delete columns and guards (ADR-17).
-- A deleted student or teacher keeps its row for 30 days (restorable). After the purge the row stays
-- as a "tombstone": the name and the lessons that point at it, nothing else.

alter table public.students
  add column deleted_at    timestamptz,
  add column purge_after   timestamptz,
  add column deleted_by    uuid references public.profiles (id) on delete set null,
  add column anonymized_at timestamptz,
  add constraint students_deleted_pair check ((deleted_at is null) = (purge_after is null)),
  add constraint students_anonymized_deleted check (anonymized_at is null or deleted_at is not null);

alter table public.students alter column birth_date drop not null;
alter table public.students
  add constraint students_birth_date_required check (birth_date is not null or anonymized_at is not null);

alter table public.teachers
  add column deleted_at    timestamptz,
  add column purge_after   timestamptz,
  add column deleted_by    uuid references public.profiles (id) on delete set null,
  add column anonymized_at timestamptz,
  add constraint teachers_deleted_pair check ((deleted_at is null) = (purge_after is null)),
  add constraint teachers_anonymized_deleted check (anonymized_at is null or deleted_at is not null);

alter table public.teachers alter column email drop not null;
alter table public.teachers
  add constraint teachers_email_required check (email is not null or anonymized_at is not null);

create index students_purge_idx on public.students (purge_after) where deleted_at is not null and anonymized_at is null;
create index teachers_purge_idx on public.teachers (purge_after) where deleted_at is not null and anonymized_at is null;

alter table public.profiles add column deleted_at timestamptz;

-- A deleted account has no role at all: every policy and function that asks for the role refuses it.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.status = 'active'
    and p.deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Guards: nothing may change a deleted person, and nothing may point a new record at one.
-- The delete / restore / purge functions switch the guard off for their own transaction.
-- ---------------------------------------------------------------------------

create function public.person_maintenance_on()
returns void
language sql
set search_path = ''
as $$
  select set_config('app.person_maintenance', '1', true);
$$;

create function public.guard_deleted_person_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.person_maintenance', true), '') = '1' then
    return new;
  end if;
  if old.deleted_at is not null and new.deleted_at is not null then
    raise exception 'person_deleted' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger students_guard_deleted
before update on public.students
for each row execute function public.guard_deleted_person_row();

create trigger teachers_guard_deleted
before update on public.teachers
for each row execute function public.guard_deleted_person_row();

-- New or changed records may not point at a deleted student or teacher. TG_ARGV[0] = 'student' or
-- 'teacher' also blocks any update of rows that belong to that person; otherwise an update only
-- matters when the person it points at changes, so cancelling an old lesson of a deleted student
-- still works.
create function public.guard_deleted_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  j jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_student text := j ->> 'student_id';
  v_teacher text := coalesce(j ->> 'teacher_id', j ->> 'regular_teacher_id');
  v_old_student text := o ->> 'student_id';
  v_old_teacher text := coalesce(o ->> 'teacher_id', o ->> 'regular_teacher_id');
begin
  if coalesce(current_setting('app.person_maintenance', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if coalesce(tg_argv[0], '') <> 'student' and v_student is not distinct from v_old_student then v_student := null; end if;
    if coalesce(tg_argv[0], '') <> 'teacher' and v_teacher is not distinct from v_old_teacher then v_teacher := null; end if;
  end if;
  if v_student is not null
     and exists (select 1 from public.students s where s.id = v_student::uuid and s.deleted_at is not null) then
    raise exception 'person_deleted' using errcode = 'P0001';
  end if;
  if v_teacher is not null
     and exists (select 1 from public.teachers t where t.id = v_teacher::uuid and t.deleted_at is not null) then
    raise exception 'person_deleted' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger lessons_guard_deleted
before insert or update on public.lessons
for each row execute function public.guard_deleted_reference();

create trigger lesson_series_guard_deleted
before insert or update on public.lesson_series
for each row execute function public.guard_deleted_reference();

create trigger exception_booking_requests_guard_deleted
before insert on public.exception_booking_requests
for each row execute function public.guard_deleted_reference();

create trigger student_subjects_guard_deleted
before insert or update on public.student_subjects
for each row execute function public.guard_deleted_reference('student');

create trigger teacher_skills_guard_deleted
before insert or update on public.teacher_skills
for each row execute function public.guard_deleted_reference('teacher');

create trigger teacher_availability_guard_deleted
before insert or update on public.teacher_availability
for each row execute function public.guard_deleted_reference('teacher');

create trigger invitations_guard_deleted
before insert on public.invitations
for each row execute function public.guard_deleted_reference();

-- A teacher never sees a deleted student.
create or replace function public.is_my_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_subjects ss
    join public.students s on s.id = ss.student_id and s.deleted_at is null
    where ss.student_id = p_student_id
      and ss.regular_teacher_id = public.current_teacher_id()
  );
$$;
