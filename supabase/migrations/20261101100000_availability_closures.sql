-- Milestone 4: school operating hours, teacher weekly availability, removal/absence requests
-- approved by admins, and closure days. Times are local school wall-clock times (Asia/Jerusalem).
-- Business errors are raised with errcode P0001 and a stable message key that the app maps to Hebrew.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create type public.availability_request_kind as enum ('remove_weekly', 'remove_once', 'absence');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.closure_source as enum ('holiday', 'custom');
create type public.closure_status as enum ('active', 'cancelled');

-- Times are on a 15-minute grid.
create function public.is_quarter_hour(p_time time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extract(second from p_time) = 0 and extract(minute from p_time)::int % 15 = 0;
$$;

-- One opening range per weekday (0 = Sunday); a missing row means the school is closed that day.
create table public.operating_hours (
  day_of_week smallint primary key check (day_of_week between 0 and 6),
  open_time   time not null check (public.is_quarter_hour(open_time)),
  close_time  time not null check (public.is_quarter_hour(close_time)),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  check (close_time > open_time)
);

-- Weekly availability. valid_to is the inclusive last day (null = open-ended).
create table public.teacher_availability (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time  time not null check (public.is_quarter_hour(start_time)),
  end_time    time not null check (public.is_quarter_hour(end_time)),
  valid_from  date not null,
  valid_to    date,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_time > start_time),
  check (valid_to is null or valid_to >= valid_from),
  -- No overlapping slots for a teacher on the same weekday and validity period; adjacent slots are fine.
  constraint teacher_availability_no_overlap exclude using gist (
    teacher_id with =,
    day_of_week with =,
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time) with &&,
    daterange(valid_from, valid_to, '[]') with &&
  )
);

create index teacher_availability_teacher_idx on public.teacher_availability (teacher_id, day_of_week);

-- Removal and absence requests. Also the decision log: direct admin changes are stored as
-- requests the admin created and approved at once (ADR-12).
create table public.availability_requests (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.teachers (id) on delete cascade,
  kind            public.availability_request_kind not null,
  availability_id uuid references public.teacher_availability (id) on delete set null,
  day_of_week     smallint check (day_of_week between 0 and 6),  -- slot weekday for removals
  start_date      date not null,  -- remove_weekly: effective from; remove_once: the date; absence: first day
  end_date        date,           -- absence: last day
  start_time      time,           -- removals: slot hours; absence: hours on a single day, or null for whole days
  end_time        time,
  reason          text check (length(reason) <= 500),
  status          public.request_status not null default 'pending',
  version         integer not null default 1,
  requested_by    uuid not null references public.profiles (id),
  decided_by      uuid references public.profiles (id),
  decided_at      timestamptz,
  decision_note   text check (length(decision_note) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or end_time > start_time),
  check (end_date is null or end_date >= start_date),
  check (kind = 'absence' or (day_of_week is not null and start_time is not null and end_date is null)),
  check (kind <> 'absence' or (end_date is not null and (start_time is null or end_date = start_date)))
);

create index availability_requests_status_idx on public.availability_requests (status, created_at);
create index availability_requests_teacher_idx on public.availability_requests (teacher_id, created_at desc);
create index availability_requests_availability_idx on public.availability_requests (availability_id);
create index availability_requests_requested_by_idx on public.availability_requests (requested_by);
create index availability_requests_decided_by_idx on public.availability_requests (decided_by);
-- At most one pending permanent removal per slot.
create unique index availability_requests_one_pending_removal
on public.availability_requests (availability_id)
where status = 'pending' and kind = 'remove_weekly';

-- Approved absences, including one-time slot removals.
create table public.teacher_absences (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  request_id uuid not null unique references public.availability_requests (id) on delete cascade,
  start_date date not null,
  end_date   date not null,
  start_time time,
  end_time   time,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or (end_date = start_date and end_time > start_time))
);

create index teacher_absences_teacher_idx on public.teacher_absences (teacher_id, start_date);

create table public.school_closures (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 2 and 100),
  start_date   date not null,
  end_date     date not null,
  source       public.closure_source not null,
  holiday_key  text,
  status       public.closure_status not null default 'active',
  created_by   uuid references public.profiles (id) on delete set null,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date >= start_date),
  check ((source = 'holiday') = (holiday_key is not null))
);

-- The same holiday cannot be an active closure twice.
create unique index school_closures_holiday_active on public.school_closures (holiday_key) where status = 'active';
create index school_closures_dates_idx on public.school_closures (start_date, end_date) where status = 'active';
create index school_closures_created_by_idx on public.school_closures (created_by);
create index school_closures_cancelled_by_idx on public.school_closures (cancelled_by);
create index operating_hours_updated_by_idx on public.operating_hours (updated_by);
create index teacher_availability_created_by_idx on public.teacher_availability (created_by);

create trigger operating_hours_set_updated_at
before update on public.operating_hours
for each row execute function public.set_updated_at();

create trigger teacher_availability_set_updated_at
before update on public.teacher_availability
for each row execute function public.set_updated_at();

create trigger school_closures_set_updated_at
before update on public.school_closures
for each row execute function public.set_updated_at();

-- Every change to a request bumps its version (optimistic concurrency, ARCHITECTURE §3.2).
create function public.bump_request_version()
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

create trigger availability_requests_bump_version
before update on public.availability_requests
for each row execute function public.bump_request_version();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Whether [p_start, p_end) lies within the school's hours on that weekday (closed day = false).
create function public.within_operating_hours(p_day smallint, p_start time, p_end time)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.operating_hours
    where day_of_week = p_day and open_time <= p_start and close_time >= p_end
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.operating_hours enable row level security;
alter table public.teacher_availability enable row level security;
alter table public.availability_requests enable row level security;
alter table public.teacher_absences enable row level security;
alter table public.school_closures enable row level security;

revoke all on table
  public.operating_hours, public.teacher_availability, public.availability_requests,
  public.teacher_absences, public.school_closures
from anon, authenticated;
grant select on table
  public.operating_hours, public.teacher_availability, public.availability_requests,
  public.teacher_absences, public.school_closures
to authenticated;

-- School-wide settings: any active user.
create policy operating_hours_select
on public.operating_hours for select to authenticated
using ((select public.current_user_role()) is not null);

create policy school_closures_select
on public.school_closures for select to authenticated
using ((select public.current_user_role()) is not null);

-- Teacher data: admins see everything, an active teacher sees their own.
create policy teacher_availability_select
on public.teacher_availability for select to authenticated
using ((select public.is_admin()) or teacher_id = (select public.current_teacher_id()));

create policy availability_requests_select
on public.availability_requests for select to authenticated
using ((select public.is_admin()) or teacher_id = (select public.current_teacher_id()));

create policy teacher_absences_select
on public.teacher_absences for select to authenticated
using ((select public.is_admin()) or teacher_id = (select public.current_teacher_id()));

-- Live updates for lists and queues (events are filtered by the policies above).
alter publication supabase_realtime add table
  public.operating_hours, public.teacher_availability, public.availability_requests,
  public.teacher_absences, public.school_closures;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------

-- Replaces the whole week: [{"day": 0, "open": "08:00", "close": "20:00"}, ...]; missing days are closed.
-- Returns how many current availability slots now fall outside the hours (shown as a warning).
create function public.set_operating_hours(p_days jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outside integer;
begin
  perform public.require_admin();

  if jsonb_typeof(p_days) is distinct from 'array' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  delete from public.operating_hours where true;
  begin
    insert into public.operating_hours (day_of_week, open_time, close_time, updated_by)
    select (d ->> 'day')::smallint, (d ->> 'open')::time, (d ->> 'close')::time, (select auth.uid())
    from jsonb_array_elements(p_days) d;
  exception
    when check_violation or unique_violation or not_null_violation or invalid_datetime_format
      or invalid_text_representation or datetime_field_overflow then
      raise exception 'invalid_input' using errcode = 'P0001';
  end;

  select count(*) into v_outside
  from public.teacher_availability a
  join public.teachers t on t.id = a.teacher_id and t.status = 'active'
  where (a.valid_to is null or a.valid_to >= public.school_today())
    and not public.within_operating_hours(a.day_of_week, a.start_time, a.end_time);

  return v_outside;
end;
$$;

-- Adds a weekly slot, effective today. The teacher themself (active) or an admin, for an active teacher.
create function public.add_availability(p_teacher_id uuid, p_day smallint, p_start time, p_end time)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() and p_teacher_id is distinct from public.current_teacher_id() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teachers where id = p_teacher_id and status = 'active') then
    raise exception 'teacher_inactive' using errcode = 'P0001';
  end if;
  if p_start is null or p_end is null or p_end <= p_start
     or not public.is_quarter_hour(p_start) or not public.is_quarter_hour(p_end) then
    raise exception 'invalid_time_step' using errcode = 'P0001';
  end if;
  if not public.within_operating_hours(p_day, p_start, p_end) then
    raise exception 'outside_operating_hours' using errcode = 'P0001';
  end if;

  begin
    insert into public.teacher_availability (teacher_id, day_of_week, start_time, end_time, valid_from, created_by)
    values (p_teacher_id, p_day, p_start, p_end, public.school_today(), (select auth.uid()))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'availability_overlap' using errcode = 'P0001';
  end;

  return v_id;
end;
$$;

-- Applies an approved request. Internal: called only by the functions below.
create function public.apply_availability_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.availability_requests;
  v_valid_from date;
begin
  select * into r from public.availability_requests where id = p_request_id;

  if r.kind = 'remove_weekly' then
    select valid_from into v_valid_from from public.teacher_availability where id = r.availability_id for update;
    if not found then
      return;  -- the slot is already gone
    end if;
    if greatest(r.start_date, public.school_today()) <= v_valid_from then
      -- Removed before it ever applied: other pending requests for the slot become moot.
      update public.availability_requests
      set status = 'cancelled', decision_note = 'הטווח הוסר'
      where availability_id = r.availability_id and status = 'pending' and id <> r.id;
      delete from public.teacher_availability where id = r.availability_id;
    else
      update public.teacher_availability
      set valid_to = least(coalesce(valid_to, 'infinity'::date), greatest(r.start_date, public.school_today()) - 1)
      where id = r.availability_id;
    end if;
  else
    insert into public.teacher_absences (teacher_id, request_id, start_date, end_date, start_time, end_time)
    values (r.teacher_id, r.id, r.start_date, coalesce(r.end_date, r.start_date), r.start_time, r.end_time);
  end if;
end;
$$;

-- Removes a weekly slot permanently (from p_date) or for one date. A teacher's call creates a
-- pending request; an admin's call is approved and applied at once (ADR-12).
create function public.remove_availability(
  p_availability_id uuid,
  p_kind public.availability_request_kind,
  p_date date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.teacher_availability;
  v_admin boolean := public.is_admin();
  v_id uuid;
begin
  select * into s from public.teacher_availability where id = p_availability_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not v_admin and s.teacher_id is distinct from public.current_teacher_id() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_kind = 'absence' or p_date is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_date < public.school_today() then
    raise exception 'date_past' using errcode = 'P0001';
  end if;

  if p_kind = 'remove_weekly' then
    if exists (
      select 1 from public.availability_requests
      where availability_id = s.id and kind = 'remove_weekly' and status = 'pending'
    ) then
      raise exception 'removal_pending' using errcode = 'P0001';
    end if;
  else
    if extract(dow from p_date)::smallint <> s.day_of_week then
      raise exception 'date_not_matching_day' using errcode = 'P0001';
    end if;
    if p_date < s.valid_from or (s.valid_to is not null and p_date > s.valid_to) then
      raise exception 'slot_not_valid_on_date' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.availability_requests
      where availability_id = s.id and kind = 'remove_once' and start_date = p_date
        and status in ('pending', 'approved')
    ) then
      raise exception 'removal_pending' using errcode = 'P0001';
    end if;
  end if;

  insert into public.availability_requests (
    teacher_id, kind, availability_id, day_of_week, start_date, start_time, end_time, reason,
    status, requested_by, decided_by, decided_at
  )
  values (
    s.teacher_id, p_kind, s.id, s.day_of_week, p_date, s.start_time, s.end_time,
    nullif(trim(coalesce(p_reason, '')), ''),
    case when v_admin then 'approved'::public.request_status else 'pending'::public.request_status end,
    (select auth.uid()),
    case when v_admin then (select auth.uid()) end,
    case when v_admin then now() end
  )
  returning id into v_id;

  if v_admin then
    perform public.apply_availability_request(v_id);
  end if;
  return v_id;
end;
$$;

-- One-time absence: whole days (no times) or hours on a single day. Pending for a teacher,
-- applied at once for an admin.
create function public.report_absence(
  p_teacher_id uuid,
  p_start_date date,
  p_end_date date,
  p_start_time time,
  p_end_time time,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_end date := coalesce(p_end_date, p_start_date);
  v_id uuid;
begin
  if not v_admin and p_teacher_id is distinct from public.current_teacher_id() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teachers where id = p_teacher_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_start_date is null or v_end < p_start_date then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_start_date < public.school_today() then
    raise exception 'date_past' using errcode = 'P0001';
  end if;
  if (p_start_time is null) <> (p_end_time is null)
     or (p_start_time is not null and (v_end <> p_start_date or p_end_time <= p_start_time)) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_start_time is not null and (not public.is_quarter_hour(p_start_time) or not public.is_quarter_hour(p_end_time)) then
    raise exception 'invalid_time_step' using errcode = 'P0001';
  end if;

  insert into public.availability_requests (
    teacher_id, kind, start_date, end_date, start_time, end_time, reason,
    status, requested_by, decided_by, decided_at
  )
  values (
    p_teacher_id, 'absence', p_start_date, v_end, p_start_time, p_end_time,
    nullif(trim(coalesce(p_reason, '')), ''),
    case when v_admin then 'approved'::public.request_status else 'pending'::public.request_status end,
    (select auth.uid()),
    case when v_admin then (select auth.uid()) end,
    case when v_admin then now() end
  )
  returning id into v_id;

  if v_admin then
    perform public.apply_availability_request(v_id);
  end if;
  return v_id;
end;
$$;

-- Approve or reject a pending request. Only succeeds if the request is still pending at the
-- version the admin saw; otherwise another admin already handled it (PRD §3.4).
create function public.decide_availability_request(p_id uuid, p_version integer, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  update public.availability_requests
  set status = case when p_approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
      decided_by = (select auth.uid()),
      decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id and status = 'pending' and version = p_version;

  if not found then
    raise exception 'request_already_handled' using errcode = 'P0001';
  end if;

  if p_approve then
    perform public.apply_availability_request(p_id);
  end if;
end;
$$;

-- The requesting teacher withdraws a request that is still pending.
create function public.cancel_availability_request(p_id uuid, p_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.availability_requests
    where id = p_id and teacher_id = public.current_teacher_id()
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.availability_requests
  set status = 'cancelled'
  where id = p_id and status = 'pending' and version = p_version;

  if not found then
    raise exception 'request_already_handled' using errcode = 'P0001';
  end if;
end;
$$;

-- A closure day (or range): a suggested holiday (with its key) or a custom closure.
create function public.save_closure(p_name text, p_start_date date, p_end_date date, p_holiday_key text)
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

  return v_id;
end;
$$;

-- Cancelling keeps the row for history. Restoring affected lessons comes with M6.
create function public.cancel_closure(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  update public.school_closures
  set status = 'cancelled', cancelled_by = (select auth.uid()), cancelled_at = now()
  where id = p_id and status = 'active';

  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.is_quarter_hour(time),
  public.bump_request_version(),
  public.within_operating_hours(smallint, time, time),
  public.set_operating_hours(jsonb),
  public.add_availability(uuid, smallint, time, time),
  public.apply_availability_request(uuid),
  public.remove_availability(uuid, public.availability_request_kind, date, text),
  public.report_absence(uuid, date, date, time, time, text),
  public.decide_availability_request(uuid, integer, boolean, text),
  public.cancel_availability_request(uuid, integer),
  public.save_closure(text, date, date, text),
  public.cancel_closure(uuid)
from public, anon, authenticated;

grant execute on function
  public.within_operating_hours(smallint, time, time),
  public.set_operating_hours(jsonb),
  public.add_availability(uuid, smallint, time, time),
  public.remove_availability(uuid, public.availability_request_kind, date, text),
  public.report_absence(uuid, date, date, time, time, text),
  public.decide_availability_request(uuid, integer, boolean, text),
  public.cancel_availability_request(uuid, integer),
  public.save_closure(text, date, date, text),
  public.cancel_closure(uuid)
to authenticated;
