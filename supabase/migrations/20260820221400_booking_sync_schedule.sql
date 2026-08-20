-- The shared secret is generated inside the database and never leaves it: the
-- schedule below reads it, and the Edge Function reads it through the service
-- role. Nothing has to be copied by hand between the two ends.
insert into public.sync_config (key, value)
select 'sync_secret',
       replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_')
on conflict (key) do nothing;

-- Every 15 minutes, pull Airbnb and any other active source into external_blocks.
select cron.unschedule('sync-ical') where exists (select 1 from cron.job where jobname = 'sync-ical');

select cron.schedule('sync-ical', '*/15 * * * *', $job$
  select net.http_post(
    url := 'https://veqvcuvfcjvoluouqdaf.supabase.co/functions/v1/sync-ical',
    body := jsonb_build_object('trigger', 'cron'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select value from public.sync_config where key = 'sync_secret')
    ),
    timeout_milliseconds := 55000
  );
$job$);
