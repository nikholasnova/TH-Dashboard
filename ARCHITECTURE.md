# System Architecture

Full data path from sensor read to dashboard consumption.

## 1) Scope

- Hardware: two Arduino Uno R4 WiFi nodes with DHT20 sensors (I2C) and 16x2 LCDs.
- Cloud: Supabase Postgres (`readings`, `deployments`, `device_alert_state`, RPC functions) + WeatherAPI.com for every-30-min weather reference.
- App: Next.js with authenticated dashboard, charts, comparisons, deployment management, AI chat, in-browser Python analysis, and cron-driven weather ingestion.

## 2) Component Topology

```text
[DHT20 #1] --I2C--> [Arduino node1] --HTTPS POST--> [Supabase Postgres]
[DHT20 #2] --I2C--> [Arduino node2] --HTTPS POST--> [Supabase Postgres]

[Vercel Cron (every 30 min)] --> [GET /api/weather] --> [WeatherAPI.com]
                                           \----> [Supabase Postgres]

[Next.js app] <--authenticated queries/RPC--> [Supabase Postgres]
```

## 3) Sensor Node Pipeline

### 3.1 Read

- DHT20 temperature + humidity every `READ_INTERVAL_MS = 15000` (15s).
- I2C address `0x38` on `SDA`/`SCL`.
- Invalid reads (`NaN`) are discarded.

### 3.2 Aggregation

- Successful reads accumulate in local sums.
- Every `SEND_INTERVAL_MS = 180000` (3 min), compute average temperature (C) and humidity (%).

### 3.3 Uplink

- One HTTPS POST per 3-minute window to `/rest/v1/readings`:

```json
{
  "device_id": "node1",
  "temperature": 22.55,
  "humidity": 45.15
}
```

- `created_at` set server-side by Supabase.

## 4) Persistence Layer (Supabase)

### 4.1 Tables

**`readings`**
- `device_id`, `temperature` (C), `humidity`, `created_at`, `source`, `deployment_id`, `zip_code`, `observed_at`
- `source` constrained to `sensor` (default) or `weather`
- Weather inserts use `device_id = weather_<sensor_device_id>`
- Index on `(device_id, created_at DESC)`
- Soft dedup on half-hour buckets in route code; DB unique index on `(device_id, hour(created_at UTC))` as fallback for `source = weather`

**`deployments`**
- Placement window metadata: `name`, `location`, `zip_code`, `started_at`, `ended_at`
- Optional unique-active constraint per `device_id` where `ended_at IS NULL`

**`device_alert_state`**
- Per-device monitor state: `status`, `last_seen_at`, `last_alert_sent_at`, `last_recovery_sent_at`
- Keepalive route uses this to deduplicate incident and recovery notifications

### 4.2 Security (RLS)

RLS enabled on all tables.

| Table | `anon` | `authenticated` | `service_role` |
|-------|--------|-----------------|----------------|
| `readings` | INSERT | SELECT, DELETE | — |
| `deployments` | — | Full CRUD | — |
| `device_alert_state` | — | SELECT | Upsert (keepalive) |

`/api/weather` uses service_role + `CRON_SECRET`.

### 4.3 RPC Functions

| Function | Purpose |
|----------|---------|
| `get_device_stats(start, end, device_id?)` | Aggregate avg/min/max/stddev/count by device |
| `get_chart_samples(start, end, bucket_min, device_id?)` | Time-bucketed averages for charts |
| `get_deployment_stats(deployment_ids[])` | Deployment-scoped aggregates via time window |
| `get_deployment_readings(deployment_id, limit?)` | Raw readings within a deployment window |

Weather data lives in `readings`, so all RPCs work with weather device IDs (e.g., `weather_node1`).

## 5) Web Application

All pages require Supabase Auth session (`AuthGate`).

### 5.1 Dashboard (`/`)

- Polls every 30s per device (`node1`, `node2`).
- Fetches latest reading + active deployment.
- Renders live cards with deployment context, weather comparison, and 6h sparklines.
- `DashboardStats`: 24h aggregates (avg temp, high/low, reading count, sensor accuracy vs weather).
- `DashboardForecast`: 7-day Holt-Winters forecast per device (runs via Pyodide client-side).
- Floating `ChatShell` available on all pages (mounted in root layout).

### 5.2 Charts (`/charts`)

- Time range: preset, custom, or deployment window.
- Bucket size by span: 3min (<=6h), 6min (<=24h), 30min (<=7d), 60min (>7d).
- CSV export fetches raw readings, excludes `weather_*` rows.

### 5.3 Compare (`/compare`)

- Fetches `get_device_stats` for sensor + weather pairs (`node1`/`weather_node1`, `node2`/`weather_node2`).
- Displays Weather row and `% Error` row per metric.
- `% Error` = node vs its local weather counterpart (not node vs node).
- Celsius converted to Fahrenheit for display.

### 5.4 Deployments (`/deployments`)

- CRUD for deployment metadata with device/location/status filters.
- Optional ZIP code (`12345` or `12345-6789`) for weather lookups.
- Deletion removes associated readings in the deployment time window.

### 5.5 Analysis (`/analysis`)

- Pyodide runtime loaded from CDN (singleton, cached after first load).
- Packages: `numpy`, `pandas`, `scipy`, `statsmodels`.
- Selected deployment readings fetched via Supabase, capped at 5000 rows per deployment.
- Analyses: descriptive stats, correlation, hypothesis testing, seasonal decomposition, forecasting.
- All computation runs client-side.

### 5.6 AI Chat (`POST /api/chat`)

- Authenticated route using Gemini 2.5 Flash with function-calling.
- 7 tools: `get_deployments`, `get_deployment_stats`, `get_readings`, `get_device_stats`, `get_chart_data`, `get_report_data`, `get_weather`.
- Tools execute via `aiTools.ts` with service-role Supabase client.
- Tool loop bounded at 10 iterations; streaming via `TransformStream` with `__STATUS__` markers.
- In-memory rate limiting: 30 requests per 15 min per user (resets on deploy).
- Page context injected into system prompt from `ChatPageContextProvider`.
- Returns Fahrenheit fields and `America/Phoenix` local time.
- System prompt includes weather device IDs for sensor-vs-weather comparisons.
- Accessed via floating `ChatShell` component (layout-level, available on every page).

### 5.7 Keepalive (`GET /api/keepalive`)

- `CRON_SECRET`-protected, runs every 10 min.
- Classifies each device: `ok`, `missing`, `stale`, `anomaly`.
- Sends one alert per state transition via Resend (no repeat spam).
- Optional recovery alert on return to `ok`.

### 5.8 Weather Ingestion (`GET /api/weather`)

- Every-30-min cron (`0,30 * * * *`), `CRON_SECRET`-protected.
- Reads active deployments with non-null `zip_code`.
- Normalizes/validates ZIPs, deduplicates API calls by ZIP.
- Writes one weather row per tracked device with `source = weather`, `deployment_id`, `zip_code`, `observed_at`.
- Idempotent per device per UTC hour.
- Returns: `fetched_count`, `inserted_count`, `skipped_existing_count`, `invalid_zip_count`, errors.

## 6) Data Semantics

- Storage: Celsius. Display: Fahrenheit.
- Sensor device IDs: `node1`, `node2`.
- Weather device IDs: `weather_node1`, `weather_node2`.
- `source = sensor` = Arduino. `source = weather` = WeatherAPI.
- Sensor readings associate to deployments via `device_id + timestamp` window.
- Weather rows store `deployment_id` and `zip_code` for traceability.

## 7) Timing

| Component | Cadence |
|-----------|---------|
| Sensor read | 15s |
| Sensor upload | 3 min (averaged) |
| Weather fetch | Hourly (per unique ZIP) |
| Dashboard poll | 30s |
| Chart bucketing | Postgres RPC, adaptive |

## 8) Failure Modes

| Failure | Behavior |
|---------|----------|
| WiFi disconnect | Firmware reconnects |
| Bad sensor read | Skipped, window continues |
| Upload failure | Window lost, next cycle starts fresh |
| Supabase/RPC error | Logged, empty-state fallback |
| Missing `WEATHER_API_KEY` | Non-throwing `ok: false` response |
| WeatherAPI per-ZIP error | Logged, remaining ZIPs continue |
| Duplicate weather insert | `23505` counted as skipped |
| Pyodide load failure | Retry action surfaced |

## 9) Trust Boundaries

| Boundary | Mechanism |
|----------|-----------|
| Device | Anon key, INSERT-only |
| Browser | Anon client + authenticated session for reads/RPC |
| Server | Service role on server only; `/api/chat` checks auth; cron routes check `CRON_SECRET` |

## 10) Source Files

| Area | Files |
|------|-------|
| Firmware | `arduino/sensor_node/sensor_node.ino` |
| Schema | `supabase/schema.sql` |
| Supabase client | `web/src/lib/supabase.ts` |
| Pages | `web/src/app/{page,charts,compare,deployments,analysis}/page.tsx` |
| AI | `web/src/app/api/chat/route.ts`, `web/src/lib/aiTools.ts`, `web/src/components/ChatShell.tsx`, `web/src/lib/chatContext.tsx` |
| Keepalive | `web/src/app/api/keepalive/route.ts` |
| Weather | `web/src/app/api/weather/route.ts`, `web/src/lib/weatherZip.ts`, `web/src/lib/weatherCompare.ts` |
| Analysis | `web/src/lib/pyodide.ts`, `web/src/lib/analysisRunner.ts` |
| Dashboard extras | `web/src/components/DashboardStats.tsx`, `web/src/components/DashboardForecast.tsx` |
