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
