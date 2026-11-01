-- Milestone 5: one-time lessons, weekly series, conflict-free scheduling and teacher approval for
-- bookings outside their availability. Lessons are stored as UTC instants; series keep the local
-- school weekday and wall-clock time (Asia/Jerusalem). Business errors: errcode P0001 + stable key.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.lesson_location as enum ('school', 'zoom');
create type public.lesson_status as enum ('scheduled', 'cancelled', 'closed_day');
create type public.series_status as enum ('active', 'ended');
create type public.exception_request_status as enum
  ('pending', 'approved', 'rejected', 'expired', 'cannot_schedule', 'cancelled');
create type public.exception_request_kind as enum ('single', 'series');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Requests to book a lesson (or a weekly series) outside the teacher's availability. A pending
-- request holds no time; approval re-checks everything (PRD §4.2).
create table public.exception_booking_requests (
  id               uuid primary key default gen_random_uuid(),
  kind             public.exception_request_kind not null,
  student_id       uuid not null references public.students (id) on delete restrict,
  lesson_type_id   uuid not null references public.lesson_types (id) on delete restrict,
  teacher_id       uuid not null references public.teachers (id) on delete restrict,
  location         public.lesson_location not null,
  start_date       date not null,  -- the lesson date, or the first date of the series
  start_time       time not null,
  duration_minutes integer not null check (duration_minutes between 5 and 240),
  end_date         date,           -- series only, optional
  first_start_at   timestamptz not null,
  outside_hours    boolean not null default false,
  status           public.exception_request_status not null default 'pending',
  version          integer not null default 1,
  requested_by     uuid not null references public.profiles (id),
  decided_by       uuid references public.profiles (id),
  decided_at       timestamptz,
  decision_note    text check (length(decision_note) <= 500),
  result_note      text check (length(result_note) <= 500),
  lesson_id        uuid,
  series_id        uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (kind = 'series' or end_date is null),
  check (end_date is null or end_date >= start_date)
);

-- Weekly template. Lessons are the real occurrences; the template never rewrites past lessons.
create table public.lesson_series (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references public.students (id) on delete restrict,
  lesson_type_id       uuid not null references public.lesson_types (id) on delete restrict,
  teacher_id           uuid not null references public.teachers (id) on delete restrict,
  day_of_week          smallint not null check (day_of_week between 0 and 6),
  start_time           time not null check (public.is_quarter_hour(start_time)),
  duration_minutes     integer not null check (duration_minutes between 5 and 240),
  location             public.lesson_location not null,
  start_date           date not null,
  end_date             date,
  generated_until      date not null,
  status               public.series_status not null default 'active',
  outside_hours        boolean not null default false,
  -- Set when the teacher approved the series outside their availability: later occurrences
  -- are generated without the availability check (their consent covers the whole series).
  exception_request_id uuid references public.exception_booking_requests (id) on delete set null,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (extract(dow from start_date)::smallint = day_of_week)
);

create table public.lessons (
  id                   uuid primary key default gen_random_uuid(),
  series_id            uuid references public.lesson_series (id) on delete restrict,
  occurrence_date      date not null,  -- local school date
  student_id           uuid not null references public.students (id) on delete restrict,
  lesson_type_id       uuid not null references public.lesson_types (id) on delete restrict,
  teacher_id           uuid not null references public.teachers (id) on delete restrict,
  start_at             timestamptz not null,
  end_at               timestamptz not null,
  location             public.lesson_location not null,
  status               public.lesson_status not null default 'scheduled',
  requires_attention   boolean not null default false,
  outside_hours        boolean not null default false,
  version              integer not null default 1,
  exception_request_id uuid references public.exception_booking_requests (id) on delete set null,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (end_at > start_at),
  unique (series_id, occurrence_date),
  -- No approved overlap for a teacher or a student; [start, end) lets lessons touch (ARCHITECTURE §3.2).
  constraint lessons_teacher_no_overlap exclude using gist (
    teacher_id with =, tstzrange(start_at, end_at, '[)') with &&
  ) where (status = 'scheduled'),
  constraint lessons_student_no_overlap exclude using gist (
    student_id with =, tstzrange(start_at, end_at, '[)') with &&
  ) where (status = 'scheduled')
);

alter table public.exception_booking_requests
  add constraint exception_booking_requests_lesson_fk foreign key (lesson_id) references public.lessons (id) on delete set null,
  add constraint exception_booking_requests_series_fk foreign key (series_id) references public.lesson_series (id) on delete set null;

create index lessons_teacher_start_idx on public.lessons (teacher_id, start_at);
create index lessons_student_start_idx on public.lessons (student_id, start_at);
create index lessons_series_idx on public.lessons (series_id);
create index lessons_status_start_idx on public.lessons (status, start_at);
create index lessons_lesson_type_idx on public.lessons (lesson_type_id);
create index lessons_occurrence_idx on public.lessons (occurrence_date) where status = 'scheduled';
create index lessons_exception_request_idx on public.lessons (exception_request_id);
create index lessons_created_by_idx on public.lessons (created_by);
create index lesson_series_student_idx on public.lesson_series (student_id, lesson_type_id);
create index lesson_series_teacher_idx on public.lesson_series (teacher_id);
create index lesson_series_lesson_type_idx on public.lesson_series (lesson_type_id);
create index lesson_series_exception_request_idx on public.lesson_series (exception_request_id);
create index lesson_series_created_by_idx on public.lesson_series (created_by);
create index exception_requests_status_idx on public.exception_booking_requests (status, first_start_at);
create index exception_requests_teacher_idx on public.exception_booking_requests (teacher_id, created_at desc);
create index exception_requests_student_idx on public.exception_booking_requests (student_id);
create index exception_requests_lesson_type_idx on public.exception_booking_requests (lesson_type_id);
create index exception_requests_requested_by_idx on public.exception_booking_requests (requested_by);
create index exception_requests_decided_by_idx on public.exception_booking_requests (decided_by);
create index exception_requests_lesson_idx on public.exception_booking_requests (lesson_id);
create index exception_requests_series_idx on public.exception_booking_requests (series_id);

create trigger lesson_series_set_updated_at
before update on public.lesson_series
for each row execute function public.set_updated_at();

-- Version bumps on every change (optimistic concurrency for later edits).
create trigger lessons_bump_version
before update on public.lessons
for each row execute function public.bump_request_version();

create trigger exception_booking_requests_bump_version
before update on public.exception_booking_requests
for each row execute function public.bump_request_version();

-- ---------------------------------------------------------------------------
-- Helpers (internal)
-- ---------------------------------------------------------------------------

-- Local school date + wall-clock time as an instant (resolves daylight saving time).
create function public.local_ts(p_date date, p_time time)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p_date + p_time) at time zone 'Asia/Jerusalem';
$$;

-- Whether the teacher's weekly slots valid on that date cover [p_start, p_end) — adjacent slots
-- merge — and, when asked, no approved absence overlaps it.
create function public.teacher_covers(
  p_teacher uuid, p_date date, p_start time, p_end time, p_include_absences boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slots tsmultirange;
begin
  select range_agg(tsrange(p_date + a.start_time, p_date + a.end_time, '[)')) into v_slots
  from public.teacher_availability a
  where a.teacher_id = p_teacher
    and a.day_of_week = extract(dow from p_date)::smallint
    and a.valid_from <= p_date
    and (a.valid_to is null or a.valid_to >= p_date);

  if v_slots is null or not v_slots @> tsrange(p_date + p_start, p_date + p_end, '[)') then
    return false;
  end if;

  if p_include_absences and exists (
    select 1 from public.teacher_absences ab
    where ab.teacher_id = p_teacher
      and p_date between ab.start_date and ab.end_date
      and (ab.start_time is null or (ab.start_time < p_end and ab.end_time > p_start))
  ) then
    return false;
  end if;

  return true;
end;
$$;

create function public.closure_on(p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.school_closures
    where status = 'active' and p_date between start_date and end_date
  );
$$;

-- 'teacher_busy' / 'student_busy' when an approved lesson overlaps, else null.
create function public.lesson_conflict(p_teacher uuid, p_student uuid, p_start timestamptz, p_end timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.lessons
      where teacher_id = p_teacher and status = 'scheduled' and start_at < p_end and end_at > p_start
    ) then 'teacher_busy'
    when exists (
      select 1 from public.lessons
      where student_id = p_student and status = 'scheduled' and start_at < p_end and end_at > p_start
    ) then 'student_busy'
  end;
$$;

-- Maps an exclusion violation on lessons (a concurrent booking) to a business error key.
create function public.overlap_error(p_constraint text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_constraint = 'lessons_student_no_overlap' then 'student_busy' else 'teacher_busy' end;
$$;

-- Shared booking checks: active student enrolled in the subject, an active teacher who teaches it
-- (the regular teacher for a series), a quarter-hour start and a duration that ends the same day.
create function public.check_booking(
  p_student uuid, p_lesson_type uuid, p_teacher uuid, p_start time, p_duration integer, p_series boolean
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_regular uuid;
begin
  if not exists (select 1 from public.students where id = p_student) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.students where id = p_student and status = 'active') then
    raise exception 'student_inactive' using errcode = 'P0001';
  end if;
  select regular_teacher_id into v_regular
  from public.student_subjects where student_id = p_student and lesson_type_id = p_lesson_type;
  if not found then
    raise exception 'subject_not_enrolled' using errcode = 'P0001';
  end if;
  if p_series and p_teacher is distinct from v_regular then
    raise exception 'teacher_not_regular' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teacher_skills where teacher_id = p_teacher and lesson_type_id = p_lesson_type) then
    raise exception 'teacher_not_qualified' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teachers where id = p_teacher and status = 'active') then
    raise exception 'teacher_inactive' using errcode = 'P0001';
  end if;
  if p_start is null or not public.is_quarter_hour(p_start) then
    raise exception 'invalid_time_step' using errcode = 'P0001';
  end if;
  if p_duration is null or p_duration not between 5 and 240
     or extract(epoch from p_start)::integer / 60 + p_duration >= 24 * 60 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
end;
$$;

-- Weekly occurrences of a meeting between two dates and what would happen to each:
-- scheduled, closed_day, past (silently skipped), or a problem (teacher_busy, student_busy,
-- teacher_unavailable) that is skipped and reported.
create function public.series_plan(
  p_teacher uuid, p_student uuid, p_day smallint, p_start time, p_duration integer,
  p_from date, p_until date, p_check_availability boolean
)
returns table (occurrence_date date, start_at timestamptz, end_at timestamptz, outcome text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_date date := p_from + ((p_day - extract(dow from p_from)::integer + 7) % 7);
  v_end time := p_start + make_interval(mins => p_duration);
begin
  while v_date <= p_until loop
    occurrence_date := v_date;
    start_at := public.local_ts(v_date, p_start);
    end_at := start_at + make_interval(mins => p_duration);
    outcome := case
      when start_at <= now() then 'past'
      when public.closure_on(v_date) then 'closed_day'
      else coalesce(
        public.lesson_conflict(p_teacher, p_student, start_at, end_at),
        case when p_check_availability and not public.teacher_covers(p_teacher, v_date, p_start, v_end, true)
             then 'teacher_unavailable' end,
        'scheduled')
    end;
    return next;
    v_date := v_date + 7;
  end loop;
end;
$$;

-- Last date occurrences are generated for: the end date, or 12 months ahead (rolling window).
create function public.series_window_end(p_end_date date)
returns date
language sql
stable
set search_path = ''
as $$
  select least(coalesce(p_end_date, 'infinity'::date), (public.school_today() + interval '12 months')::date);
$$;

-- Creates the missing occurrences of a series up to p_until. Returns the skipped problem dates
-- as [{"date": "...", "reason": "teacher_busy"}]. Reused by the rolling-window job (M8).
create function public.generate_series_occurrences(p_series_id uuid, p_until date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.lesson_series;
  p record;
  v_skipped jsonb := '[]'::jsonb;
  v_constraint text;
begin
  select * into s from public.lesson_series where id = p_series_id for update;
  if not found or p_until <= s.generated_until then
    return v_skipped;
  end if;

  for p in
    select * from public.series_plan(
      s.teacher_id, s.student_id, s.day_of_week, s.start_time, s.duration_minutes,
      greatest(s.start_date, s.generated_until + 1), least(p_until, coalesce(s.end_date, p_until)),
      s.exception_request_id is null)
  loop
    if p.outcome in ('scheduled', 'closed_day') then
      begin
        insert into public.lessons (
          series_id, occurrence_date, student_id, lesson_type_id, teacher_id, start_at, end_at,
          location, status, outside_hours, exception_request_id, created_by
        )
        values (
          s.id, p.occurrence_date, s.student_id, s.lesson_type_id, s.teacher_id, p.start_at, p.end_at,
          s.location, p.outcome::public.lesson_status, s.outside_hours, s.exception_request_id, s.created_by
        )
        on conflict (series_id, occurrence_date) do nothing;
      exception when exclusion_violation then
        get stacked diagnostics v_constraint = constraint_name;
        v_skipped := v_skipped || jsonb_build_object('date', p.occurrence_date, 'reason', public.overlap_error(v_constraint));
      end;
    elsif p.outcome <> 'past' then
      v_skipped := v_skipped || jsonb_build_object('date', p.occurrence_date, 'reason', p.outcome);
    end if;
  end loop;

  update public.lesson_series set generated_until = p_until where id = s.id;
  return v_skipped;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.lesson_series enable row level security;
alter table public.lessons enable row level security;
alter table public.exception_booking_requests enable row level security;

revoke all on table public.lesson_series, public.lessons, public.exception_booking_requests from anon, authenticated;
grant select on table public.lesson_series, public.lessons, public.exception_booking_requests to authenticated;

create policy lesson_series_select
on public.lesson_series for select to authenticated
using ((select public.is_admin()) or teacher_id = (select public.current_teacher_id()));

create policy lessons_select
on public.lessons for select to authenticated
using ((select public.is_admin()) or teacher_id = (select public.current_teacher_id()));

create policy exception_booking_requests_select
on public.exception_booking_requests for select to authenticated
using ((select public.is_admin()) or teacher_id = (select public.current_teacher_id()));

alter publication supabase_realtime add table
  public.lessons, public.lesson_series, public.exception_booking_requests;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------

-- Pending requests whose (first) lesson time has passed close as expired. Idempotent; runs
-- before request screens load and before decisions (Cron scheduling comes with M8).
create function public.expire_exception_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.exception_booking_requests
  set status = 'expired', result_note = 'מועד השיעור עבר לפני שהתקבלה תשובה'
  where status = 'pending' and first_start_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- One-time lesson. Admins only. Returns {"result": "lesson", "id"} or, outside the teacher's
-- availability, {"result": "request", "id"} — a pending request that holds no time.
create function public.book_lesson(
  p_student_id uuid,
  p_lesson_type_id uuid,
  p_teacher_id uuid,
  p_date date,
  p_start_time time,
  p_duration integer,
  p_location public.lesson_location,
  p_confirm_outside_hours boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_end_time time;
  v_outside boolean;
  v_conflict text;
  v_constraint text;
  v_id uuid;
begin
  perform public.require_admin();
  perform public.check_booking(p_student_id, p_lesson_type_id, p_teacher_id, p_start_time, p_duration, false);
  if p_date is null or p_location is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  v_start := public.local_ts(p_date, p_start_time);
  v_end := v_start + make_interval(mins => p_duration);
  v_end_time := p_start_time + make_interval(mins => p_duration);
  if v_start <= now() then
    raise exception 'date_past' using errcode = 'P0001';
  end if;
  if public.closure_on(p_date) then
    raise exception 'closed_day' using errcode = 'P0001';
  end if;
  v_conflict := public.lesson_conflict(p_teacher_id, p_student_id, v_start, v_end);
  if v_conflict is not null then
    raise exception '%', v_conflict using errcode = 'P0001';
  end if;

  v_outside := not public.within_operating_hours(extract(dow from p_date)::smallint, p_start_time, v_end_time);
  if v_outside and not coalesce(p_confirm_outside_hours, false) then
    raise exception 'outside_hours_confirm_required' using errcode = 'P0001';
  end if;

  if not public.teacher_covers(p_teacher_id, p_date, p_start_time, v_end_time, true) then
    insert into public.exception_booking_requests (
      kind, student_id, lesson_type_id, teacher_id, location, start_date, start_time,
      duration_minutes, first_start_at, outside_hours, requested_by
    )
    values (
      'single', p_student_id, p_lesson_type_id, p_teacher_id, p_location, p_date, p_start_time,
      p_duration, v_start, v_outside, (select auth.uid())
    )
    returning id into v_id;
    return jsonb_build_object('result', 'request', 'id', v_id);
  end if;

  begin
    insert into public.lessons (
      occurrence_date, student_id, lesson_type_id, teacher_id, start_at, end_at, location,
      outside_hours, created_by
    )
    values (
      p_date, p_student_id, p_lesson_type_id, p_teacher_id, v_start, v_end, p_location,
      v_outside, (select auth.uid())
    )
    returning id into v_id;
  exception when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    raise exception '%', public.overlap_error(v_constraint) using errcode = 'P0001';
  end;

  return jsonb_build_object('result', 'lesson', 'id', v_id);
end;
$$;

-- What creating a series would do, per weekly meeting, without writing anything.
-- p_meetings: [{"day": 1, "start": "16:00"}, ...]. Admins only.
create function public.preview_series(
  p_student_id uuid,
  p_lesson_type_id uuid,
  p_meetings jsonb,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_teacher uuid;
  v_duration integer;
  m jsonb;
  v_day smallint;
  v_start time;
  v_first date;
  v_needs_request boolean;
  v_result jsonb := '[]'::jsonb;
begin
  perform public.require_admin();
  select ss.regular_teacher_id, lt.default_duration_minutes into v_teacher, v_duration
  from public.student_subjects ss join public.lesson_types lt on lt.id = ss.lesson_type_id
  where ss.student_id = p_student_id and ss.lesson_type_id = p_lesson_type_id;
  if not found then
    raise exception 'subject_not_enrolled' using errcode = 'P0001';
  end if;
  if p_start_date is null or p_start_date < public.school_today()
     or (p_end_date is not null and p_end_date < p_start_date)
     or jsonb_typeof(p_meetings) is distinct from 'array' or jsonb_array_length(p_meetings) = 0 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  for m in select * from jsonb_array_elements(p_meetings) loop
    v_day := (m ->> 'day')::smallint;
    v_start := (m ->> 'start')::time;
    perform public.check_booking(p_student_id, p_lesson_type_id, v_teacher, v_start, v_duration, true);
    v_first := p_start_date + ((v_day - extract(dow from p_start_date)::integer + 7) % 7);
    if p_end_date is not null and v_first > p_end_date then
      raise exception 'no_occurrences' using errcode = 'P0001';
    end if;
    v_needs_request := not public.teacher_covers(v_teacher, v_first, v_start, v_start + make_interval(mins => v_duration), false);

    v_result := v_result || jsonb_build_object(
      'day', v_day,
      'start', to_char(v_start, 'HH24:MI'),
      'first_date', v_first,
      'outside_hours', not public.within_operating_hours(v_day, v_start, v_start + make_interval(mins => v_duration)),
      'needs_request', v_needs_request,
      'scheduled', (select count(*) from public.series_plan(v_teacher, p_student_id, v_day, v_start, v_duration,
                      v_first, public.series_window_end(p_end_date), not v_needs_request) where outcome = 'scheduled'),
      'closed_dates', coalesce((select jsonb_agg(occurrence_date) from public.series_plan(v_teacher, p_student_id, v_day,
                      v_start, v_duration, v_first, public.series_window_end(p_end_date), not v_needs_request)
                      where outcome = 'closed_day'), '[]'::jsonb),
      'skipped', coalesce((select jsonb_agg(jsonb_build_object('date', occurrence_date, 'reason', outcome))
                      from public.series_plan(v_teacher, p_student_id, v_day, v_start, v_duration, v_first,
                      public.series_window_end(p_end_date), not v_needs_request)
                      where outcome not in ('scheduled', 'closed_day', 'past')), '[]'::jsonb)
    );
  end loop;

  return v_result;
end;
$$;

-- Creates one weekly series per meeting with the student's regular teacher and the subject's
-- default duration, atomically. Problem weeks are skipped and reported (user decision, ADR-13);
-- a meeting outside the teacher's weekly availability becomes one request for the whole series.
create function public.create_series(
  p_student_id uuid,
  p_lesson_type_id uuid,
  p_meetings jsonb,
  p_start_date date,
  p_end_date date,
  p_location public.lesson_location,
  p_confirm_outside_hours boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher uuid;
  v_duration integer;
  m jsonb;
  v_day smallint;
  v_start time;
  v_end time;
  v_first date;
  v_outside boolean;
  v_id uuid;
  v_skipped jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  perform public.require_admin();
  if p_location is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- Validates everything (and the outside-hours confirmation) before writing.
  for m in select * from jsonb_array_elements(public.preview_series(p_student_id, p_lesson_type_id, p_meetings, p_start_date, p_end_date)) loop
    if (m ->> 'outside_hours')::boolean and not coalesce(p_confirm_outside_hours, false) then
      raise exception 'outside_hours_confirm_required' using errcode = 'P0001';
    end if;
  end loop;

  select ss.regular_teacher_id, lt.default_duration_minutes into v_teacher, v_duration
  from public.student_subjects ss join public.lesson_types lt on lt.id = ss.lesson_type_id
  where ss.student_id = p_student_id and ss.lesson_type_id = p_lesson_type_id;

  for m in select * from jsonb_array_elements(p_meetings) loop
    v_day := (m ->> 'day')::smallint;
    v_start := (m ->> 'start')::time;
    v_end := v_start + make_interval(mins => v_duration);
    v_first := p_start_date + ((v_day - extract(dow from p_start_date)::integer + 7) % 7);
    v_outside := not public.within_operating_hours(v_day, v_start, v_end);

    if not public.teacher_covers(v_teacher, v_first, v_start, v_end, false) then
      insert into public.exception_booking_requests (
        kind, student_id, lesson_type_id, teacher_id, location, start_date, start_time,
        duration_minutes, end_date, first_start_at, outside_hours, requested_by
      )
      values (
        'series', p_student_id, p_lesson_type_id, v_teacher, p_location, v_first, v_start,
        v_duration, p_end_date, public.local_ts(v_first, v_start), v_outside, (select auth.uid())
      )
      returning id into v_id;
      v_result := v_result || jsonb_build_object(
        'day', v_day, 'start', to_char(v_start, 'HH24:MI'), 'result', 'request', 'id', v_id);
    else
      insert into public.lesson_series (
        student_id, lesson_type_id, teacher_id, day_of_week, start_time, duration_minutes, location,
        start_date, end_date, generated_until, outside_hours, created_by
      )
      values (
        p_student_id, p_lesson_type_id, v_teacher, v_day, v_start, v_duration, p_location,
        v_first, p_end_date, v_first - 1, v_outside, (select auth.uid())
      )
      returning id into v_id;
      v_skipped := public.generate_series_occurrences(v_id, public.series_window_end(p_end_date));
      v_result := v_result || jsonb_build_object(
        'day', v_day, 'start', to_char(v_start, 'HH24:MI'), 'result', 'series', 'id', v_id,
        'created', (select count(*) from public.lessons where series_id = v_id and status = 'scheduled'),
        'skipped', v_skipped);
    end if;
  end loop;

  return v_result;
end;
$$;

-- The requested teacher approves or rejects. Approval re-checks the time: if it was taken (or the
-- student/day is no longer available) the request closes as cannot_schedule (PRD §4.2).
create function public.respond_exception_request(p_id uuid, p_version integer, p_approve boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.exception_booking_requests;
  v_end timestamptz;
  v_problem text;
  v_constraint text;
  v_lesson uuid;
  v_series uuid;
  v_skipped jsonb;
begin
  perform public.expire_exception_requests();

  select * into r from public.exception_booking_requests where id = p_id for update;
  if not found or r.teacher_id is distinct from public.current_teacher_id() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if r.status <> 'pending' or r.version <> p_version then
    raise exception 'request_already_handled' using errcode = 'P0001';
  end if;

  if not p_approve then
    update public.exception_booking_requests
    set status = 'rejected', decided_by = (select auth.uid()), decided_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), '')
    where id = r.id;
    return jsonb_build_object('result', 'rejected');
  end if;

  v_end := r.first_start_at + make_interval(mins => r.duration_minutes);
  if not exists (select 1 from public.students where id = r.student_id and status = 'active') then
    v_problem := 'התלמיד אינו פעיל';
  elsif not exists (select 1 from public.student_subjects where student_id = r.student_id and lesson_type_id = r.lesson_type_id) then
    v_problem := 'התלמיד כבר אינו רשום לתחום';
  elsif r.kind = 'single' and public.closure_on(r.start_date) then
    v_problem := 'המועד חל ביום סגירה';
  elsif public.lesson_conflict(r.teacher_id, r.student_id, r.first_start_at, v_end) = 'teacher_busy' then
    v_problem := 'המועד כבר תפוס אצל המורה';
  elsif public.lesson_conflict(r.teacher_id, r.student_id, r.first_start_at, v_end) = 'student_busy' then
    v_problem := 'המועד כבר תפוס אצל התלמיד';
  end if;

  if v_problem is null then
    begin
      if r.kind = 'single' then
        insert into public.lessons (
          occurrence_date, student_id, lesson_type_id, teacher_id, start_at, end_at, location,
          outside_hours, exception_request_id, created_by
        )
        values (
          r.start_date, r.student_id, r.lesson_type_id, r.teacher_id, r.first_start_at, v_end, r.location,
          r.outside_hours, r.id, r.requested_by
        )
        returning id into v_lesson;
      else
        insert into public.lesson_series (
          student_id, lesson_type_id, teacher_id, day_of_week, start_time, duration_minutes, location,
          start_date, end_date, generated_until, outside_hours, exception_request_id, created_by
        )
        values (
          r.student_id, r.lesson_type_id, r.teacher_id, extract(dow from r.start_date)::smallint, r.start_time,
          r.duration_minutes, r.location, r.start_date, r.end_date, r.start_date - 1, r.outside_hours, r.id,
          r.requested_by
        )
        returning id into v_series;
        v_skipped := public.generate_series_occurrences(v_series, public.series_window_end(r.end_date));
      end if;
    exception when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      v_problem := case when public.overlap_error(v_constraint) = 'student_busy'
                        then 'המועד כבר תפוס אצל התלמיד' else 'המועד כבר תפוס אצל המורה' end;
    end;
  end if;

  if v_problem is not null then
    update public.exception_booking_requests
    set status = 'cannot_schedule', decided_by = (select auth.uid()), decided_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), ''), result_note = v_problem
    where id = r.id;
    return jsonb_build_object('result', 'cannot_schedule', 'reason', v_problem);
  end if;

  update public.exception_booking_requests
  set status = 'approved', decided_by = (select auth.uid()), decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), ''), lesson_id = v_lesson, series_id = v_series,
      result_note = case when jsonb_array_length(coalesce(v_skipped, '[]'::jsonb)) > 0
                         then 'חלק מהמפגשים לא נוצרו בגלל התנגשות' end
  where id = r.id;
  return jsonb_build_object('result', 'approved', 'skipped', coalesce(v_skipped, '[]'::jsonb));
end;
$$;

-- An admin withdraws a request that is still pending.
create function public.cancel_exception_request(p_id uuid, p_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  perform public.expire_exception_requests();
  update public.exception_booking_requests
  set status = 'cancelled', decided_by = (select auth.uid()), decided_at = now()
  where id = p_id and status = 'pending' and version = p_version;
  if not found then
    raise exception 'request_already_handled' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads with names (a substitute teacher sees the student's name, never contact details — ADR-9)
-- ---------------------------------------------------------------------------

create function public.list_calendar_lessons(
  p_from timestamptz,
  p_to timestamptz,
  p_teacher_id uuid,
  p_student_id uuid,
  p_lesson_type_id uuid,
  p_include_cancelled boolean
)
returns table (
  id uuid, series_id uuid, start_at timestamptz, end_at timestamptz, status public.lesson_status,
  location public.lesson_location, requires_attention boolean, student_id uuid, student_name text,
  teacher_id uuid, teacher_name text, lesson_type_id uuid, lesson_type_name text, color text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_teacher uuid := p_teacher_id;
begin
  if v_role is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_role = 'teacher' then
    v_teacher := public.current_teacher_id();
  end if;

  return query
  select l.id, l.series_id, l.start_at, l.end_at, l.status, l.location, l.requires_attention,
         l.student_id, s.full_name, l.teacher_id, t.full_name, l.lesson_type_id, lt.name, lt.color
  from public.lessons l
  join public.students s on s.id = l.student_id
  join public.teachers t on t.id = l.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  where l.start_at < p_to and l.end_at > p_from
    and (v_teacher is null or l.teacher_id = v_teacher)
    and (p_student_id is null or l.student_id = p_student_id)
    and (p_lesson_type_id is null or l.lesson_type_id = p_lesson_type_id)
    and (coalesce(p_include_cancelled, false) or l.status <> 'cancelled')
  order by l.start_at;
end;
$$;

create function public.get_lesson(p_id uuid)
returns table (
  id uuid, series_id uuid, start_at timestamptz, end_at timestamptz, status public.lesson_status,
  location public.lesson_location, outside_hours boolean, student_id uuid, student_name text,
  teacher_id uuid, teacher_name text, is_substitute boolean, lesson_type_name text, color text,
  series_day smallint, series_start_time time, series_end_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_user_role();
begin
  if v_role is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select l.id, l.series_id, l.start_at, l.end_at, l.status, l.location, l.outside_hours,
         l.student_id, s.full_name, l.teacher_id, t.full_name,
         coalesce(ss.regular_teacher_id is distinct from l.teacher_id, false), lt.name, lt.color,
         ls.day_of_week, ls.start_time, ls.end_date
  from public.lessons l
  join public.students s on s.id = l.student_id
  join public.teachers t on t.id = l.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  left join public.student_subjects ss on ss.student_id = l.student_id and ss.lesson_type_id = l.lesson_type_id
  left join public.lesson_series ls on ls.id = l.series_id
  where l.id = p_id
    and (v_role <> 'teacher' or l.teacher_id = public.current_teacher_id());
end;
$$;

create function public.list_exception_requests(p_pending_only boolean)
returns table (
  id uuid, kind public.exception_request_kind, status public.exception_request_status, version integer,
  student_name text, teacher_id uuid, teacher_name text, lesson_type_name text, color text,
  location public.lesson_location, start_date date, start_time time, duration_minutes integer,
  end_date date, outside_hours boolean, decision_note text, result_note text,
  created_at timestamptz, decided_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_user_role();
begin
  if v_role is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query
  select r.id, r.kind, r.status, r.version, s.full_name, r.teacher_id, t.full_name, lt.name, lt.color,
         r.location, r.start_date, r.start_time, r.duration_minutes, r.end_date, r.outside_hours,
         r.decision_note, r.result_note, r.created_at, r.decided_at
  from public.exception_booking_requests r
  join public.students s on s.id = r.student_id
  join public.teachers t on t.id = r.teacher_id
  join public.lesson_types lt on lt.id = r.lesson_type_id
  where (v_role <> 'teacher' or r.teacher_id = public.current_teacher_id())
    and (not coalesce(p_pending_only, false) or r.status = 'pending')
  order by case when r.status = 'pending' then 0 else 1 end, r.first_start_at
  limit 200;
end;
$$;

-- ---------------------------------------------------------------------------
-- Changes to earlier functions
-- ---------------------------------------------------------------------------

-- Lessons on a new closure day are marked "not held" automatically (PRD §4.6).
create or replace function public.save_closure(p_name text, p_start_date date, p_end_date date, p_holiday_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_key text := nullif(trim(coalesce(p_holiday_key, '')), '');
begin
  perform public.require_admin();

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  begin
    insert into public.school_closures (name, start_date, end_date, source, holiday_key, created_by)
    values (
      trim(p_name), p_start_date, p_end_date,
      case when v_key is null then 'custom'::public.closure_source else 'holiday'::public.closure_source end,
      v_key, (select auth.uid())
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'closure_exists' using errcode = 'P0001';
    when check_violation then
      raise exception 'invalid_input' using errcode = 'P0001';
  end;

  update public.lessons
  set status = 'closed_day'
  where status = 'scheduled' and occurrence_date between p_start_date and p_end_date;

  return v_id;
end;
$$;

-- Whether a student has upcoming lessons or an ongoing series in a subject.
create function public.subject_has_lessons(p_student uuid, p_lesson_type uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lessons
    where student_id = p_student and lesson_type_id = p_lesson_type and status = 'scheduled' and end_at > now()
  ) or exists (
    select 1 from public.lesson_series
    where student_id = p_student and lesson_type_id = p_lesson_type and status = 'active'
      and (end_date is null or end_date >= public.school_today())
  ) or exists (
    select 1 from public.exception_booking_requests
    where student_id = p_student and lesson_type_id = p_lesson_type and status = 'pending'
  );
$$;

create or replace function public.remove_student_subject(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ss public.student_subjects;
begin
  perform public.require_admin();
  select * into ss from public.student_subjects where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if public.subject_has_lessons(ss.student_id, ss.lesson_type_id) then
    raise exception 'subject_has_lessons' using errcode = 'P0001';
  end if;
  delete from public.student_subjects where id = p_id;
end;
$$;

-- Same as M3, plus: the regular teacher cannot change while lessons are planned (moving a series
-- to another teacher comes with M6).
create or replace function public.save_student_subject(
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

  if v_id is not null and p_teacher_id is distinct from v_old_teacher
     and public.subject_has_lessons(p_student_id, v_lesson_type) then
    raise exception 'regular_teacher_has_lessons' using errcode = 'P0001';
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

-- ---------------------------------------------------------------------------
-- Deleting a lesson type together with its teacher assignments (M2 improvement)
-- ---------------------------------------------------------------------------

-- What blocks deleting a lesson type, and which teachers it would be removed from.
create function public.lesson_type_delete_info(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.lesson_types where id = p_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'students', (select count(*) from public.student_subjects where lesson_type_id = p_id),
    'lessons', (select count(*) from public.lessons where lesson_type_id = p_id)
             + (select count(*) from public.lesson_series where lesson_type_id = p_id)
             + (select count(*) from public.exception_booking_requests where lesson_type_id = p_id),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.full_name,
        'only_skill', not exists (
          select 1 from public.teacher_skills o where o.teacher_id = t.id and o.lesson_type_id <> p_id)
      ) order by t.full_name)
      from public.teacher_skills ts join public.teachers t on t.id = ts.teacher_id
      where ts.lesson_type_id = p_id
    ), '[]'::jsonb)
  );
end;
$$;

create function public.delete_lesson_type(p_id uuid, p_remove_from_teachers boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_info jsonb;
begin
  perform public.require_admin();
  perform 1 from public.lesson_types where id = p_id for update;
  v_info := public.lesson_type_delete_info(p_id);

  if (v_info ->> 'students')::integer > 0 then
    raise exception 'lesson_type_has_students' using errcode = 'P0001';
  end if;
  if (v_info ->> 'lessons')::integer > 0 then
    raise exception 'lesson_type_has_lessons' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(v_info -> 'teachers') t where (t ->> 'only_skill')::boolean) then
    raise exception 'lesson_type_only_skill' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_info -> 'teachers') > 0 and not coalesce(p_remove_from_teachers, false) then
    raise exception 'lesson_type_has_teachers' using errcode = 'P0001';
  end if;

  delete from public.teacher_skills where lesson_type_id = p_id;
  delete from public.lesson_types where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.local_ts(date, time),
  public.teacher_covers(uuid, date, time, time, boolean),
  public.closure_on(date),
  public.lesson_conflict(uuid, uuid, timestamptz, timestamptz),
  public.overlap_error(text),
  public.check_booking(uuid, uuid, uuid, time, integer, boolean),
  public.series_plan(uuid, uuid, smallint, time, integer, date, date, boolean),
  public.series_window_end(date),
  public.generate_series_occurrences(uuid, date),
  public.subject_has_lessons(uuid, uuid),
  public.expire_exception_requests(),
  public.book_lesson(uuid, uuid, uuid, date, time, integer, public.lesson_location, boolean),
  public.preview_series(uuid, uuid, jsonb, date, date),
  public.create_series(uuid, uuid, jsonb, date, date, public.lesson_location, boolean),
  public.respond_exception_request(uuid, integer, boolean, text),
  public.cancel_exception_request(uuid, integer),
  public.list_calendar_lessons(timestamptz, timestamptz, uuid, uuid, uuid, boolean),
  public.get_lesson(uuid),
  public.list_exception_requests(boolean),
  public.lesson_type_delete_info(uuid),
  public.delete_lesson_type(uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.expire_exception_requests(),
  public.book_lesson(uuid, uuid, uuid, date, time, integer, public.lesson_location, boolean),
  public.preview_series(uuid, uuid, jsonb, date, date),
  public.create_series(uuid, uuid, jsonb, date, date, public.lesson_location, boolean),
  public.respond_exception_request(uuid, integer, boolean, text),
  public.cancel_exception_request(uuid, integer),
  public.list_calendar_lessons(timestamptz, timestamptz, uuid, uuid, uuid, boolean),
  public.get_lesson(uuid),
  public.list_exception_requests(boolean),
  public.lesson_type_delete_info(uuid),
  public.delete_lesson_type(uuid, boolean)
to authenticated;
