-- Harden role enforcement: add admin checks inside destructive RPCs
-- and split the deployments RLS policy into per-operation policies.

-- 1. Add admin role check to delete_deployment_cascade
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
  v_role TEXT;
BEGIN
  -- Enforce admin-only access
  v_role := coalesce(
    current_setting('request.jwt.claims', true)::json->>'user_role',
    'user'
  );
  IF v_role <> 'admin' THEN
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

REVOKE EXECUTE ON FUNCTION public.delete_deployment_cascade(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_deployment_cascade(BIGINT) TO authenticated, service_role;

-- 2. Add admin role check to delete_readings_range
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
  v_role TEXT;
BEGIN
  -- Enforce admin-only access
  v_role := coalesce(
    current_setting('request.jwt.claims', true)::json->>'user_role',
    'user'
  );
  IF v_role <> 'admin' THEN
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

REVOKE EXECUTE ON FUNCTION public.delete_readings_range(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_readings_range(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated, service_role;

-- 3. Split deployments "FOR ALL" policy into per-operation policies
-- so that only admins can DELETE deployments at the RLS level.
DROP POLICY IF EXISTS "Allow authenticated all" ON deployments;

CREATE POLICY "Allow authenticated select" ON deployments
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated insert" ON deployments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated update" ON deployments
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Admin-only DELETE: check the JWT role claim injected by the custom access token hook
CREATE POLICY "Allow admin delete" ON deployments
  FOR DELETE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND coalesce(
      current_setting('request.jwt.claims', true)::json->>'user_role',
      'user'
    ) = 'admin'
  );
