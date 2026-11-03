-- Milestone 8, step 1: notifications, preferences, reminders, the e-mail outbox and the job log.
-- Users only read their own rows; every write goes through functions (next migration). Notifications
-- are never deleted through the app: only marked read or archived.

create type public.notification_channel as enum ('in_app', 'in_app_email');
create type public.notification_category as enum ('activity', 'system');
create type public.email_status as enum ('pending', 'sending', 'sent', 'failed', 'skipped_test_mode');
create type public.reminder_mode as enum ('off', 'custom');

-- Reminder offsets in minutes before the lesson: up to 5 distinct values, 5 minutes to 7 days.
create function public.valid_reminder_offsets(p integer[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
    and coalesce(cardinality(p), 0) <= 5
    and not exists (select 1 from unnest(p) o where o is null or o < 5 or o > 10080)
    and coalesce(cardinality(p), 0) = (select count(distinct o) from unnest(p) o);
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

-- payload holds ids, times and the subject name only: never a student's name, contact details or
-- free text (ARCHITECTURE §5.3). Names are looked up when the list is read, per the reader's rights.
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null check (length(type) <= 60),
  category    public.notification_category not null,
  entity      text check (entity is null or length(entity) <= 40),
  entity_id   uuid,
  payload     jsonb not null default '{}'::jsonb,
  dedupe_key  text check (dedupe_key is null or length(dedupe_key) <= 200),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  archived_at timestamptz
);

create index notifications_user_idx on public.notifications (user_id, archived_at, read_at, created_at desc);
create unique index notifications_dedupe_key on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

create table public.notification_preferences (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  channel    public.notification_channel not null default 'in_app',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reminders (teachers only; off by default)
-- ---------------------------------------------------------------------------

create table public.reminder_preferences (
  teacher_id      uuid primary key references public.teachers (id) on delete cascade,
  enabled         boolean not null default false,
  offsets_minutes integer[] not null default '{}',
  updated_at      timestamptz not null default now(),
  check (public.valid_reminder_offsets(offsets_minutes)),
  check (not enabled or cardinality(offsets_minutes) >= 1)
);

-- A per-lesson override of the general preference: "off" for this lesson, or its own offsets.
create table public.lesson_reminder_overrides (
  lesson_id       uuid not null references public.lessons (id) on delete cascade,
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  mode            public.reminder_mode not null,
  offsets_minutes integer[] not null default '{}',
  updated_at      timestamptz not null default now(),
  primary key (lesson_id, teacher_id),
  check (public.valid_reminder_offsets(offsets_minutes)),
  check (mode = 'off' or cardinality(offsets_minutes) >= 1)
);

create index lesson_reminder_overrides_teacher_idx on public.lesson_reminder_overrides (teacher_id);

-- One row per reminder that was created: the unique key is what stops a second reminder for the
-- same teacher, lesson and offset, however often the job runs.
create table public.reminder_jobs (
  id             uuid primary key default gen_random_uuid(),
  lesson_id      uuid not null references public.lessons (id) on delete cascade,
  teacher_id     uuid not null references public.teachers (id) on delete cascade,
  offset_minutes integer not null,
  due_at         timestamptz not null,
  created_at     timestamptz not null default now(),
  unique (lesson_id, teacher_id, offset_minutes)
);

create index reminder_jobs_teacher_idx on public.reminder_jobs (teacher_id);

-- ---------------------------------------------------------------------------
-- E-mail outbox and job log (server only: no client access at all)
-- ---------------------------------------------------------------------------

create table public.email_outbox (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles (id) on delete set null,
  to_email        text not null,
  kind            text not null,
  payload         jsonb not null default '{}'::jsonb,
  notification_id uuid references public.notifications (id) on delete set null,
  dedupe_key      text not null unique,
  status          public.email_status not null default 'pending',
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  provider_id     text,
  last_error      text check (last_error is null or length(last_error) <= 300),
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index email_outbox_due_idx on public.email_outbox (status, next_attempt_at);
create index email_outbox_user_idx on public.email_outbox (user_id);
create index email_outbox_notification_idx on public.email_outbox (notification_id);

create table public.job_runs (
  id          bigint generated always as identity primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  ok          boolean not null,
  summary     jsonb not null default '{}'::jsonb
);

create index job_runs_job_idx on public.job_runs (job, started_at desc);

-- A student whose return date was only announced (mode "notify") must be announced once; changing
-- the date starts over.
alter table public.students add column return_notified_at timestamptz;

create function public.students_reset_return_notified()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.expected_return_date is distinct from old.expected_return_date then
    new.return_notified_at := null;
  end if;
  return new;
end;
$$;

create trigger students_reset_return_notified
before update on public.students
for each row execute function public.students_reset_return_notified();

-- ---------------------------------------------------------------------------
-- Row-level security: read own rows only; no direct writes, no deletes
-- ---------------------------------------------------------------------------

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.reminder_preferences enable row level security;
alter table public.lesson_reminder_overrides enable row level security;
alter table public.reminder_jobs enable row level security;
alter table public.email_outbox enable row level security;
alter table public.job_runs enable row level security;

revoke all on table
  public.notifications, public.notification_preferences, public.reminder_preferences,
  public.lesson_reminder_overrides, public.reminder_jobs, public.email_outbox, public.job_runs
from anon, authenticated;

grant select on table
  public.notifications, public.notification_preferences, public.reminder_preferences,
  public.lesson_reminder_overrides
to authenticated;

create policy notifications_select
on public.notifications for select to authenticated
using (user_id = (select auth.uid()));

create policy notification_preferences_select
on public.notification_preferences for select to authenticated
using (user_id = (select auth.uid()));

create policy reminder_preferences_select
on public.reminder_preferences for select to authenticated
using (teacher_id = (select public.current_teacher_id()));

create policy lesson_reminder_overrides_select
on public.lesson_reminder_overrides for select to authenticated
using (teacher_id = (select public.current_teacher_id()));

alter publication supabase_realtime add table public.notifications;
