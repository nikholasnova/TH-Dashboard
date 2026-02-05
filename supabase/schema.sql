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

-- Keep anon INSERT so ESP32 firmware can post directly.
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
