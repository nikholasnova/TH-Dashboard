-- IoT Temperature/Humidity Dashboard Schema
-- Run this in Supabase SQL Editor
-- Updated: With auth support (shared login + tightened RLS)

-- ============================================================================
-- READINGS TABLE
-- Core sensor data from Arduino devices
-- ============================================================================

CREATE TABLE IF NOT EXISTS readings (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  temperature REAL NOT NULL,  -- Celsius
  humidity REAL NOT NULL,     -- Percentage
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries (by device, ordered by time)
CREATE INDEX IF NOT EXISTS idx_readings_device_time ON readings (device_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE readings ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for Arduino devices - fast path)
CREATE POLICY "Allow anonymous insert" ON readings
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow authenticated selects (dashboard requires login)
CREATE POLICY "Allow authenticated select" ON readings
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated deletes (for deployment cascade delete)
CREATE POLICY "Allow authenticated delete" ON readings
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- AI RATE LIMITING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_requests (
  id BIGSERIAL PRIMARY KEY,
  requested_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;

-- Authenticated only for AI requests
CREATE POLICY "Allow authenticated all" ON ai_requests
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RPC FUNCTIONS
-- Server-side aggregates for efficient queries
-- ============================================================================

-- Stats by device (with optional device filter)
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
  FROM readings r
  WHERE r.created_at BETWEEN p_start AND p_end
    AND (p_device_id IS NULL OR r.device_id = p_device_id)
  GROUP BY r.device_id;
$$;

GRANT EXECUTE ON FUNCTION get_device_stats(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO anon, authenticated;

-- Chart samples (time-bucketed averages with optional device filter)
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
AS $$
  SELECT
    TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM created_at) / (p_bucket_minutes * 60)) * (p_bucket_minutes * 60)) AS bucket_ts,
    r.device_id,
    AVG(temperature) AS temperature_avg,
    AVG(humidity) AS humidity_avg,
    COUNT(*) AS reading_count
  FROM readings r
  WHERE r.created_at BETWEEN p_start AND p_end
    AND (p_device_id IS NULL OR r.device_id = p_device_id)
  GROUP BY r.device_id, bucket_ts
  ORDER BY bucket_ts ASC;
$$;

GRANT EXECUTE ON FUNCTION get_chart_samples(TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT) TO anon, authenticated;

-- ============================================================================
-- DEPLOYMENTS TABLE
-- Tracks device placement sessions at specific locations
-- ============================================================================

CREATE TABLE IF NOT EXISTS deployments (
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
CREATE INDEX IF NOT EXISTS idx_deployments_device ON deployments (device_id);
CREATE INDEX IF NOT EXISTS idx_deployments_location ON deployments (location);
CREATE INDEX IF NOT EXISTS idx_deployments_time ON deployments (started_at, ended_at);

-- Enable Row Level Security
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

-- Authenticated only for deployments (full CRUD)
CREATE POLICY "Allow authenticated all" ON deployments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- DEPLOYMENT FUNCTIONS
-- Server-side functions for efficient deployment-based queries
-- ============================================================================

-- Get statistics for one or more deployments
CREATE OR REPLACE FUNCTION get_deployment_stats(p_deployment_ids BIGINT[])
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
  WHERE d.id = ANY(p_deployment_ids)
  GROUP BY d.id, d.name, d.device_id, d.location;
$$;

GRANT EXECUTE ON FUNCTION get_deployment_stats(BIGINT[]) TO anon, authenticated;

-- Get readings for a specific deployment
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

GRANT EXECUTE ON FUNCTION get_deployment_readings(BIGINT, INT) TO anon, authenticated;
