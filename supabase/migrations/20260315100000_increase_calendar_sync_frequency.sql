-- Increase fetch_calendar_events cron frequency from 15 min to 5 min
-- to reduce the window where stale DB data causes incorrect push notifications
-- for deleted or moved Google Calendar events.
SELECT cron.unschedule('fetch-calendar-events');
SELECT cron.schedule(
  'fetch-calendar-events',
  '*/5 * * * *',
  'SELECT call_fetch_calendar_events();'
);
