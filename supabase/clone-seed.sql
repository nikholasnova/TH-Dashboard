-- Seed data for the pen-test clone project.
-- Run in the clone project's SQL editor AFTER applying schema.sql.
-- Safe to re-run: uses ON CONFLICT to avoid duplicates.

-- 2 test devices
INSERT INTO devices (id, display_name, color, is_active, monitor_enabled, sort_order, created_at, updated_at)
VALUES
  ('node1', 'Test Node 1', '#6B9EE2', true, true, 1, NOW(), NOW()),
  ('node2', 'Test Node 2', '#8FB58F', true, true, 2, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 1 active deployment per device (so the Deployments page / charts have scope)
INSERT INTO deployments (device_id, name, location, zip_code, started_at, created_at)
VALUES
  ('node1', 'Test Kitchen', 'Kitchen', '85142', NOW() - INTERVAL '48 hours', NOW()),
  ('node2', 'Test Patio',   'Patio',   '85142', NOW() - INTERVAL '48 hours', NOW())
ON CONFLICT DO NOTHING;

-- 24h of 3-min averaged readings per device (≈ 480 rows per device, 960 total)
-- Temp walks around 22±3 C, humidity around 45±10 %
INSERT INTO readings (device_id, temperature, humidity, source, created_at)
SELECT
  device,
  22 + 3 * sin(i::float / 20) + (random() - 0.5),
  45 + 8 * cos(i::float / 30) + (random() - 0.5) * 3,
  'sensor',
  NOW() - (i || ' minutes')::interval * 3
FROM
  generate_series(0, 479) i
  CROSS JOIN (VALUES ('node1'), ('node2')) AS d(device);

-- A few weather readings so the "% Error" cards show something
INSERT INTO readings (device_id, temperature, humidity, source, created_at, zip_code)
SELECT
  'weather_' || device,
  21.5 + (random() - 0.5),
  46 + (random() - 0.5) * 2,
  'weather',
  NOW() - (i || ' minutes')::interval * 15,
  '85142'
FROM
  generate_series(0, 23) i
  CROSS JOIN (VALUES ('node1'), ('node2')) AS d(device);

-- Sanity check
SELECT device_id, source, COUNT(*) AS rows
FROM readings
GROUP BY device_id, source
ORDER BY device_id, source;
