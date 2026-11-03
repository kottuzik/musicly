-- Milestone 9, step 3: the daily purge of students and teachers whose 30 days are over.
-- Runs once a night (02:45 UTC, before the 06:00 attendance reminder); the function is idempotent.
select cron.schedule('purge-soft-deleted-records', '45 2 * * *', $$select public.purge_soft_deleted_records()$$);
