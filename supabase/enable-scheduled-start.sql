-- Run after schema.sql if the pg_cron extension is available on your Supabase plan.
-- This checks scheduled seasons every hour, starts ready seasons automatically,
-- or moves an under-subscribed season back by exactly seven days and alerts admins.

create extension if not exists pg_cron;

select cron.unschedule(jobid)
from cron.job
where jobname = 'dcuk-scheduled-season-start';

select cron.schedule(
  'dcuk-scheduled-season-start',
  '5 * * * *',
  $$select public.process_scheduled_seasons();$$
);
