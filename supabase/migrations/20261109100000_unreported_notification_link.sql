-- The unreported-attendance notification now carries the start of the oldest unreported lesson,
-- so its link can open the calendar on that day.
create or replace function public.notify_unreported_attendance()
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
    select t.profile_id, count(*) as lessons, min(l.start_at) as first_start_at
    from public.lessons l
    join public.teachers t on t.id = l.teacher_id and t.status = 'active' and t.profile_id is not null
    where l.status = 'scheduled'
      and l.end_at <= now() and l.end_at > now() - interval '30 days'
      and not exists (select 1 from public.attendance a where a.lesson_id = l.id)
    group by t.profile_id
  loop
    if public.notify(
         r.profile_id, 'attendance_unreported', 'system', null, null,
         jsonb_build_object('count', r.lessons, 'start_at', r.first_start_at), 'unrep:' || r.profile_id || ':' || public.school_today()) is not null then
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
