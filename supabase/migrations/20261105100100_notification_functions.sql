-- Milestone 8, step 2: creating notifications in one place (triggers on the audit log, the request
-- tables and new lessons), and the functions users call to read-mark, archive and set preferences.
-- Business errors: errcode P0001 + a stable key.

-- ---------------------------------------------------------------------------
-- Internal helpers (no grant: only triggers and the job functions call them)
-- ---------------------------------------------------------------------------

-- The lesson details worth putting in a notification or e-mail: time, subject and place only.
create function public.lesson_notice(p_lesson public.lessons)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'lesson_id', p_lesson.id, 'start_at', p_lesson.start_at, 'location', p_lesson.location,
    'subject', (select lt.name from public.lesson_types lt where lt.id = p_lesson.lesson_type_id));
$$;

create function public.teacher_profile_id(p_teacher uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile_id from public.teachers where id = p_teacher;
$$;

-- Creates one notification (and, when the user chose e-mail too, one outbox row) in the caller's
-- transaction. Returns null when nothing was created: unknown or inactive user, a repeated
-- dedupe key, or p_coalesce with an unread notification of the same type already waiting.
create function public.notify(
  p_user uuid,
  p_type text,
  p_category public.notification_category,
  p_entity text,
  p_entity_id uuid,
  p_payload jsonb,
  p_dedupe text default null,
  p_coalesce boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_id uuid;
begin
  if p_user is null then
    return null;
  end if;
  select * into v_profile from public.profiles where id = p_user and status = 'active';
  if not found then
    return null;
  end if;
  if p_coalesce and exists (
    select 1 from public.notifications n
    where n.user_id = p_user and n.type = p_type and n.read_at is null and n.archived_at is null
  ) then
    return null;
  end if;

  insert into public.notifications (user_id, type, category, entity, entity_id, payload, dedupe_key)
  values (p_user, p_type, p_category, p_entity, p_entity_id, coalesce(p_payload, '{}'::jsonb), p_dedupe)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;

  if v_id is not null and coalesce(
    (select np.channel from public.notification_preferences np where np.user_id = p_user), 'in_app'
  ) = 'in_app_email' then
    insert into public.email_outbox (user_id, to_email, kind, payload, notification_id, dedupe_key)
    values (p_user, v_profile.email, p_type, coalesce(p_payload, '{}'::jsonb), v_id, 'n:' || v_id)
    on conflict (dedupe_key) do nothing;
  end if;
  return v_id;
end;
$$;

-- The same notification to every active admin, except p_exclude (usually the person who acted).
create function public.notify_admins(
  p_type text,
  p_category public.notification_category,
  p_entity text,
  p_entity_id uuid,
  p_payload jsonb,
  p_dedupe text default null,
  p_exclude uuid default null,
  p_coalesce boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  v_count integer := 0;
begin
  for a in
    select id from public.profiles
    where role in ('super_admin', 'admin') and status = 'active'
      and (p_exclude is null or id <> p_exclude)
  loop
    if public.notify(a.id, p_type, p_category, p_entity, p_entity_id, p_payload, p_dedupe, p_coalesce) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function
  public.lesson_notice(public.lessons),
  public.teacher_profile_id(uuid),
  public.notify(uuid, text, public.notification_category, text, uuid, jsonb, text, boolean),
  public.notify_admins(text, public.notification_category, text, uuid, jsonb, text, uuid, boolean)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: who is told about what
-- ---------------------------------------------------------------------------

-- The audit log already records every business action, so most notifications hang off it.
create function public.audit_events_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  s public.lesson_series;
  v_teacher uuid;
  v_old_teacher uuid;
  v_new_teacher uuid;
begin
  if new.action in ('lesson_cancelled', 'lesson_restored', 'lesson_updated', 'held_lesson_cancelled') then
    select * into l from public.lessons where id = new.entity_id;
    if found then
      v_teacher := public.teacher_profile_id(l.teacher_id);
      if v_teacher is distinct from new.actor_id then
        perform public.notify(v_teacher, new.action, 'activity', 'lesson', l.id, public.lesson_notice(l), 'a:' || new.id);
      end if;
      -- The lesson moved to another teacher: the previous one is told it is no longer theirs.
      if new.action = 'lesson_updated' then
        v_old_teacher := nullif(new.old_values ->> 'teacher_id', '')::uuid;
        if v_old_teacher is not null and v_old_teacher <> l.teacher_id
           and public.teacher_profile_id(v_old_teacher) is distinct from new.actor_id then
          perform public.notify(
            public.teacher_profile_id(v_old_teacher), 'lesson_moved_away', 'activity', 'lesson', l.id,
            public.lesson_notice(l) || jsonb_build_object('start_at', new.old_values ->> 'start_at'),
            'm:' || new.id);
        end if;
      end if;
    end if;

  elsif new.action = 'teacher_restore_outside_hours' then
    select * into l from public.lessons where id = new.entity_id;
    if found then
      perform public.notify_admins(new.action, 'activity', 'lesson', l.id, public.lesson_notice(l), 'a:' || new.id, new.actor_id);
    end if;

  elsif new.action = 'attendance_changed' then
    -- Only a changed status is news; editing the note alone is not.
    if new.old_values ->> 'status' is distinct from new.new_values ->> 'status' then
      select * into l from public.lessons where id = new.entity_id;
      if found then
        perform public.notify_admins(
          new.action, 'activity', 'lesson', l.id,
          public.lesson_notice(l) || jsonb_build_object('from', new.old_values ->> 'status', 'to', new.new_values ->> 'status'),
          'a:' || new.id, new.actor_id);
      end if;
    end if;

  elsif new.action in ('series_stopped', 'series_extended', 'series_resumed') then
    select * into s from public.lesson_series where id = new.entity_id;
    if found then
      v_teacher := public.teacher_profile_id(s.teacher_id);
      if v_teacher is distinct from new.actor_id then
        perform public.notify(
          v_teacher, new.action, 'activity', 'series', s.id,
          jsonb_build_object('series_id', s.id, 'subject', (select lt.name from public.lesson_types lt where lt.id = s.lesson_type_id),
            'day_of_week', s.day_of_week, 'start_time', s.start_time),
          'a:' || new.id);
      end if;
    end if;

  elsif new.action = 'series_changed' then
    -- The new teacher hears about the new series when it is created; the previous one is told here.
    v_old_teacher := nullif(new.old_values ->> 'teacher_id', '')::uuid;
    v_new_teacher := nullif(new.new_values ->> 'teacher_id', '')::uuid;
    if v_old_teacher is not null and v_old_teacher is distinct from v_new_teacher then
      select * into s from public.lesson_series where id = new.entity_id;
      if found and public.teacher_profile_id(v_old_teacher) is distinct from new.actor_id then
        perform public.notify(
          public.teacher_profile_id(v_old_teacher), 'series_moved_away', 'activity', 'series', s.id,
          jsonb_build_object('series_id', s.id, 'subject', (select lt.name from public.lesson_types lt where lt.id = s.lesson_type_id),
            'day_of_week', s.day_of_week, 'start_time', s.start_time),
          'a:' || new.id);
      end if;
    end if;
  end if;
  return null;
end;
$$;

create trigger audit_events_notify
after insert on public.audit_events
for each row execute function public.audit_events_notify();

-- Availability requests: teacher -> admins, and the answer back.
create function public.availability_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := jsonb_build_object(
    'request_id', new.id, 'kind', new.kind, 'start_date', new.start_date, 'end_date', new.end_date);
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.notify_admins('availability_request_new', 'activity', 'availability_request', new.id,
        v_payload, 'ar:' || new.id || ':new', new.requested_by);
    end if;
  elsif old.status = 'pending' and new.status in ('approved', 'rejected') then
    if public.teacher_profile_id(new.teacher_id) is distinct from new.decided_by then
      perform public.notify(public.teacher_profile_id(new.teacher_id), 'availability_request_' || new.status, 'activity',
        'availability_request', new.id, v_payload, 'ar:' || new.id || ':' || new.status);
    end if;
  end if;
  return null;
end;
$$;

create trigger availability_requests_notify_insert
after insert on public.availability_requests
for each row execute function public.availability_requests_notify();

create trigger availability_requests_notify_update
after update of status on public.availability_requests
for each row when (old.status is distinct from new.status)
execute function public.availability_requests_notify();

-- A teacher's request to change or cancel a lesson, and the answer.
create function public.lesson_change_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  v_payload jsonb;
begin
  select * into l from public.lessons where id = new.lesson_id;
  v_payload := coalesce(public.lesson_notice(l), '{}'::jsonb)
    || jsonb_build_object('request_id', new.id, 'kind', new.kind);

  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.notify_admins('change_request_new', 'activity', 'change_request', new.id,
        v_payload, 'cr:' || new.id || ':new', new.requested_by);
    end if;
  elsif old.status = 'pending' and new.status in ('approved', 'rejected') then
    if new.requested_by is distinct from new.decided_by then
      perform public.notify(new.requested_by, 'change_request_' || new.status, 'activity', 'change_request', new.id,
        v_payload, 'cr:' || new.id || ':' || new.status);
    end if;
  elsif old.status = 'pending' and new.status = 'cancelled' and new.decided_by is null then
    -- Closed by the system (the lesson started or was handled), not by a person.
    perform public.notify(new.requested_by, 'change_request_closed', 'system', 'change_request', new.id,
      v_payload, 'cr:' || new.id || ':closed');
  end if;
  return null;
end;
$$;

create trigger lesson_change_requests_notify_insert
after insert on public.lesson_change_requests
for each row execute function public.lesson_change_requests_notify();

create trigger lesson_change_requests_notify_update
after update of status on public.lesson_change_requests
for each row when (old.status is distinct from new.status)
execute function public.lesson_change_requests_notify();

-- An admin asks a teacher to approve a booking, change or restore; the teacher's answer, or its
-- failure, goes back to the admin who asked.
create function public.exception_booking_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := jsonb_build_object(
    'request_id', new.id, 'kind', new.kind, 'start_date', new.start_date, 'start_time', new.start_time,
    'subject', (select lt.name from public.lesson_types lt where lt.id = new.lesson_type_id));
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' and public.teacher_profile_id(new.teacher_id) is distinct from new.requested_by then
      perform public.notify(public.teacher_profile_id(new.teacher_id), 'approval_request_new', 'activity',
        'approval_request', new.id, v_payload, 'er:' || new.id || ':new');
    end if;
  elsif old.status = 'pending' then
    if new.status in ('approved', 'rejected') then
      if new.requested_by is distinct from new.decided_by then
        perform public.notify(new.requested_by, 'approval_request_' || new.status, 'activity', 'approval_request', new.id,
          v_payload, 'er:' || new.id || ':' || new.status);
      end if;
    elsif new.status = 'cannot_schedule' then
      -- The time was taken before the teacher answered (PRD §4.2): every admin hears it.
      perform public.notify_admins('approval_request_cannot_schedule', 'activity', 'approval_request', new.id,
        v_payload, 'er:' || new.id || ':cannot');
    elsif new.status = 'expired' then
      perform public.notify(new.requested_by, 'approval_request_expired', 'system', 'approval_request', new.id,
        v_payload, 'er:' || new.id || ':expired');
    end if;
  end if;
  return null;
end;
$$;

create trigger exception_booking_requests_notify_insert
after insert on public.exception_booking_requests
for each row execute function public.exception_booking_requests_notify();

create trigger exception_booking_requests_notify_update
after update of status on public.exception_booking_requests
for each row when (old.status is distinct from new.status)
execute function public.exception_booking_requests_notify();

-- A new one-time lesson for a teacher. Series lessons are announced once, by the series.
create function public.lessons_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'scheduled' and new.series_id is null
       and public.teacher_profile_id(new.teacher_id) is distinct from new.created_by then
      perform public.notify(public.teacher_profile_id(new.teacher_id), 'lesson_new', 'activity', 'lesson', new.id,
        public.lesson_notice(new), 'ln:' || new.id);
    end if;
  elsif new.requires_attention and not old.requires_attention then
    -- One waiting notification is enough however many lessons get flagged.
    perform public.notify_admins('lessons_need_attention', 'activity', null, null,
      jsonb_build_object('reason', new.attention_reason), null, null, true);
  end if;
  return null;
end;
$$;

create trigger lessons_notify_insert
after insert on public.lessons
for each row execute function public.lessons_notify();

create trigger lessons_notify_update
after update of requires_attention on public.lessons
for each row when (new.requires_attention and not old.requires_attention)
execute function public.lessons_notify();

create function public.lesson_series_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.teacher_profile_id(new.teacher_id) is distinct from new.created_by then
    perform public.notify(public.teacher_profile_id(new.teacher_id), 'series_new', 'activity', 'series', new.id,
      jsonb_build_object('series_id', new.id, 'subject', (select lt.name from public.lesson_types lt where lt.id = new.lesson_type_id),
        'day_of_week', new.day_of_week, 'start_time', new.start_time, 'start_date', new.start_date),
      'sn:' || new.id);
  end if;
  return null;
end;
$$;

create trigger lesson_series_notify
after insert on public.lesson_series
for each row execute function public.lesson_series_notify();

revoke execute on function
  public.audit_events_notify(), public.availability_requests_notify(), public.lesson_change_requests_notify(),
  public.exception_booking_requests_notify(), public.lessons_notify(), public.lesson_series_notify(),
  public.students_reset_return_notified()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What users do: read-mark, archive, preferences
-- ---------------------------------------------------------------------------

create function public.mark_notifications_read(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and id = any (p_ids) and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and archived_at is null and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Archiving also marks as read. There is deliberately no function that deletes a notification.
create function public.archive_notifications(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  update public.notifications set archived_at = now(), read_at = coalesce(read_at, now())
  where user_id = (select auth.uid()) and id = any (p_ids) and archived_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.unarchive_notifications(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  update public.notifications set archived_at = null
  where user_id = (select auth.uid()) and id = any (p_ids) and archived_at is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.set_notification_channel(p_channel public.notification_channel)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  insert into public.notification_preferences (user_id, channel)
  values ((select auth.uid()), p_channel)
  on conflict (user_id) do update set channel = excluded.channel, updated_at = now();
end;
$$;

-- General reminder preference of the calling (active) teacher.
create function public.save_reminder_preferences(p_enabled boolean, p_offsets integer[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher uuid := public.current_teacher_id();
  v_offsets integer[] := coalesce(p_offsets, '{}');
begin
  if v_teacher is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not public.valid_reminder_offsets(v_offsets) then
    raise exception 'invalid_reminder_offsets' using errcode = 'P0001';
  end if;
  if p_enabled and cardinality(v_offsets) = 0 then
    raise exception 'reminder_offsets_required' using errcode = 'P0001';
  end if;
  insert into public.reminder_preferences (teacher_id, enabled, offsets_minutes)
  values (v_teacher, p_enabled, v_offsets)
  on conflict (teacher_id) do update
    set enabled = excluded.enabled, offsets_minutes = excluded.offsets_minutes, updated_at = now();
end;
$$;

-- Reminder setting of one upcoming lesson: 'default' (follow the general preference), 'off', or
-- 'custom' with its own offsets. A custom setting works even while the general one is off.
create function public.set_lesson_reminder(p_lesson uuid, p_mode text, p_offsets integer[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher uuid := public.current_teacher_id();
  l public.lessons;
  v_offsets integer[] := coalesce(p_offsets, '{}');
begin
  if v_teacher is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select * into l from public.lessons where id = p_lesson;
  if not found or l.teacher_id <> v_teacher then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if l.status <> 'scheduled' or l.start_at <= now() then
    raise exception 'lesson_not_upcoming' using errcode = 'P0001';
  end if;

  if p_mode = 'default' then
    delete from public.lesson_reminder_overrides where lesson_id = p_lesson and teacher_id = v_teacher;
  elsif p_mode = 'off' then
    insert into public.lesson_reminder_overrides (lesson_id, teacher_id, mode, offsets_minutes)
    values (p_lesson, v_teacher, 'off', '{}')
    on conflict (lesson_id, teacher_id) do update set mode = 'off', offsets_minutes = '{}', updated_at = now();
  elsif p_mode = 'custom' then
    if not public.valid_reminder_offsets(v_offsets) then
      raise exception 'invalid_reminder_offsets' using errcode = 'P0001';
    end if;
    if cardinality(v_offsets) = 0 then
      raise exception 'reminder_offsets_required' using errcode = 'P0001';
    end if;
    insert into public.lesson_reminder_overrides (lesson_id, teacher_id, mode, offsets_minutes)
    values (p_lesson, v_teacher, 'custom', v_offsets)
    on conflict (lesson_id, teacher_id) do update set mode = 'custom', offsets_minutes = excluded.offsets_minutes, updated_at = now();
  else
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading the list: names are looked up here, only where the reader may see them
-- ---------------------------------------------------------------------------

-- p_tab: 'activity', 'system' or 'archive'. 30 per page. subject_name is the student of the
-- lesson, series or student the notification is about, shown only to an admin or to the teacher
-- who currently teaches that lesson or series.
create function public.list_notifications(p_tab text, p_offset integer)
returns table (
  id uuid, type text, category public.notification_category, entity text, entity_id uuid,
  payload jsonb, created_at timestamptz, read_at timestamptz, archived_at timestamptz,
  subject_name text, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_teacher uuid := public.current_teacher_id();
begin
  if (select auth.uid()) is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return query
  select n.id, n.type, n.category, n.entity, n.entity_id, n.payload, n.created_at, n.read_at, n.archived_at,
         case
           when n.entity = 'lesson' and (v_admin or l.teacher_id = v_teacher) then ls.full_name
           when n.entity = 'series' and (v_admin or sr.teacher_id = v_teacher) then ss.full_name
           when n.entity = 'student' and v_admin then st.full_name
         end,
         count(*) over ()
  from public.notifications n
  left join public.lessons l on n.entity = 'lesson' and l.id = n.entity_id
  left join public.students ls on ls.id = l.student_id
  left join public.lesson_series sr on n.entity = 'series' and sr.id = n.entity_id
  left join public.students ss on ss.id = sr.student_id
  left join public.students st on n.entity = 'student' and st.id = n.entity_id
  where n.user_id = (select auth.uid())
    and case p_tab
      when 'archive' then n.archived_at is not null
      when 'system' then n.archived_at is null and n.category = 'system'
      else n.archived_at is null and n.category = 'activity'
    end
  order by n.created_at desc
  limit 30 offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function
  public.mark_notifications_read(uuid[]), public.mark_all_notifications_read(),
  public.archive_notifications(uuid[]), public.unarchive_notifications(uuid[]),
  public.set_notification_channel(public.notification_channel),
  public.save_reminder_preferences(boolean, integer[]),
  public.set_lesson_reminder(uuid, text, integer[]),
  public.list_notifications(text, integer)
from public, anon, authenticated;

grant execute on function
  public.mark_notifications_read(uuid[]), public.mark_all_notifications_read(),
  public.archive_notifications(uuid[]), public.unarchive_notifications(uuid[]),
  public.set_notification_channel(public.notification_channel),
  public.save_reminder_preferences(boolean, integer[]),
  public.set_lesson_reminder(uuid, text, integer[]),
  public.list_notifications(text, integer)
to authenticated;
