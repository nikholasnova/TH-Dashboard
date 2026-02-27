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

-- Keep anon INSERT so device firmware can post directly.
DROP POLICY IF EXISTS "Allow anonymous insert" ON readings;
CREATE POLICY "Allow anonymous insert" ON readings
  FOR INSERT
  TO anon
  WITH CHECK (true);

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

ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated all" ON deployments;
CREATE POLICY "Allow authenticated all" ON deployments
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Alert state for keepalive monitoring and email notifications.
CREATE TABLE IF NOT EXISTS device_alert_state (
  device_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'missing', 'stale', 'anomaly')),
  last_seen_at TIMESTAMPTZ,
  last_alert_type TEXT,
  last_alert_sent_at TIMESTAMPTZ,
  last_recovery_sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- Enforce one weather row per weather-device per hour when possible.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_readings_weather_device_hour'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'readings'
        AND column_name = 'source'
    ) THEN
      RAISE NOTICE 'Skipping idx_readings_weather_device_hour: readings.source column missing';
    ELSIF EXISTS (
      SELECT 1
      FROM readings r
      WHERE r.source = 'weather'
      GROUP BY r.device_id, date_trunc('hour', (r.created_at AT TIME ZONE 'UTC'))
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Skipping idx_readings_weather_device_hour: duplicate historical weather rows detected';
    ELSE
      CREATE UNIQUE INDEX idx_readings_weather_device_hour
        ON readings (device_id, date_trunc('hour', (created_at AT TIME ZONE 'UTC')))
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
    d.started_at, d.ended_at, d.created_at,
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
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
CREATE POLICY "Allow authenticated all on devices" ON devices
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

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
CREATE POLICY "Allow authenticated update app_settings" ON app_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

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
      AND r.source = 'weather'
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
