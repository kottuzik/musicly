-- Milestone 8, step 3: the scheduled jobs. Each one is an idempotent SQL function that logs its run
-- in job_runs (when it did something or failed) and never lets one failure stop the others.
-- The Cron entries at the bottom run them; pg_net calls the Next.js endpoint that sends e-mail.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function public.job_finish(p_job text, p_ok boolean, p_summary jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.job_runs (job, ok, summary) values (p_job, p_ok, p_summary);
$$;

-- ---------------------------------------------------------------------------
-- Reminders: every 5 minutes
-- ---------------------------------------------------------------------------

-- Reminders are created when their time arrives, not in advance, so a cancelled lesson, a new
-- teacher or a changed preference never leaves anything to recompute. A reminder whose time
-- passed more than 10 minutes ago (a missed run, or a preference switched on late) is not sent.
create function public.dispatch_due_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_job uuid;
  v_count integer := 0;
begin
  for r in
    select l.id as lesson_id, l.teacher_id, t.profile_id, l.start_at, o.m as offset_minutes,
           public.lesson_notice(l) as notice
    from public.lessons l
    join public.teachers t on t.id = l.teacher_id and t.status = 'active' and t.profile_id is not null
    left join public.reminder_preferences rp on rp.teacher_id = l.teacher_id
    left join public.lesson_reminder_overrides ov on ov.lesson_id = l.id and ov.teacher_id = l.teacher_id
    cross join lateral unnest(
      case
        when ov.mode = 'off' then '{}'::integer[]
        when ov.mode = 'custom' then ov.offsets_minutes
        when coalesce(rp.enabled, false) then rp.offsets_minutes
        else '{}'::integer[]
      end) as o(m)
    where l.status = 'scheduled'
      and l.start_at > now() and l.start_at <= now() + interval '7 days'
      and l.start_at - make_interval(mins => o.m) <= now()
      and l.start_at - make_interval(mins => o.m) > now() - interval '10 minutes'
  loop
    insert into public.reminder_jobs (lesson_id, teacher_id, offset_minutes, due_at)
    values (r.lesson_id, r.teacher_id, r.offset_minutes, r.start_at - make_interval(mins => r.offset_minutes))
    on conflict (lesson_id, teacher_id, offset_minutes) do nothing
    returning id into v_job;
    if v_job is not null then
      perform public.notify(
        r.profile_id, 'lesson_reminder', 'system', 'lesson', r.lesson_id,
        r.notice || jsonb_build_object('offset_minutes', r.offset_minutes),
        'rem:' || r.lesson_id || ':' || r.offset_minutes);
      v_count := v_count + 1;
    end if;
    v_job := null;
  end loop;

  if v_count > 0 then
    perform public.job_finish('dispatch_due_reminders', true, jsonb_build_object('created', v_count));
  end if;
  return v_count;
exception when others then
  perform public.job_finish('dispatch_due_reminders', false, jsonb_build_object('error', sqlstate));
  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attendance not reported: once a day
-- ---------------------------------------------------------------------------

create function public.notify_unreported_attendance()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select t.profile_id, count(*) as lessons
    from public.lessons l
    join public.teachers t on t.id = l.teacher_id and t.status = 'active' and t.profile_id is not null
    where l.status = 'scheduled'
      and l.end_at <= now() and l.end_at > now() - interval '30 days'
      and not exists (select 1 from public.attendance a where a.lesson_id = l.id)
    group by t.profile_id
  loop
    if public.notify(
         r.profile_id, 'attendance_unreported', 'system', null, null,
         jsonb_build_object('count', r.lessons), 'unrep:' || r.profile_id || ':' || public.school_today()) is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  delete from public.job_runs where started_at < now() - interval '30 days';
  if v_count > 0 then
    perform public.job_finish('notify_unreported_attendance', true, jsonb_build_object('notified', v_count));
  end if;
  return v_count;
exception when others then
  perform public.job_finish('notify_unreported_attendance', false, jsonb_build_object('error', sqlstate));
  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pending requests that can no longer be answered: every 15 minutes
-- ---------------------------------------------------------------------------

-- The status changes fire the notification triggers, so the people involved are told.
create function public.expire_pending_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  v_count := public.expire_exception_requests() + public.expire_lesson_change_requests();
  if v_count > 0 then
    perform public.job_finish('expire_pending_requests', true, jsonb_build_object('expired', v_count));
  end if;
  return v_count;
exception when others then
  perform public.job_finish('expire_pending_requests', false, jsonb_build_object('error', sqlstate));
  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rolling 12-month window of open-ended series: once a day
-- ---------------------------------------------------------------------------

-- Weeks where the teacher or student is busy, or the teacher is absent, are not created
-- (ADR-13); the admins are told once per series per day.
create function public.extend_recurring_lessons()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  v_skipped jsonb;
  v_series integer := 0;
  v_problems integer := 0;
begin
  for s in
    select id, end_date from public.lesson_series
    where status = 'active' and generated_until < public.series_window_end(end_date)
  loop
    begin
      v_skipped := public.generate_series_occurrences(s.id, public.series_window_end(s.end_date));
      v_series := v_series + 1;
      if jsonb_array_length(v_skipped) > 0 then
        v_problems := v_problems + 1;
        perform public.notify_admins(
          'series_extension_conflicts', 'system', 'series', s.id,
          jsonb_build_object('series_id', s.id, 'count', jsonb_array_length(v_skipped)),
          'ext:' || s.id || ':' || public.school_today());
      end if;
    exception when others then
      perform public.job_finish('extend_recurring_lessons', false, jsonb_build_object('series', s.id, 'error', sqlstate));
    end;
  end loop;

  if v_series > 0 then
    perform public.job_finish('extend_recurring_lessons', true, jsonb_build_object('extended', v_series, 'with_conflicts', v_problems));
  end if;
  return v_series;
end;
$$;

-- ---------------------------------------------------------------------------
-- Students whose return date has come: every hour
-- ---------------------------------------------------------------------------

-- "auto": the student becomes active again, with no lessons created. "notify": the admins are told
-- once, and the student stays inactive until someone changes it (PRD §4.3).
create function public.activate_or_notify_students()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  st record;
  v_count integer := 0;
begin
  for st in
    select id, return_mode, expected_return_date from public.students
    where status = 'inactive' and expected_return_date is not null
      and expected_return_date <= public.school_today()
    for update skip locked
  loop
    if st.return_mode = 'auto' then
      update public.students
      set status = 'active', expected_return_date = null, return_mode = null
      where id = st.id;
      perform public.log_event('student', st.id, 'student_auto_activated', null,
        jsonb_build_object('return_date', st.expected_return_date));
      perform public.notify_admins('student_returned_auto', 'system', 'student', st.id,
        jsonb_build_object('return_date', st.expected_return_date), 'ret:' || st.id || ':' || st.expected_return_date);
      v_count := v_count + 1;
    else
      update public.students set return_notified_at = now() where id = st.id and return_notified_at is null;
      if found then
        perform public.notify_admins('student_return_due', 'system', 'student', st.id,
          jsonb_build_object('return_date', st.expected_return_date), 'ret:' || st.id || ':' || st.expected_return_date);
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  if v_count > 0 then
    perform public.job_finish('activate_or_notify_students', true, jsonb_build_object('handled', v_count));
  end if;
  return v_count;
exception when others then
  perform public.job_finish('activate_or_notify_students', false, jsonb_build_object('error', sqlstate));
  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- E-mail: every minute, wake the sender when something is waiting
-- ---------------------------------------------------------------------------

-- Reads the app address and the shared secret from Supabase Vault (never from code). When either
-- is missing the outbox simply keeps waiting; the missing setup is logged at most once an hour.
create function public.ping_email_dispatcher()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from public.email_outbox
    where (status = 'pending' and next_attempt_at <= now()) or (status = 'sending' and locked_until < now())
  ) then
    return false;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    if not exists (
      select 1 from public.job_runs
      where job = 'ping_email_dispatcher' and started_at > now() - interval '1 hour'
    ) then
      perform public.job_finish('ping_email_dispatcher', false, jsonb_build_object('error', 'not_configured'));
    end if;
    return false;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/cron/email',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000);
  return true;
end;
$$;

revoke execute on function
  public.job_finish(text, boolean, jsonb),
  public.dispatch_due_reminders(),
  public.notify_unreported_attendance(),
  public.expire_pending_requests(),
  public.extend_recurring_lessons(),
  public.activate_or_notify_students(),
  public.ping_email_dispatcher()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cron schedule (UTC). Re-running this migration replaces the entries by name.
-- ---------------------------------------------------------------------------

select cron.schedule('dispatch-due-reminders', '*/5 * * * *', $$select public.dispatch_due_reminders()$$);
select cron.schedule('expire-pending-requests', '*/15 * * * *', $$select public.expire_pending_requests()$$);
select cron.schedule('activate-or-notify-students', '7 * * * *', $$select public.activate_or_notify_students()$$);
select cron.schedule('extend-recurring-lessons', '30 2 * * *', $$select public.extend_recurring_lessons()$$);
select cron.schedule('notify-unreported-attendance', '0 6 * * *', $$select public.notify_unreported_attendance()$$);
select cron.schedule('ping-email-dispatcher', '* * * * *', $$select public.ping_email_dispatcher()$$);
