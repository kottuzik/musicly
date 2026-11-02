-- Milestone 6, step 1: structures for changing, cancelling and restoring lessons and series.
-- Types, columns, the teacher change-request table and a minimal audit log. No business functions
-- here; they follow in later migrations. Business errors elsewhere: errcode P0001 + stable key.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

-- Teacher-approval requests now also cover changing a lesson, changing a series from a date, and
-- restoring a cancelled lesson outside the teacher's availability.
alter type public.exception_request_kind add value if not exists 'lesson_change';
alter type public.exception_request_kind add value if not exists 'series_change';
alter type public.exception_request_kind add value if not exists 'restore';

-- Why a lesson is flagged "needs attention". A flag, not a status: the lesson stays where it is.
create type public.attention_reason as enum
  ('outside_hours', 'teacher_inactive', 'teacher_absent', 'availability_removed', 'series_change_conflict');

create type public.cancel_source as enum
  ('admin', 'teacher_request', 'student_inactive', 'series_stopped', 'closure_removed');

create type public.lesson_change_kind as enum ('cancel', 'change');

-- ---------------------------------------------------------------------------
-- Lessons: attention reason and cancellation details
-- ---------------------------------------------------------------------------

alter table public.lessons
  add column attention_reason public.attention_reason,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles (id) on delete set null,
  add column cancel_source public.cancel_source,
  add column cancel_reason text check (length(cancel_reason) <= 500),
  add constraint lessons_attention_consistent check (requires_attention = (attention_reason is not null));

create index lessons_cancelled_by_idx on public.lessons (cancelled_by);
create index lessons_attention_idx on public.lessons (start_at) where requires_attention;

-- ---------------------------------------------------------------------------
-- Approval requests: the target of a change, and the new state it asks for
-- ---------------------------------------------------------------------------

-- For the new kinds the existing columns (teacher, date, time, duration, location) describe the
-- state the request asks for; the target says what it changes.
alter table public.exception_booking_requests
  add column target_lesson_id uuid references public.lessons (id) on delete set null,
  add column target_series_id uuid references public.lesson_series (id) on delete set null,
  add column apply_from date;  -- series_change: first date the new pattern applies to

create index exception_requests_target_lesson_idx on public.exception_booking_requests (target_lesson_id);
create index exception_requests_target_series_idx on public.exception_booking_requests (target_series_id);

-- ---------------------------------------------------------------------------
-- Teacher requests to change or cancel one of their lessons
-- ---------------------------------------------------------------------------

create table public.lesson_change_requests (
  id                   uuid primary key default gen_random_uuid(),
  lesson_id            uuid not null references public.lessons (id) on delete cascade,
  teacher_id           uuid not null references public.teachers (id) on delete cascade,
  kind                 public.lesson_change_kind not null,
  proposed_date        date,
  proposed_start_time  time,
  reason               text check (length(reason) <= 500),
  status               public.request_status not null default 'pending',
  version              integer not null default 1,
  requested_by         uuid not null references public.profiles (id),
  decided_by           uuid references public.profiles (id),
  decided_at           timestamptz,
  decision_note        text check (length(decision_note) <= 500),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- A suggested new time is optional, but date and time come together.
  check ((proposed_date is null) = (proposed_start_time is null)),
  check (proposed_start_time is null or public.is_quarter_hour(proposed_start_time)),
  check (kind = 'change' or proposed_date is null)
);

create index lesson_change_requests_status_idx on public.lesson_change_requests (status, created_at);
create index lesson_change_requests_teacher_idx on public.lesson_change_requests (teacher_id, created_at desc);
create index lesson_change_requests_lesson_idx on public.lesson_change_requests (lesson_id);
create index lesson_change_requests_requested_by_idx on public.lesson_change_requests (requested_by);
create index lesson_change_requests_decided_by_idx on public.lesson_change_requests (decided_by);
-- One pending request per lesson.
create unique index lesson_change_requests_one_pending
on public.lesson_change_requests (lesson_id)
where status = 'pending';

create trigger lesson_change_requests_bump_version
before update on public.lesson_change_requests
for each row execute function public.bump_request_version();

-- ---------------------------------------------------------------------------
-- Audit log (minimal): ids, action and before/after values. No names or contact details
-- (ARCHITECTURE §5.3); names are looked up when the log is read.
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles (id) on delete set null,
  entity     text not null check (entity in
    ('lesson', 'series', 'closure', 'lesson_type', 'student', 'teacher', 'change_request')),
  entity_id  uuid not null,
  action     text not null check (length(action) <= 80),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_entity_idx on public.audit_events (entity, entity_id, created_at);
create index audit_events_created_idx on public.audit_events (created_at desc);
create index audit_events_actor_idx on public.audit_events (actor_id);

-- ---------------------------------------------------------------------------
-- Row-level security: read only; every write goes through functions
-- ---------------------------------------------------------------------------

alter table public.lesson_change_requests enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.lesson_change_requests, public.audit_events from anon, authenticated;
grant select on table public.lesson_change_requests, public.audit_events to authenticated;

create policy lesson_change_requests_select
on public.lesson_change_requests for select to authenticated
using ((select public.is_admin()) or teacher_id = (select public.current_teacher_id()));

create policy audit_events_select
on public.audit_events for select to authenticated
using ((select public.is_admin()));

alter publication supabase_realtime add table
  public.lesson_change_requests, public.audit_events;
