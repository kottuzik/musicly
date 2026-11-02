-- Milestone 6, step 7: a subject's duration now changes only through apply_lesson_type_duration,
-- which also settles the series that use it. Admins may still edit name and color directly.
revoke update on table public.lesson_types from authenticated;
grant update (name, color) on table public.lesson_types to authenticated;
