-- Phase 6: Cron idempotency (M3)
--
-- Prevents repeated cron endpoint invocations within a short window from
-- doing duplicate work (email floods, API-key burn). Each route calls
-- claim_cron_run at the top; the RPC returns TRUE only when enough time
-- has passed since the last successful claim.

CREATE TABLE IF NOT EXISTS cron_runs (
  route TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (bypasses RLS) writes.

CREATE OR REPLACE FUNCTION claim_cron_run(
  p_route TEXT,
  p_min_interval_ms INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := NOW() - (p_min_interval_ms || ' milliseconds')::interval;
  v_claimed BOOLEAN := FALSE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cron:' || p_route));

  INSERT INTO cron_runs (route, last_run_at)
  VALUES (p_route, NOW())
  ON CONFLICT (route) DO UPDATE
    SET last_run_at = NOW()
    WHERE cron_runs.last_run_at < v_cutoff
  RETURNING TRUE INTO v_claimed;

  RETURN COALESCE(v_claimed, FALSE);
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_cron_run(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_cron_run(TEXT, INT) TO service_role;
