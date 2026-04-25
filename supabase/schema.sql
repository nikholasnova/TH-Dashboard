-- IoT Temperature/Humidity Dashboard schema
-- Run this whole file in Supabase SQL Editor.

-- Sensor readings written by devices; app users read/delete these rows.
CREATE TABLE IF NOT EXISTS readings (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  temperature REAL NOT NULL,
  humidity REAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readings_device_time
  ON readings (device_id, created_at DESC);

ALTER TABLE readings ENABLE ROW LEVEL SECURITY;

-- Anon INSERT for device firmware is defined later in this file, after
-- the source / deployment_id / zip_code / observed_at columns are added
-- (the policy's WITH CHECK references them).
DROP POLICY IF EXISTS "Allow anonymous insert" ON readings;
DROP POLICY IF EXISTS "Allow anonymous insert validated" ON readings;
-- Ghost policies that gave anon read/update/delete access in some early prod
-- states. The anon key is shipped to the browser so any wide-open anon SELECT
-- on readings would expose all sensor data; drop them defensively.
DROP POLICY IF EXISTS "Allow anonymous select" ON readings;
DROP POLICY IF EXISTS "Allow anonymous update" ON readings;
DROP POLICY IF EXISTS "Allow anonymous delete" ON readings;

DROP POLICY IF EXISTS "Allow authenticated select" ON readings;
CREATE POLICY "Allow authenticated select" ON readings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Only service_role (server-side) may delete readings; the
-- delete_deployment_cascade RPC uses SECURITY DEFINER for this.
DROP POLICY IF EXISTS "Allow authenticated delete" ON readings;
DROP POLICY IF EXISTS "Allow service_role delete" ON readings;
CREATE POLICY "Allow service_role delete" ON readings
  FOR DELETE
  TO service_role
  USING (true);

-- Deployment metadata used to group readings by place/time window.
CREATE TABLE IF NOT EXISTS deployments (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployments_device ON deployments (device_id);
CREATE INDEX IF NOT EXISTS idx_deployments_location ON deployments (location);
CREATE INDEX IF NOT EXISTS idx_deployments_time ON deployments (started_at, ended_at);
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE deployments
  ALTER COLUMN owner_id SET DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS idx_deployments_owner ON deployments (owner_id);

ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated all" ON deployments;
DROP POLICY IF EXISTS "Allow authenticated select" ON deployments;
DROP POLICY IF EXISTS "Allow authenticated insert" ON deployments;
DROP POLICY IF EXISTS "Allow authenticated update" ON deployments;
DROP POLICY IF EXISTS "Allow admin delete" ON deployments;
DROP POLICY IF EXISTS "Admins can insert deployments" ON deployments;
DROP POLICY IF EXISTS "Admins can update deployments" ON deployments;
DROP POLICY IF EXISTS "Admins can delete deployments" ON deployments;
DROP POLICY IF EXISTS "Signed-in can insert own deployments" ON deployments;
DROP POLICY IF EXISTS "Owners or admins can update deployments" ON deployments;
-- Ghost anon policies that existed in some early prod states — drop them if present.
DROP POLICY IF EXISTS "Allow anonymous select" ON deployments;
DROP POLICY IF EXISTS "Allow anonymous insert" ON deployments;
DROP POLICY IF EXISTS "Allow anonymous update" ON deployments;
DROP POLICY IF EXISTS "Allow anonymous delete" ON deployments;

CREATE POLICY "Allow authenticated select" ON deployments
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Signed-in users may create deployment metadata they own. Updates are limited
-- to the owner or an admin; deletes remain admin-only because deletion cascades
-- into sensor readings.
CREATE POLICY "Signed-in can insert own deployments" ON deployments
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners or admins can update deployments" ON deployments
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete deployments" ON deployments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Alert state for keepalive monitoring and email notifications.
CREATE TABLE IF NOT EXISTS device_alert_state (
  device_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'missing', 'stale', 'anomaly')),
  last_seen_at TIMESTAMPTZ,
  last_alert_type TEXT,
  last_alert_sent_at TIMESTAMPTZ,
  last_alert_deployment_id TEXT,
  last_recovery_sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent add for existing DBs created before last_alert_deployment_id.
ALTER TABLE device_alert_state
  ADD COLUMN IF NOT EXISTS last_alert_deployment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_device_alert_state_status
  ON device_alert_state (status, updated_at DESC);

ALTER TABLE device_alert_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated select alert state" ON device_alert_state;
CREATE POLICY "Allow authenticated select alert state" ON device_alert_state
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- RPCs are used by dashboard pages and AI tools.
CREATE OR REPLACE FUNCTION get_device_stats(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_device_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  device_id TEXT,
  temp_avg DOUBLE PRECISION,
  temp_min DOUBLE PRECISION,
  temp_max DOUBLE PRECISION,
  temp_stddev DOUBLE PRECISION,
  humidity_avg DOUBLE PRECISION,
  humidity_min DOUBLE PRECISION,
  humidity_max DOUBLE PRECISION,
  humidity_stddev DOUBLE PRECISION,
  reading_count BIGINT
)
LANGUAGE SQL STABLE
SET search_path = public
AS $$
  SELECT
    r.device_id,
    AVG(temperature) AS temp_avg,
    MIN(temperature) AS temp_min,
    MAX(temperature) AS temp_max,
    STDDEV_POP(temperature) AS temp_stddev,
    AVG(humidity) AS humidity_avg,
    MIN(humidity) AS humidity_min,
    MAX(humidity) AS humidity_max,
    STDDEV_POP(humidity) AS humidity_stddev,
    COUNT(*) AS reading_count
  FROM public.readings r
  WHERE r.created_at BETWEEN p_start AND p_end
    AND (p_device_id IS NULL OR r.device_id = p_device_id)
  GROUP BY r.device_id;
$$;

CREATE OR REPLACE FUNCTION get_chart_samples(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_bucket_minutes INT,
  p_device_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  bucket_ts TIMESTAMPTZ,
  device_id TEXT,
  temperature_avg DOUBLE PRECISION,
  humidity_avg DOUBLE PRECISION,
  reading_count BIGINT
)
LANGUAGE SQL STABLE
SET search_path = public
AS $$
  SELECT
    TO_TIMESTAMP(
      FLOOR(EXTRACT(EPOCH FROM created_at) / (p_bucket_minutes * 60)) * (p_bucket_minutes * 60)
    ) AS bucket_ts,
    r.device_id,
    AVG(temperature) AS temperature_avg,
    AVG(humidity) AS humidity_avg,
    COUNT(*) AS reading_count
  FROM public.readings r
  WHERE r.created_at BETWEEN p_start AND p_end
    AND (p_device_id IS NULL OR r.device_id = p_device_id)
  GROUP BY r.device_id, bucket_ts
  ORDER BY bucket_ts ASC;
$$;

DROP FUNCTION IF EXISTS get_deployment_stats(BIGINT[]);
CREATE OR REPLACE FUNCTION get_deployment_stats(deployment_ids BIGINT[])
RETURNS TABLE (
  deployment_id BIGINT,
  deployment_name TEXT,
  device_id TEXT,
  location TEXT,
  temp_avg DOUBLE PRECISION,
  temp_min DOUBLE PRECISION,
  temp_max DOUBLE PRECISION,
  temp_stddev DOUBLE PRECISION,
  humidity_avg DOUBLE PRECISION,
  humidity_min DOUBLE PRECISION,
  humidity_max DOUBLE PRECISION,
  humidity_stddev DOUBLE PRECISION,
  reading_count BIGINT
)
LANGUAGE SQL STABLE
SET search_path = public
AS $$
  SELECT
    d.id AS deployment_id,
    d.name AS deployment_name,
    d.device_id,
    d.location,
    AVG(r.temperature),
    MIN(r.temperature),
    MAX(r.temperature),
    STDDEV_POP(r.temperature),
    AVG(r.humidity),
    MIN(r.humidity),
    MAX(r.humidity),
    STDDEV_POP(r.humidity),
    COUNT(r.id)
  FROM public.deployments d
  LEFT JOIN public.readings r ON r.device_id = d.device_id
    AND r.created_at >= d.started_at
    AND (d.ended_at IS NULL OR r.created_at <= d.ended_at)
  WHERE d.id = ANY(deployment_ids)
  GROUP BY d.id, d.name, d.device_id, d.location;
$$;

CREATE OR REPLACE FUNCTION get_deployment_readings(
  p_deployment_id BIGINT,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id BIGINT,
  temperature REAL,
  humidity REAL,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE
SET search_path = public
AS $$
  SELECT r.id, r.temperature, r.humidity, r.created_at
  FROM public.readings r
  JOIN public.deployments d ON r.device_id = d.device_id
  WHERE d.id = p_deployment_id
    AND r.created_at >= d.started_at
    AND (d.ended_at IS NULL OR r.created_at <= d.ended_at)
  ORDER BY r.created_at DESC
  LIMIT p_limit;
$$;

-- Chat/API routes rely on service_role; browser clients rely on authenticated role.
REVOKE EXECUTE ON FUNCTION public.get_device_stats(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_device_stats(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_chart_samples(TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chart_samples(TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_deployment_stats(BIGINT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_deployment_stats(BIGINT[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_deployment_readings(BIGINT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_deployment_readings(BIGINT, INT) TO authenticated, service_role;

-- Weather API integration: add zip_code to deployments for geocoding
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS zip_code TEXT;

-- Weather/source metadata for future sensor-vs-weather analysis and traceability.
ALTER TABLE readings ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'sensor';
ALTER TABLE readings ADD COLUMN IF NOT EXISTS deployment_id BIGINT;
ALTER TABLE readings ADD COLUMN IF NOT EXISTS zip_code TEXT;
ALTER TABLE readings ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ;

-- Backfill any null source values and enforce allowed source labels.
UPDATE readings SET source = 'sensor' WHERE source IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'readings_source_check'
      AND conrelid = 'public.readings'::regclass
  ) THEN
    ALTER TABLE readings
      ADD CONSTRAINT readings_source_check
      CHECK (source IN ('sensor', 'weather'));
  END IF;
END $$;

ALTER TABLE readings ALTER COLUMN source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'readings_deployment_id_fkey'
      AND conrelid = 'public.readings'::regclass
  ) THEN
    ALTER TABLE readings
      ADD CONSTRAINT readings_deployment_id_fkey
      FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_readings_source_time
  ON readings (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_deployment_id
  ON readings (deployment_id);
CREATE INDEX IF NOT EXISTS idx_readings_zip_time
  ON readings (zip_code, created_at DESC);

-- Enforce one weather row per weather-device per 15-minute bucket when possible.
-- Drop the old hourly index if it exists, then create the 15-minute one.
DROP INDEX IF EXISTS idx_readings_weather_device_hour;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_readings_weather_device_quarter_hour'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'readings'
        AND column_name = 'source'
    ) THEN
      RAISE NOTICE 'Skipping idx_readings_weather_device_quarter_hour: readings.source column missing';
    ELSIF EXISTS (
      SELECT 1
      FROM readings r
      WHERE r.source = 'weather'
      GROUP BY r.device_id,
               date_trunc('hour', (r.created_at AT TIME ZONE 'UTC')),
               (EXTRACT(MINUTE FROM (r.created_at AT TIME ZONE 'UTC'))::int / 15)
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Skipping idx_readings_weather_device_quarter_hour: duplicate weather rows detected';
    ELSE
      CREATE UNIQUE INDEX idx_readings_weather_device_quarter_hour
        ON readings (
          device_id,
          date_trunc('hour', (created_at AT TIME ZONE 'UTC')),
          (EXTRACT(MINUTE FROM (created_at AT TIME ZONE 'UTC'))::int / 15)
        )
        WHERE source = 'weather';
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION get_deployments_with_counts(
  p_device_id TEXT DEFAULT NULL,
  p_active_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id BIGINT,
  device_id TEXT,
  name TEXT,
  location TEXT,
  notes TEXT,
  zip_code TEXT,
  owner_id UUID,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  reading_count BIGINT
)
LANGUAGE SQL STABLE
SET search_path = public
AS $$
  SELECT
    d.id, d.device_id, d.name, d.location, d.notes, d.zip_code,
    d.owner_id, d.started_at, d.ended_at, d.created_at,
    COUNT(r.id) AS reading_count
  FROM public.deployments d
  LEFT JOIN public.readings r
    ON r.device_id = d.device_id
    AND r.created_at >= d.started_at
    AND r.created_at <= COALESCE(d.ended_at, NOW())
  WHERE
    (p_device_id IS NULL OR d.device_id = p_device_id)
    AND (NOT p_active_only OR d.ended_at IS NULL)
  GROUP BY d.id
  ORDER BY d.started_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_deployments_with_counts(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_deployments_with_counts(TEXT, BOOLEAN) TO authenticated, service_role;

-- Cascade-delete a deployment and its associated readings in one call.
-- SECURITY DEFINER lets authenticated callers delete readings even though
-- the readings RLS policy restricts DELETE to service_role.
-- Admin role is looked up in user_roles (not JWT) so role changes take effect
-- immediately and the check matches delete_reading_by_id's approach.
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

REVOKE EXECUTE ON FUNCTION public.delete_deployment_cascade(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_deployment_cascade(BIGINT) TO authenticated, service_role;

-- Scoped deletion of readings by device and time range.
-- Used by the Data Cleanup UI on the deployments page.
-- SECURITY DEFINER so it bypasses RLS (readings DELETE is service_role only).
-- Admin role is looked up in user_roles (not JWT) so role changes take effect
-- immediately and the check matches delete_reading_by_id's approach.
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

REVOKE EXECUTE ON FUNCTION public.delete_readings_range(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_readings_range(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated, service_role;

-- Single-row delete for the Data Explorer review flow.
-- SECURITY DEFINER so it bypasses the readings DELETE RLS (service_role only).
-- Admin role is enforced by looking up user_roles directly via auth.uid(),
-- which is robust to stale JWTs (unlike the JWT-claims approach used elsewhere).
CREATE OR REPLACE FUNCTION delete_reading_by_id(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can delete readings';
  END IF;

  DELETE FROM public.readings WHERE id = p_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_reading_by_id(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_reading_by_id(BIGINT) TO authenticated, service_role;

-- Guardrail: one active deployment per device when data allows it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_deployments_one_active_per_device'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM deployments d
      WHERE d.ended_at IS NULL
      GROUP BY d.device_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Skipping idx_deployments_one_active_per_device: duplicate active deployments exist';
    ELSE
      CREATE UNIQUE INDEX idx_deployments_one_active_per_device
        ON deployments (device_id)
        WHERE ended_at IS NULL;
    END IF;
  END IF;
END $$;

-- Guardrail: no overlapping deployment windows per device when data allows it.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deployments_no_overlap_per_device'
      AND conrelid = 'public.deployments'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM deployments d1
      JOIN deployments d2
        ON d1.id < d2.id
       AND d1.device_id = d2.device_id
       AND tstzrange(d1.started_at, COALESCE(d1.ended_at, 'infinity'::timestamptz), '[)')
           && tstzrange(d2.started_at, COALESCE(d2.ended_at, 'infinity'::timestamptz), '[)')
    ) THEN
      RAISE NOTICE 'Skipping deployments_no_overlap_per_device: overlapping deployment windows exist';
    ELSE
      ALTER TABLE deployments
        ADD CONSTRAINT deployments_no_overlap_per_device
        EXCLUDE USING gist (
          device_id WITH =,
          tstzrange(started_at, COALESCE(ended_at, 'infinity'::timestamptz), '[)') WITH &&
        );
    END IF;
  END IF;
END $$;

-- =========================================================================
-- Device registry: each physical sensor node.
-- =========================================================================
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY
    CHECK (id ~ '^[a-z0-9_-]{1,32}$'),
  display_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#a0aec0'
    CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  monitor_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_devices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_devices_updated_at ON devices;
CREATE TRIGGER trg_devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION update_devices_updated_at();

CREATE INDEX IF NOT EXISTS idx_devices_active_sort ON devices (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_devices_monitor ON devices (monitor_enabled, is_active);

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated all on devices" ON devices;
DROP POLICY IF EXISTS "Signed-in can read devices" ON devices;
DROP POLICY IF EXISTS "Admins can insert devices" ON devices;
DROP POLICY IF EXISTS "Admins can update devices" ON devices;
DROP POLICY IF EXISTS "Admins can delete devices" ON devices;

CREATE POLICY "Signed-in can read devices" ON devices
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert devices" ON devices
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admins can update devices" ON devices
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admins can delete devices" ON devices
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Seed known defaults
INSERT INTO devices (id, display_name, color, sort_order) VALUES
  ('node1', 'Node 1', '#0075ff', 1),
  ('node2', 'Node 2', '#01b574', 2)
ON CONFLICT (id) DO NOTHING;

-- Backfill from existing readings so older data isn't orphaned
INSERT INTO devices (id, display_name, color, sort_order)
SELECT DISTINCT r.device_id, 'Sensor ' || r.device_id, '#a0aec0', 99
FROM readings r
WHERE r.source = 'sensor'
  AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.id = r.device_id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO devices (id, display_name, color, sort_order)
SELECT DISTINCT d.device_id, 'Sensor ' || d.device_id, '#a0aec0', 99
FROM deployments d
WHERE NOT EXISTS (SELECT 1 FROM devices dv WHERE dv.id = d.device_id)
  AND d.device_id NOT LIKE 'weather_%'
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deployments_device_id_format'
      AND conrelid = 'public.deployments'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1 FROM deployments
      WHERE device_id !~ '^[a-z0-9_-]{1,32}$'
         OR device_id LIKE 'weather_%'
    ) THEN
      RAISE NOTICE 'Skipping deployments_device_id_format: invalid existing deployment device_id values found';
    ELSE
      ALTER TABLE deployments
        ADD CONSTRAINT deployments_device_id_format
        CHECK (device_id ~ '^[a-z0-9_-]{1,32}$' AND device_id NOT LIKE 'weather_%');
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deployments_text_bounds'
      AND conrelid = 'public.deployments'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1 FROM deployments
      WHERE btrim(name) = ''
         OR length(name) > 200
         OR btrim(location) = ''
         OR length(location) > 200
         OR length(COALESCE(notes, '')) > 2000
    ) THEN
      RAISE NOTICE 'Skipping deployments_text_bounds: invalid existing deployment text values found';
    ELSE
      ALTER TABLE deployments
        ADD CONSTRAINT deployments_text_bounds
        CHECK (
          btrim(name) <> ''
          AND length(name) <= 200
          AND btrim(location) <> ''
          AND length(location) <= 200
          AND length(COALESCE(notes, '')) <= 2000
        );
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deployments_zip_code_format'
      AND conrelid = 'public.deployments'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1 FROM deployments
      WHERE zip_code IS NOT NULL
        AND zip_code !~ '^[0-9]{5}(-[0-9]{4})?$'
    ) THEN
      RAISE NOTICE 'Skipping deployments_zip_code_format: invalid existing ZIP codes found';
    ELSE
      ALTER TABLE deployments
        ADD CONSTRAINT deployments_zip_code_format
        CHECK (zip_code IS NULL OR zip_code ~ '^[0-9]{5}(-[0-9]{4})?$');
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deployments_time_order'
      AND conrelid = 'public.deployments'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1 FROM deployments
      WHERE ended_at IS NOT NULL AND ended_at <= started_at
    ) THEN
      RAISE NOTICE 'Skipping deployments_time_order: invalid existing deployment time windows found';
    ELSE
      ALTER TABLE deployments
        ADD CONSTRAINT deployments_time_order
        CHECK (ended_at IS NULL OR ended_at > started_at);
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deployments_device_id_fkey'
      AND conrelid = 'public.deployments'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM deployments d
      LEFT JOIN devices dv ON dv.id = d.device_id
      WHERE dv.id IS NULL
    ) THEN
      RAISE NOTICE 'Skipping deployments_device_id_fkey: orphan deployment device IDs found';
    ELSE
      ALTER TABLE deployments
        ADD CONSTRAINT deployments_device_id_fkey
        FOREIGN KEY (device_id) REFERENCES devices(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_deployment_device()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM devices
    WHERE id = NEW.device_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'deployment device_id must be an active registered device';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.device_id IS DISTINCT FROM OLD.device_id THEN
    RAISE EXCEPTION 'deployment device_id cannot be changed after creation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_deployment_device_change ON deployments;
DROP TRIGGER IF EXISTS trg_validate_deployment_device ON deployments;
CREATE TRIGGER trg_validate_deployment_device
  BEFORE INSERT OR UPDATE ON deployments
  FOR EACH ROW EXECUTE FUNCTION validate_deployment_device();

DROP FUNCTION IF EXISTS prevent_deployment_device_change();

-- =========================================================================
-- App settings: feature flags stored in DB.
-- =========================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated select app_settings" ON app_settings;
CREATE POLICY "Allow authenticated select app_settings" ON app_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow authenticated update app_settings" ON app_settings;
DROP POLICY IF EXISTS "Admins can update app_settings" ON app_settings;
CREATE POLICY "Admins can update app_settings" ON app_settings
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

INSERT INTO app_settings (key, value) VALUES
  ('device_auto_register', 'false')
ON CONFLICT (key) DO NOTHING;

-- =========================================================================
-- Auto-registration trigger: new sensor device_ids get a devices row.
-- Gated behind app_settings.device_auto_register = 'true'.
-- =========================================================================
CREATE OR REPLACE FUNCTION auto_register_device()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app_settings
    WHERE key = 'device_auto_register' AND value = 'true'
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.source = 'sensor'
     AND NEW.device_id NOT LIKE 'weather_%'
     AND NEW.device_id ~ '^[a-z0-9_-]{1,32}$'
  THEN
    INSERT INTO devices (id, display_name, color, is_active, monitor_enabled, sort_order)
    VALUES (NEW.device_id, 'Sensor ' || NEW.device_id, '#a0aec0', true, false, 99)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_register_device ON readings;
CREATE TRIGGER trg_auto_register_device
  AFTER INSERT ON readings
  FOR EACH ROW EXECUTE FUNCTION auto_register_device();

-- =========================================================================
-- Batched dashboard live RPC: returns latest readings + sparkline for N devices in one call.
-- =========================================================================
CREATE OR REPLACE FUNCTION get_dashboard_live(
  p_device_ids TEXT[],
  p_sparkline_start TIMESTAMPTZ,
  p_sparkline_bucket_minutes INT DEFAULT 15
)
RETURNS TABLE (
  row_type TEXT,
  device_id TEXT,
  id BIGINT,
  temperature REAL,
  humidity REAL,
  created_at TIMESTAMPTZ,
  source TEXT,
  bucket_ts TIMESTAMPTZ,
  temperature_avg DOUBLE PRECISION,
  humidity_avg DOUBLE PRECISION,
  reading_count BIGINT
)
LANGUAGE SQL STABLE
SET search_path = public
AS $$
  -- latest sensor reading per device
  SELECT * FROM (
    SELECT DISTINCT ON (r.device_id)
      'sensor'::TEXT AS row_type,
      r.device_id, r.id, r.temperature, r.humidity, r.created_at, r.source,
      NULL::TIMESTAMPTZ, NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION, NULL::BIGINT
    FROM readings r
    WHERE r.device_id = ANY(p_device_ids)
      AND r.source = 'sensor'
    ORDER BY r.device_id, r.created_at DESC
  ) sensor_latest

  UNION ALL

  -- latest weather reading per device
  SELECT * FROM (
    SELECT DISTINCT ON (r.device_id)
      'weather'::TEXT AS row_type,
      r.device_id, r.id, r.temperature, r.humidity, r.created_at, r.source,
      NULL::TIMESTAMPTZ, NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION, NULL::BIGINT
    FROM readings r
    WHERE r.device_id = ANY(
      SELECT 'weather_' || unnest(p_device_ids)
    )
    ORDER BY r.device_id, r.created_at DESC
  ) weather_latest

  UNION ALL

  -- sparkline buckets
  SELECT * FROM (
    SELECT
      'sparkline'::TEXT AS row_type,
      r.device_id, NULL::BIGINT, NULL::REAL, NULL::REAL, NULL::TIMESTAMPTZ, NULL::TEXT,
      TO_TIMESTAMP(
        FLOOR(EXTRACT(EPOCH FROM r.created_at) / (p_sparkline_bucket_minutes * 60))
        * (p_sparkline_bucket_minutes * 60)
      ) AS bucket_ts,
      AVG(r.temperature)::DOUBLE PRECISION,
      AVG(r.humidity)::DOUBLE PRECISION,
      COUNT(*)
    FROM readings r
    WHERE r.device_id = ANY(p_device_ids)
      AND r.source = 'sensor'
      AND r.created_at >= p_sparkline_start
    GROUP BY r.device_id, bucket_ts
    ORDER BY bucket_ts ASC
  ) sparkline_data;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_live(TEXT[], TIMESTAMPTZ, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_live(TEXT[], TIMESTAMPTZ, INT) TO authenticated, service_role;

-- =========================================================================
-- Report bundle: everything needed to generate a data report in one round trip.
-- Phoenix TZ for hour-of-day bucketing. Temperatures remain in Celsius here;
-- the TS executor converts to Fahrenheit for display.
-- =========================================================================
CREATE OR REPLACE FUNCTION get_report_bundle(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_device_ids TEXT[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH
  sensor_readings AS (
    SELECT device_id, temperature, humidity, created_at
    FROM readings
    WHERE source = 'sensor'
      AND created_at BETWEEN p_start AND p_end
      AND (p_device_ids IS NULL OR device_id = ANY(p_device_ids))
  ),
  weather_readings AS (
    SELECT device_id, temperature, humidity, created_at
    FROM readings
    WHERE source = 'weather'
      AND created_at BETWEEN p_start AND p_end
      AND (
        p_device_ids IS NULL
        OR device_id = ANY(ARRAY(SELECT 'weather_' || unnest(p_device_ids)))
      )
  ),
  scoped_deployments AS (
    SELECT
      d.id, d.device_id, d.name, d.location, d.zip_code,
      d.started_at, d.ended_at,
      (
        SELECT COUNT(*)
        FROM sensor_readings sr
        WHERE sr.device_id = d.device_id
          AND sr.created_at >= d.started_at
          AND (d.ended_at IS NULL OR sr.created_at <= d.ended_at)
      ) AS reading_count
    FROM deployments d
    WHERE (p_device_ids IS NULL OR d.device_id = ANY(p_device_ids))
      AND d.started_at <= p_end
      AND (d.ended_at IS NULL OR d.ended_at >= p_start)
    ORDER BY d.started_at ASC
  ),
  per_deployment AS (
    SELECT
      d.id AS deployment_id,
      d.name AS deployment_name,
      d.device_id,
      AVG(r.temperature)::DOUBLE PRECISION AS temp_avg,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r.temperature)::DOUBLE PRECISION AS temp_median,
      MIN(r.temperature)::DOUBLE PRECISION AS temp_min,
      MAX(r.temperature)::DOUBLE PRECISION AS temp_max,
      STDDEV_POP(r.temperature)::DOUBLE PRECISION AS temp_stddev,
      AVG(r.humidity)::DOUBLE PRECISION AS humidity_avg,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r.humidity)::DOUBLE PRECISION AS humidity_median,
      MIN(r.humidity)::DOUBLE PRECISION AS humidity_min,
      MAX(r.humidity)::DOUBLE PRECISION AS humidity_max,
      STDDEV_POP(r.humidity)::DOUBLE PRECISION AS humidity_stddev,
      COUNT(r.*)::BIGINT AS n
    FROM scoped_deployments d
    LEFT JOIN sensor_readings r
      ON r.device_id = d.device_id
      AND r.created_at >= d.started_at
      AND (d.ended_at IS NULL OR r.created_at <= d.ended_at)
    GROUP BY d.id, d.name, d.device_id
  ),
  overall AS (
    SELECT
      AVG(temperature)::DOUBLE PRECISION AS temp_avg,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY temperature)::DOUBLE PRECISION AS temp_median,
      MIN(temperature)::DOUBLE PRECISION AS temp_min,
      MAX(temperature)::DOUBLE PRECISION AS temp_max,
      STDDEV_POP(temperature)::DOUBLE PRECISION AS temp_stddev,
      AVG(humidity)::DOUBLE PRECISION AS humidity_avg,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY humidity)::DOUBLE PRECISION AS humidity_median,
      MIN(humidity)::DOUBLE PRECISION AS humidity_min,
      MAX(humidity)::DOUBLE PRECISION AS humidity_max,
      STDDEV_POP(humidity)::DOUBLE PRECISION AS humidity_stddev,
      COUNT(*)::BIGINT AS n
    FROM sensor_readings
  ),
  hourly AS (
    SELECT
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'America/Phoenix'))::INT AS hour,
      AVG(temperature)::DOUBLE PRECISION AS temp_avg,
      AVG(humidity)::DOUBLE PRECISION AS humidity_avg,
      COUNT(*)::BIGINT AS n
    FROM sensor_readings
    GROUP BY hour
  ),
  daily_sensor AS (
    SELECT
      (created_at AT TIME ZONE 'America/Phoenix')::DATE AS day,
      AVG(temperature)::DOUBLE PRECISION AS temp_avg,
      AVG(humidity)::DOUBLE PRECISION AS humidity_avg
    FROM sensor_readings
    GROUP BY 1
  ),
  daily_weather AS (
    SELECT
      (created_at AT TIME ZONE 'America/Phoenix')::DATE AS day,
      AVG(temperature)::DOUBLE PRECISION AS temp_avg,
      AVG(humidity)::DOUBLE PRECISION AS humidity_avg
    FROM weather_readings
    GROUP BY 1
  ),
  daily_comp AS (
    SELECT
      s.day,
      s.temp_avg AS sensor_temp,
      w.temp_avg AS weather_temp,
      CASE
        WHEN w.temp_avg IS NOT NULL AND w.temp_avg <> 0
          THEN ((s.temp_avg - w.temp_avg) / w.temp_avg) * 100
        ELSE NULL
      END AS temp_error_pct,
      s.humidity_avg AS sensor_humidity,
      w.humidity_avg AS weather_humidity,
      CASE
        WHEN w.humidity_avg IS NOT NULL AND w.humidity_avg <> 0
          THEN ((s.humidity_avg - w.humidity_avg) / w.humidity_avg) * 100
        ELSE NULL
      END AS humidity_error_pct
    FROM daily_sensor s
    LEFT JOIN daily_weather w ON w.day = s.day
  ),
  outlier_bounds AS (
    SELECT
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY temp_avg)::DOUBLE PRECISION AS temp_q1,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY temp_avg)::DOUBLE PRECISION AS temp_q3,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY humidity_avg)::DOUBLE PRECISION AS humidity_q1,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY humidity_avg)::DOUBLE PRECISION AS humidity_q3
    FROM daily_sensor
  ),
  outliers_temp AS (
    SELECT
      s.day,
      'temperature'::TEXT AS metric,
      s.temp_avg AS value,
      CASE
        WHEN s.temp_avg < b.temp_q1 - 1.5 * (b.temp_q3 - b.temp_q1) THEN 'below'
        ELSE 'above'
      END AS bound
    FROM daily_sensor s, outlier_bounds b
    WHERE b.temp_q3 IS NOT NULL
      AND b.temp_q3 <> b.temp_q1
      AND (
        s.temp_avg < b.temp_q1 - 1.5 * (b.temp_q3 - b.temp_q1)
        OR s.temp_avg > b.temp_q3 + 1.5 * (b.temp_q3 - b.temp_q1)
      )
  ),
  outliers_humidity AS (
    SELECT
      s.day,
      'humidity'::TEXT AS metric,
      s.humidity_avg AS value,
      CASE
        WHEN s.humidity_avg < b.humidity_q1 - 1.5 * (b.humidity_q3 - b.humidity_q1) THEN 'below'
        ELSE 'above'
      END AS bound
    FROM daily_sensor s, outlier_bounds b
    WHERE b.humidity_q3 IS NOT NULL
      AND b.humidity_q3 <> b.humidity_q1
      AND (
        s.humidity_avg < b.humidity_q1 - 1.5 * (b.humidity_q3 - b.humidity_q1)
        OR s.humidity_avg > b.humidity_q3 + 1.5 * (b.humidity_q3 - b.humidity_q1)
      )
  ),
  outliers_all AS (
    SELECT * FROM outliers_temp
    UNION ALL
    SELECT * FROM outliers_humidity
  ),
  ordered_sensor AS (
    SELECT
      device_id,
      created_at,
      LAG(created_at) OVER (PARTITION BY device_id ORDER BY created_at) AS prev_at
    FROM sensor_readings
  ),
  raw_gaps AS (
    SELECT
      device_id,
      prev_at AS gap_start,
      created_at AS gap_end,
      (EXTRACT(EPOCH FROM (created_at - prev_at)) / 3600.0)::DOUBLE PRECISION AS hours
    FROM ordered_sensor
    WHERE prev_at IS NOT NULL
      AND created_at - prev_at > INTERVAL '3 hours'
  ),
  gaps_in_deployment AS (
    SELECT DISTINCT g.gap_start, g.gap_end, g.hours
    FROM raw_gaps g
    JOIN scoped_deployments d
      ON g.device_id = d.device_id
     AND g.gap_start >= d.started_at
     AND g.gap_end <= COALESCE(d.ended_at, NOW())
  ),
  pearson AS (
    SELECT CORR(temperature, humidity)::DOUBLE PRECISION AS r
    FROM sensor_readings
    WHERE temperature IS NOT NULL AND humidity IS NOT NULL
  ),
  per_device_hourly AS (
    SELECT
      device_id,
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'America/Phoenix'))::INT AS hour,
      AVG(temperature)::DOUBLE PRECISION AS temp_avg,
      AVG(humidity)::DOUBLE PRECISION AS humidity_avg,
      COUNT(*)::BIGINT AS n
    FROM sensor_readings
    GROUP BY device_id, hour
  ),
  per_device_daily AS (
    SELECT
      device_id,
      (created_at AT TIME ZONE 'America/Phoenix')::DATE AS day,
      MIN(temperature)::DOUBLE PRECISION AS temp_min,
      AVG(temperature)::DOUBLE PRECISION AS temp_avg,
      MAX(temperature)::DOUBLE PRECISION AS temp_max,
      MIN(humidity)::DOUBLE PRECISION AS humidity_min,
      AVG(humidity)::DOUBLE PRECISION AS humidity_avg,
      MAX(humidity)::DOUBLE PRECISION AS humidity_max,
      COUNT(*)::BIGINT AS n
    FROM sensor_readings
    GROUP BY device_id, day
  ),
  devices_info AS (
    SELECT
      d.id,
      d.display_name,
      d.color
    FROM devices d
    WHERE d.id IN (SELECT DISTINCT device_id FROM sensor_readings)
  )
  SELECT jsonb_build_object(
    'window', jsonb_build_object(
      'start', p_start,
      'end', p_end,
      'days', (EXTRACT(EPOCH FROM (p_end - p_start)) / 86400.0)::DOUBLE PRECISION
    ),
    'deployments', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', sd.id,
          'device_id', sd.device_id,
          'name', sd.name,
          'location', sd.location,
          'zip_code', sd.zip_code,
          'started_at', sd.started_at,
          'ended_at', sd.ended_at,
          'reading_count', sd.reading_count
        )
        ORDER BY sd.started_at
      ) FROM scoped_deployments sd),
      '[]'::jsonb
    ),
    'per_deployment_stats', COALESCE(
      (SELECT jsonb_agg(to_jsonb(pd.*)) FROM per_deployment pd),
      '[]'::jsonb
    ),
    'overall_stats', COALESCE(
      (SELECT to_jsonb(o.*) FROM overall o),
      '{}'::jsonb
    ),
    'hourly_averages', COALESCE(
      (SELECT jsonb_agg(to_jsonb(h.*) ORDER BY h.hour) FROM hourly h),
      '[]'::jsonb
    ),
    'daily_comparison', COALESCE(
      (SELECT jsonb_agg(to_jsonb(dc.*) ORDER BY dc.day) FROM daily_comp dc),
      '[]'::jsonb
    ),
    'pearson_temp_humidity', (SELECT r FROM pearson),
    'outliers', COALESCE(
      (SELECT jsonb_agg(to_jsonb(o.*) ORDER BY o.day, o.metric) FROM outliers_all o),
      '[]'::jsonb
    ),
    'gaps', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'start', g.gap_start,
          'end', g.gap_end,
          'hours', g.hours
        )
        ORDER BY g.gap_start
      ) FROM gaps_in_deployment g),
      '[]'::jsonb
    ),
    'has_weather_data', EXISTS(SELECT 1 FROM weather_readings),
    'has_sensor_data', EXISTS(SELECT 1 FROM sensor_readings),
    'device_count', (SELECT COUNT(DISTINCT device_id)::INT FROM sensor_readings),
    'per_device_hourly', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p.*) ORDER BY p.device_id, p.hour) FROM per_device_hourly p),
      '[]'::jsonb
    ),
    'per_device_daily', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p.*) ORDER BY p.device_id, p.day) FROM per_device_daily p),
      '[]'::jsonb
    ),
    'devices_info', COALESCE(
      (SELECT jsonb_agg(to_jsonb(di.*) ORDER BY di.id) FROM devices_info di),
      '[]'::jsonb
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_report_bundle(TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_report_bundle(TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) TO authenticated, service_role;

-- ============================================================
-- User roles (admin / user)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages roles"
  ON user_roles FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users read own role"
  ON user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Custom Access Token Hook: injects user_role into JWT claims
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  claims    jsonb;
  user_role text;
BEGIN
  SELECT role INTO user_role
    FROM public.user_roles
   WHERE user_id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(COALESCE(user_role, 'user')));
  event  := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Permissions for the hook (Supabase Auth calls it as supabase_auth_admin)
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT SELECT ON TABLE public.user_roles TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- ============================================================
-- Hardened anon INSERT on readings + weather-write trigger.
-- Defined here because WITH CHECK references source / deployment_id /
-- zip_code / observed_at, which are added by ALTER TABLE above.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_registered_sensor_device(p_device_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.devices d
    WHERE d.id = p_device_id
      AND d.is_active = true
      AND p_device_id NOT LIKE 'weather_%'
  )
  OR (
    p_device_id NOT LIKE 'weather_%'
    AND NOT EXISTS (
      SELECT 1
      FROM public.devices d
      WHERE d.id = p_device_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.app_settings s
      WHERE s.key = 'device_auto_register'
        AND s.value = 'true'
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_registered_sensor_device(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_registered_sensor_device(TEXT) TO anon, authenticated, service_role;

CREATE POLICY "Allow anonymous insert validated" ON readings
  FOR INSERT
  TO anon
  WITH CHECK (
    device_id ~ '^[a-z0-9_-]{1,32}$'
    AND device_id NOT LIKE 'weather_%'
    AND public.is_registered_sensor_device(device_id)
    AND temperature >= -50 AND temperature <= 100
    AND humidity >= 0 AND humidity <= 100
    AND source = 'sensor'
    AND deployment_id IS NULL
    AND zip_code IS NULL
    AND observed_at IS NULL
  );

-- Belt-and-suspenders: a BEFORE INSERT trigger also blocks anon from
-- writing weather_* rows. The RLS policy above already rejects these, but
-- the trigger raises a clearer error code (42501) and is robust if the
-- policy is ever relaxed in a future migration.
CREATE OR REPLACE FUNCTION reject_anon_weather_writes()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
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

-- ============================================================
-- Cron idempotency: routes claim a slot before running to avoid duplicate
-- work when a cron provider fires the same endpoint twice in a row (which
-- would email-flood, burn weather-API quota, etc.). Only service_role
-- calls this RPC; RLS on cron_runs rejects everyone else.
-- ============================================================
CREATE TABLE IF NOT EXISTS cron_runs (
  route TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS; everyone else is blocked.

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

-- ============================================================
-- Role-change audit log. Every admin-driven role change (invite, promote,
-- demote, delete) writes a row. No policies: service_role only.
-- ============================================================
CREATE TABLE IF NOT EXISTS role_change_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID NOT NULL,
  target_id UUID NOT NULL,
  old_role TEXT,
  new_role TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('invite', 'promote', 'demote', 'delete')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_change_audit_target
  ON role_change_audit (target_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_role_change_audit_actor
  ON role_change_audit (actor_id, changed_at DESC);

ALTER TABLE role_change_audit ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.
