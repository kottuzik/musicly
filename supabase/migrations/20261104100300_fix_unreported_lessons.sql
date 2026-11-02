-- Milestone 7: the active-teacher check in list_unreported_lessons used an unqualified "id", which clashed with the
-- function's own output column and made every teacher's list come back empty.

create or replace function public.list_unreported_lessons(p_limit integer)
returns table (
  id uuid, start_at timestamptz, end_at timestamptz, student_name text, teacher_name text,
  lesson_type_name text, color text, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_teacher uuid;
begin
  if v_role is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_role = 'teacher' then
    v_teacher := public.current_teacher_id();
    if v_teacher is null or not exists (select 1 from public.teachers tt where tt.id = v_teacher and tt.status = 'active') then
      return;
    end if;
  end if;

  return query
  select l.id, l.start_at, l.end_at, s.full_name, t.full_name, lt.name, lt.color, count(*) over ()
  from public.lessons l
  join public.students s on s.id = l.student_id
  join public.teachers t on t.id = l.teacher_id
  join public.lesson_types lt on lt.id = l.lesson_type_id
  where l.status = 'scheduled'
    and l.end_at <= now() and l.end_at > now() - interval '30 days'
    and (v_teacher is null or l.teacher_id = v_teacher)
    and not exists (select 1 from public.attendance a where a.lesson_id = l.id)
  order by l.start_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
end;
$$;
