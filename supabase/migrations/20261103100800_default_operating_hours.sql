-- The school is open every day of the week by default, 10:00–22:00 (user decision). Days that
-- already have hours keep them; a day without hours (closed) is opened. Admins close days or
-- change hours from the settings screen, and add closure days for specific dates.
insert into public.operating_hours (day_of_week, open_time, close_time)
select d, '10:00', '22:00'
from generate_series(0, 6) as d
on conflict (day_of_week) do nothing;
