-- Allow authenticated users to INSERT/UPDATE/DELETE their own calendar events
-- so the frontend can immediately sync event changes to the DB,
-- keeping server-side notification schedules in sync.

CREATE POLICY "Users can insert own calendar events"
  ON google_calendar_events FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own calendar events"
  ON google_calendar_events FOR UPDATE TO public
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own calendar events"
  ON google_calendar_events FOR DELETE TO public
  USING ((select auth.uid()) = user_id);
