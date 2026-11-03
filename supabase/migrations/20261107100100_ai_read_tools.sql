-- Milestone 10, step 2: read-only tools for the admin AI assistant, and its usage limits.
-- Nothing here writes school data. Results hold names, subjects, dates and times only - never
-- contact details, notes or birth dates (ARCHITECTURE section 7).

create table public.ai_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  tokens_in  integer not null default 0,
  tokens_out integer not null default 0,
  outcome    text not null default 'started'
);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at desc);
create index ai_usage_created_idx on public.ai_usage (created_at desc);

-- No direct access from the app: only the functions below touch it.
alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon, authenticated;

-- Checks the per-admin hourly and school-wide daily limits and records the request in one step.
-- The advisory lock stops two parallel requests from both slipping under the limit. When a limit
-- is hit the error detail holds the number of minutes until the next request is allowed.
create function public.ai_reserve_request(p_hourly integer, p_daily integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_hour_count integer;
  v_hour_oldest timestamptz;
  v_day_count integer;
  v_day_oldest timestamptz;
begin
  perform public.require_admin();
  perform pg_advisory_xact_lock(hashtext('ai_usage'));
  delete from public.ai_usage where created_at < now() - interval '90 days';

  select count(*), min(created_at) into v_hour_count, v_hour_oldest
  from public.ai_usage where user_id = v_user and created_at > now() - interval '1 hour';
  if v_hour_count >= p_hourly then
    raise exception 'ai_rate_limited' using errcode = 'P0001',
      detail = greatest(1, ceil(extract(epoch from (v_hour_oldest + interval '1 hour' - now())) / 60))::text;
  end if;

  select count(*), min(created_at) into v_day_count, v_day_oldest
  from public.ai_usage where created_at > now() - interval '1 day';
  if v_day_count >= p_daily then
    raise exception 'ai_rate_limited' using errcode = 'P0001',
      detail = greatest(1, ceil(extract(epoch from (v_day_oldest + interval '1 day' - now())) / 60))::text;
  end if;

  insert into public.ai_usage (user_id) values (v_user) returning id into v_id;
  return v_id;
end;
$$;

create function public.ai_record_usage(p_id uuid, p_tokens_in integer, p_tokens_out integer, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.ai_usage
  set tokens_in = greatest(coalesce(p_tokens_in, 0), 0),
      tokens_out = greatest(coalesce(p_tokens_out, 0), 0),
      outcome = left(coalesce(p_outcome, 'unknown'), 40)
  where id = p_id and user_id = (select auth.uid());
end;
$$;

-- Name -> id lookup. p_kind: 'student' or 'teacher'. Up to 10 matches; deleted people are not found.
create function public.ai_find_people(p_kind text, p_query text, p_lesson_type text)
returns table (id uuid, name text, status text, subjects text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := '%' || replace(replace(replace(coalesce(trim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_lt text := nullif('%' || replace(replace(replace(coalesce(trim(p_lesson_type), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%', '%%');
begin
  perform public.require_admin();
  if p_kind = 'student' then
    return query
    select s.id, s.full_name, s.status::text,
           coalesce((select string_agg(lt.name, ', ' order by lt.name)
                     from public.student_subjects ss join public.lesson_types lt on lt.id = ss.lesson_type_id
                     where ss.student_id = s.id), '')
    from public.students s
    where s.deleted_at is null and s.anonymized_at is null and s.full_name ilike v_q
      and (v_lt is null or exists (
        select 1 from public.student_subjects ss join public.lesson_types lt on lt.id = ss.lesson_type_id
        where ss.student_id = s.id and lt.name ilike v_lt))
    order by s.full_name limit 10;
  elsif p_kind = 'teacher' then
    return query
    select t.id, t.full_name, t.status::text,
           coalesce((select string_agg(lt.name, ', ' order by lt.name)
                     from public.teacher_skills sk join public.lesson_types lt on lt.id = sk.lesson_type_id
                     where sk.teacher_id = t.id), '')
    from public.teachers t
    where t.deleted_at is null and t.anonymized_at is null and t.full_name ilike v_q
      and (v_lt is null or exists (
        select 1 from public.teacher_skills sk join public.lesson_types lt on lt.id = sk.lesson_type_id
        where sk.teacher_id = t.id and lt.name ilike v_lt))
    order by t.full_name limit 10;
  else
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
end;
$$;

-- Active teachers of a subject who are free for the whole window (or part of it): runs of free
-- quarter-hours on that date. Free = inside school hours and the teacher's availability, no absence,
-- not a closed day, no lesson at that time.
create function public.ai_find_available_teachers(
  p_lesson_type_id uuid, p_date date, p_from time, p_to time
)
returns table (teacher_id uuid, teacher_name text, free_from time, free_to time)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_date is null or p_from is null or p_to is null or p_to <= p_from
     or not public.is_quarter_hour(p_from) or not public.is_quarter_hour(p_to) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if public.closure_on(p_date) then
    return;
  end if;

  return query
  with free as (
    select t.id as tid, t.full_name as tname, q.q as qt,
           row_number() over (partition by t.id order by q.q) as rn
    from public.teachers t
    join public.teacher_skills sk on sk.teacher_id = t.id and sk.lesson_type_id = p_lesson_type_id
    cross join lateral (
      select (p_from + (g * interval '15 minutes'))::time as q
      from generate_series(0, ((extract(epoch from (p_to - p_from)) / 900)::integer) - 1) g
    ) q
    where t.status = 'active' and t.deleted_at is null
      and public.within_operating_hours(extract(dow from p_date)::smallint, q.q, (q.q + interval '15 minutes')::time)
      and public.teacher_covers(t.id, p_date, q.q, (q.q + interval '15 minutes')::time, true)
      and not exists (
        select 1 from public.lessons l
        where l.teacher_id = t.id and l.status = 'scheduled'
          and l.start_at < public.local_ts(p_date, (q.q + interval '15 minutes')::time)
          and l.end_at > public.local_ts(p_date, q.q))
  ),
  runs as (
    select tid, tname, qt,
           (extract(epoch from qt) / 900)::integer - rn as grp
    from free
  )
  select tid, tname, min(qt), (max(qt) + interval '15 minutes')::time
  from runs
  group by tid, tname, grp
  order by tname, min(qt);
end;
$$;

-- Up to p_limit (max 8) future start times for a lesson of the student, on the quarter-hour grid,
-- inside school hours and the teacher's availability, with neither teacher nor student busy.
-- Without p_teacher_id the student's regular teacher for the subject is used. Creates nothing.
create function public.ai_suggest_slots(
  p_student_id uuid, p_lesson_type_id uuid, p_teacher_id uuid,
  p_from date, p_to date, p_duration integer, p_limit integer
)
returns table (slot_date date, start_time time, end_time time, teacher_id uuid, teacher_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_teacher uuid := p_teacher_id;
  v_duration integer := p_duration;
begin
  perform public.require_admin();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 13 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if v_teacher is null then
    select regular_teacher_id into v_teacher
    from public.student_subjects where student_id = p_student_id and lesson_type_id = p_lesson_type_id;
  end if;
  if v_duration is null then
    select default_duration_minutes into v_duration from public.lesson_types where id = p_lesson_type_id;
  end if;
  -- Same checks as booking: active student enrolled in the subject, qualified active teacher.
  perform public.check_booking(p_student_id, p_lesson_type_id, v_teacher, time '12:00', v_duration, false);

  return query
  select d.d::date, s.st, (s.st + v_duration * interval '1 minute')::time, v_teacher,
         (select full_name from public.teachers where id = v_teacher)
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d(d)
  join public.operating_hours oh on oh.day_of_week = extract(dow from d.d)::smallint
  cross join lateral (
    select (oh.open_time + (g * interval '15 minutes'))::time as st
    from generate_series(0, (extract(epoch from (oh.close_time - oh.open_time)) / 900)::integer) g
  ) s
  where not public.closure_on(d.d::date)
    and s.st + v_duration * interval '1 minute' <= oh.close_time
    and public.local_ts(d.d::date, s.st) > now()
    and public.teacher_covers(v_teacher, d.d::date, s.st, (s.st + v_duration * interval '1 minute')::time, true)
    and public.lesson_conflict(v_teacher, p_student_id,
          public.local_ts(d.d::date, s.st),
          public.local_ts(d.d::date, s.st) + v_duration * interval '1 minute') is null
  order by d.d, s.st
  limit least(greatest(coalesce(p_limit, 5), 1), 8);
end;
$$;

revoke execute on function
  public.ai_reserve_request(integer, integer),
  public.ai_record_usage(uuid, integer, integer, text),
  public.ai_find_people(text, text, text),
  public.ai_find_available_teachers(uuid, date, time, time),
  public.ai_suggest_slots(uuid, uuid, uuid, date, date, integer, integer)
from public, anon, authenticated;

grant execute on function
  public.ai_reserve_request(integer, integer),
  public.ai_record_usage(uuid, integer, integer, text),
  public.ai_find_people(text, text, text),
  public.ai_find_available_teachers(uuid, date, time, time),
  public.ai_suggest_slots(uuid, uuid, uuid, date, date, integer, integer)
to authenticated;
