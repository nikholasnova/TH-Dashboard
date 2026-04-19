-- Phase 1: Harden anon INSERT on readings (H1)
--
-- Goal: keep the firmware working (it posts {device_id, temperature, humidity}
-- with anon key) while rejecting attacker payloads: weather-prefixed device ids,
-- out-of-range values, or attempts to set deployment_id/zip_code/observed_at.
--
-- Pre-deploy sanity check (must return 0 before applying in prod):
--   SELECT count(*) FROM readings
--    WHERE source = 'sensor'
--      AND ( device_id !~ '^[a-z0-9_-]{1,32}$'
--         OR device_id LIKE 'weather_%'
--         OR temperature < -50 OR temperature > 100
--         OR humidity < 0 OR humidity > 100
--         OR deployment_id IS NOT NULL );
--
-- Rollback: see 20260418_01_readings_anon_guard_rollback.sql

-- 1. Trigger: block anon from writing weather_ prefixed rows.
--    (RLS also blocks this; trigger is belt-and-suspenders.)
CREATE OR REPLACE FUNCTION reject_anon_weather_writes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'anon'
     AND NEW.device_id LIKE 'weather_%' THEN
    RAISE EXCEPTION 'anon may not write weather rows'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_anon_weather_writes ON readings;
CREATE TRIGGER trg_reject_anon_weather_writes
  BEFORE INSERT ON readings
  FOR EACH ROW EXECUTE FUNCTION reject_anon_weather_writes();

-- 2. Replace permissive anon INSERT policy with a validated one.
--    Postgres evaluates column DEFAULTs before RLS WITH CHECK, so the
--    firmware's partial payload (omits source, deployment_id, etc.)
--    will have defaults applied first and pass these checks.
DROP POLICY IF EXISTS "Allow anonymous insert" ON readings;
DROP POLICY IF EXISTS "Allow anonymous insert validated" ON readings;
CREATE POLICY "Allow anonymous insert validated" ON readings
  FOR INSERT
  TO anon
  WITH CHECK (
    device_id ~ '^[a-z0-9_-]{1,32}$'
    AND device_id NOT LIKE 'weather_%'
    AND temperature >= -50 AND temperature <= 100
    AND humidity >= 0 AND humidity <= 100
    AND source = 'sensor'
    AND deployment_id IS NULL
    AND zip_code IS NULL
    AND observed_at IS NULL
  );
