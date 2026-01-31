-- IoT Temperature/Humidity Readings Table
-- Run this in Supabase SQL Editor

CREATE TABLE readings (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  temperature REAL NOT NULL,  -- Celsius
  humidity REAL NOT NULL,     -- Percentage
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries (by device, ordered by time)
CREATE INDEX idx_readings_device_time ON readings (device_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE readings ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for Arduino devices)
CREATE POLICY "Allow anonymous insert" ON readings
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous selects (for web dashboard)
CREATE POLICY "Allow anonymous select" ON readings
  FOR SELECT
  TO anon
  USING (true);

-- Optional: AI rate limiting table
CREATE TABLE ai_requests (
  id BIGSERIAL PRIMARY KEY,
  requested_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON ai_requests
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous select" ON ai_requests
  FOR SELECT
  TO anon
  USING (true);

-- Stats by device (server-side aggregates)
CREATE OR REPLACE FUNCTION get_device_stats(start_ts TIMESTAMPTZ, end_ts TIMESTAMPTZ)
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
LANGUAGE SQL
STABLE
AS $$
  SELECT
    device_id,
    AVG(temperature) AS temp_avg,
    MIN(temperature) AS temp_min,
    MAX(temperature) AS temp_max,
    STDDEV_POP(temperature) AS temp_stddev,
    AVG(humidity) AS humidity_avg,
    MIN(humidity) AS humidity_min,
    MAX(humidity) AS humidity_max,
    STDDEV_POP(humidity) AS humidity_stddev,
    COUNT(*) AS reading_count
  FROM readings
  WHERE created_at BETWEEN start_ts AND end_ts
  GROUP BY device_id;
$$;

GRANT EXECUTE ON FUNCTION get_device_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;

-- Chart samples (time-bucketed averages)
CREATE OR REPLACE FUNCTION get_chart_samples(
  start_ts TIMESTAMPTZ,
  end_ts TIMESTAMPTZ,
  bucket_seconds INT
)
RETURNS TABLE (
  bucket_ts TIMESTAMPTZ,
  device_id TEXT,
  temperature_avg DOUBLE PRECISION,
  humidity_avg DOUBLE PRECISION,
  reading_count BIGINT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM created_at) / bucket_seconds) * bucket_seconds) AS bucket_ts,
    device_id,
    AVG(temperature) AS temperature_avg,
    AVG(humidity) AS humidity_avg,
    COUNT(*) AS reading_count
  FROM readings
  WHERE created_at BETWEEN start_ts AND end_ts
  GROUP BY device_id, bucket_ts
  ORDER BY bucket_ts ASC;
$$;

GRANT EXECUTE ON FUNCTION get_chart_samples(TIMESTAMPTZ, TIMESTAMPTZ, INT) TO anon;

-- ============================================================================
-- DEPLOYMENTS
-- Deployments track device placement sessions at specific locations.
-- A deployment represents one device at one location for a specific time range.
-- This enables location-aware analysis and flexible comparisons.
-- ============================================================================

-- Deployments table
CREATE TABLE deployments (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,           -- e.g., "Kitchen Test Week 1"
  location TEXT NOT NULL,       -- e.g., "Kitchen"
  notes TEXT,                   -- Optional context
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,         -- NULL = active/ongoing
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_deployments_device ON deployments (device_id);
CREATE INDEX idx_deployments_location ON deployments (location);
CREATE INDEX idx_deployments_time ON deployments (started_at, ended_at);

-- Enable Row Level Security
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

-- RLS policies for deployments (full CRUD for anon key)
CREATE POLICY "Allow anonymous insert" ON deployments
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous select" ON deployments
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous update" ON deployments
  FOR UPDATE
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous delete" ON deployments
  FOR DELETE
  TO anon
  USING (true);

-- ============================================================================
-- DEPLOYMENT FUNCTIONS
-- Server-side functions for efficient deployment-based queries.
-- ============================================================================

-- Get statistics for one or more deployments
-- Joins readings to deployments via device_id and time range
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
LANGUAGE SQL STABLE AS $$
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
  FROM deployments d
  LEFT JOIN readings r ON r.device_id = d.device_id
    AND r.created_at >= d.started_at
    AND (d.ended_at IS NULL OR r.created_at <= d.ended_at)
  WHERE d.id = ANY(deployment_ids)
  GROUP BY d.id, d.name, d.device_id, d.location;
$$;

GRANT EXECUTE ON FUNCTION get_deployment_stats(BIGINT[]) TO anon;

-- Get readings for a specific deployment
-- Returns readings within the deployment's time range, ordered by most recent first
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
LANGUAGE SQL STABLE AS $$
  SELECT r.id, r.temperature, r.humidity, r.created_at
  FROM readings r
  JOIN deployments d ON r.device_id = d.device_id
  WHERE d.id = p_deployment_id
    AND r.created_at >= d.started_at
    AND (d.ended_at IS NULL OR r.created_at <= d.ended_at)
  ORDER BY r.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_deployment_readings(BIGINT, INT) TO anon;
