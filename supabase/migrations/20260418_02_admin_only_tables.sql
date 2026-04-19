-- Phase 2: Lock devices, deployments, app_settings behind admin (C1/C2/C3)
--
-- Replace per-table "FOR ALL TO authenticated" policies with per-verb admin
-- checks backed by the user_roles table (not the JWT claim, which can be
-- stale for up to the JWT TTL after a role change).
--
-- Also migrate delete_deployment_cascade and delete_readings_range RPCs to
-- check user_roles instead of JWT claim — matching delete_reading_by_id.
--
-- SAFE FOR EXISTING DATA: these are policy replacements; no rows touched.

-- ============================================================
-- devices
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated all on devices" ON devices;
DROP POLICY IF EXISTS "Signed-in can read devices" ON devices;
DROP POLICY IF EXISTS "Admins can insert devices" ON devices;
DROP POLICY IF EXISTS "Admins can update devices" ON devices;
DROP POLICY IF EXISTS "Admins can delete devices" ON devices;

CREATE POLICY "Signed-in can read devices"
  ON devices FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert devices"
  ON devices FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admins can update devices"
  ON devices FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admins can delete devices"
  ON devices FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- ============================================================
-- app_settings
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated update app_settings" ON app_settings;
DROP POLICY IF EXISTS "Admins can update app_settings" ON app_settings;

-- SELECT policy stays as-is (any signed-in user can read settings).
CREATE POLICY "Admins can update app_settings"
  ON app_settings FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- ============================================================
-- deployments
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated insert" ON deployments;
DROP POLICY IF EXISTS "Allow authenticated update" ON deployments;
DROP POLICY IF EXISTS "Allow admin delete" ON deployments;
DROP POLICY IF EXISTS "Admins can insert deployments" ON deployments;
DROP POLICY IF EXISTS "Admins can update deployments" ON deployments;
DROP POLICY IF EXISTS "Admins can delete deployments" ON deployments;

-- SELECT policy "Allow authenticated select" stays as-is.
CREATE POLICY "Admins can insert deployments"
  ON deployments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admins can update deployments"
  ON deployments FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admins can delete deployments"
  ON deployments FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- ============================================================
-- Migrate RPCs: JWT claim -> user_roles lookup
-- ============================================================
CREATE OR REPLACE FUNCTION delete_deployment_cascade(p_deployment_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id TEXT;
  v_started_at TIMESTAMPTZ;
  v_ended_at TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can delete deployments';
  END IF;

  SELECT device_id, started_at, ended_at
    INTO v_device_id, v_started_at, v_ended_at
    FROM public.deployments WHERE id = p_deployment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deployment % not found', p_deployment_id;
  END IF;

  DELETE FROM public.readings r
    WHERE r.device_id = v_device_id
      AND r.created_at >= v_started_at
      AND (v_ended_at IS NULL OR r.created_at <= v_ended_at)
      AND NOT EXISTS (
        SELECT 1
        FROM public.deployments d2
        WHERE d2.id <> p_deployment_id
          AND d2.device_id = v_device_id
          AND r.created_at >= d2.started_at
          AND (d2.ended_at IS NULL OR r.created_at <= d2.ended_at)
      );

  DELETE FROM public.deployments WHERE id = p_deployment_id;
END;
$$;

CREATE OR REPLACE FUNCTION delete_readings_range(
  p_device_id TEXT,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_include_weather BOOLEAN DEFAULT TRUE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT := 0;
  v_sub BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can delete data';
  END IF;

  DELETE FROM public.readings
    WHERE device_id = p_device_id
      AND created_at >= p_start
      AND created_at <= p_end;
  GET DIAGNOSTICS v_sub = ROW_COUNT;
  v_count := v_count + v_sub;

  IF p_include_weather THEN
    DELETE FROM public.readings
      WHERE device_id = 'weather_' || p_device_id
        AND created_at >= p_start
        AND created_at <= p_end;
    GET DIAGNOSTICS v_sub = ROW_COUNT;
    v_count := v_count + v_sub;
  END IF;

  RETURN v_count;
END;
$$;
