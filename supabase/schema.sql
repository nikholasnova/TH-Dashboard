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

DROP POLICY IF EXISTS "Allow authenticated delete" ON readings;
CREATE POLICY "Allow authenticated delete" ON readings
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

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
