-- Rollback for 20260418_01_readings_anon_guard.sql
-- Run this ONLY if firmware starts failing after the main migration.

DROP TRIGGER IF EXISTS trg_reject_anon_weather_writes ON readings;
DROP FUNCTION IF EXISTS reject_anon_weather_writes();

DROP POLICY IF EXISTS "Allow anonymous insert validated" ON readings;
CREATE POLICY "Allow anonymous insert" ON readings
  FOR INSERT
  TO anon
  WITH CHECK (true);
