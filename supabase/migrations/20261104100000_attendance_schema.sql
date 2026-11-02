-- Milestone 7, step 1: attendance. One current report per lesson; the history of changes lives in
-- audit_events (statuses only, never the free-text note). Writes go through functions only.

create type public.attendance_status as enum ('held', 'student_absent', 'teacher_absent');

create table public.attendance (
  lesson_id   uuid primary key references public.lessons (id) on delete cascade,
  status      public.attendance_status not null,
  note        text check (note is null or length(note) <= 500),
  reported_by uuid references public.profiles (id) on delete set null,
  updated_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

create index attendance_status_idx on public.attendance (status);

create function public.attendance_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger attendance_touch
before update on public.attendance
for each row execute function public.attendance_touch();

alter table public.attendance enable row level security;

revoke all on table public.attendance from anon, authenticated;
grant select on table public.attendance to authenticated;

create policy attendance_select
on public.attendance for select to authenticated
using (
  (select public.is_admin())
  or lesson_id in (select id from public.lessons where teacher_id = (select public.current_teacher_id()))
);

alter publication supabase_realtime add table public.attendance;

-- A lesson that stops being "scheduled" (cancelled, closure day) is not a lesson that took place:
-- its attendance report is removed and the previous value is kept in the audit log. One trigger
-- covers every path (single cancel, series stop, inactive student, closure days).
create function public.attendance_on_lesson_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.attendance;
begin
  delete from public.attendance where lesson_id = new.id returning * into a;
  if found then
    perform public.log_event(
      'lesson', new.id,
      case when a.status = 'held' then 'held_lesson_cancelled' else 'attendance_cleared' end,
      jsonb_build_object('attendance_status', a.status, 'has_note', a.note is not null),
      jsonb_build_object('lesson_status', new.status));
  end if;
  return null;
end;
$$;

create trigger lessons_clear_attendance
after update of status on public.lessons
for each row
when (old.status = 'scheduled' and new.status <> 'scheduled')
execute function public.attendance_on_lesson_status();

revoke execute on function public.attendance_on_lesson_status(), public.attendance_touch()
from public, anon, authenticated;
