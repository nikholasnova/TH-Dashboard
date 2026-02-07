# System Architecture

This document describes the full data path from sensor read to dashboard/analysis consumption.

## 1) Scope

- Hardware: two Arduino Uno R4 WiFi nodes with DHT20 sensors (I2C) and 16x2 LCDs.
- Cloud: Supabase Postgres (`readings`, `deployments`, `device_alert_state`, RPC functions) plus WeatherAPI.com for hourly outdoor reference data.
- Application: Next.js web app with authenticated dashboard, charts, comparisons, deployment management, AI chat, in-browser Python analysis, and cron-backed weather ingestion.

## 2) Component Topology

```text
[DHT20 #1] --I2C--> [Arduino Uno R4 node1] --HTTPS POST--> [Supabase Postgres]
[DHT20 #2] --I2C--> [Arduino Uno R4 node2] --HTTPS POST--> [Supabase Postgres]

[Vercel Cron (hourly)] --> [GET /api/weather] --> [WeatherAPI.com current endpoint]
                                           \----> [Supabase Postgres]

[Next.js app] <--authenticated queries/RPC--> [Supabase Postgres]
```

## 3) Embedded Node Pipeline

### 3.1 Sensor Read Stage

- The node reads DHT20 temperature and humidity every `READ_INTERVAL_MS = 15000` (15s).
- DHT20 is on I2C (`SDA`/`SCL`, address `0x38`).
- If a read is invalid (`NaN`), it is discarded and not included in upload aggregates.

### 3.2 Local Aggregation Stage

- Each successful read is accumulated in local sums.
- Every `SEND_INTERVAL_MS = 180000` (3 min), node computes:
  - average temperature (Celsius)
  - average humidity (%)

### 3.3 Uplink Stage

- Node sends one HTTPS request per 3-minute window:
  - Method: `POST`
  - Path: `/rest/v1/readings`
  - Auth headers: `apikey`, `Authorization: Bearer <anon-key>`
  - Body:

```json
{
  "device_id": "node1",
  "temperature": 22.55,
  "humidity": 45.15
}
```

- Supabase sets `created_at` server-side.

## 4) Persistence and Query Layer (Supabase)

### 4.1 Tables

- `readings`
  - `device_id`, `temperature` (C), `humidity`, `created_at`, `source`, `deployment_id`, `zip_code`, `observed_at`
  - `source` is constrained to `sensor` or `weather` (`sensor` default)
  - weather inserts use `device_id = weather_<sensor_device_id>`
  - index on `(device_id, created_at DESC)`
  - weather uniqueness guardrail on `(device_id, hour(created_at UTC))` for `source = weather` when historical duplicates allow it
- `deployments`
  - metadata for placement windows (`name`, `location`, `zip_code`, `started_at`, `ended_at`)
  - optional unique-active guardrail on `device_id` where `ended_at is null` when historical duplicates allow it
- `device_alert_state`
  - monitor state per device (`status`, `last_seen_at`, `last_alert_sent_at`, `last_recovery_sent_at`)
  - used by keepalive route to deduplicate incident and recovery notifications

### 4.2 Security Model

- RLS enabled on both tables.
- `readings`:
  - `anon`: `INSERT` allowed (device fast path)
  - `authenticated`: `SELECT` and `DELETE`
- `deployments`:
  - `authenticated`: full CRUD
- `device_alert_state`:
  - `authenticated`: `SELECT`
  - `service_role`: route-managed upsert from `/api/keepalive`
- Weather ingestion route (`/api/weather`) uses service-role server credentials and `CRON_SECRET` authentication.

### 4.3 RPC Functions

- `get_device_stats(p_start, p_end, p_device_id)`
  - aggregate avg/min/max/stddev/count by device over time range.
- `get_chart_samples(p_start, p_end, p_bucket_minutes, p_device_id)`
  - time-bucketed averages for charting.
- `get_deployment_stats(deployment_ids[])`
  - deployment-scoped aggregates using `device_id + deployment time window`.
- `get_deployment_readings(p_deployment_id, p_limit)`
  - raw readings within a deployment window.
- Weather data is written into `readings` so existing RPCs can include weather devices via `p_device_id` (for example `weather_node1`).

## 5) Web Application Data Flows

All UI pages are protected by `AuthGate`; users must be signed in with Supabase Auth session.

### 5.1 Dashboard (`/`)

- Poll interval: 30s.
- For each device (`node1`, `node2`):
  - fetch latest reading (`readings` ordered by `created_at desc limit 1`)
  - fetch active deployment (`ended_at is null`)
- Renders live cards + current deployment context.

### 5.2 Charts (`/charts`)

- Resolves a time range (preset/custom/deployment window).
- Chooses bucket size based on span:
  - <=6h: 3 min
  - <=24h: 6 min
  - <=7d: 30 min
  - longer: 60 min
- Calls `get_chart_samples`.
- CSV export uses raw readings query for selected range/filter and excludes `weather_*` rows.

### 5.3 Compare (`/compare`)

- Resolves time range (or deployment window).
- Calls `get_device_stats` for paired sensor and weather device IDs (`node1` + `weather_node1`, `node2` + `weather_node2`) when scoped.
- Converts Celsius -> Fahrenheit in UI for presentation.
- Shows Weather rows and `% Error` rows for temperature and humidity when data exists.

### 5.4 Deployments (`/deployments`)

- Reads deployments with optional filters (device/location/status).
- Computes reading counts per deployment using time-window queries.
- Create/update/end/delete deployment metadata via Supabase client operations.
- Supports optional ZIP code (`12345` or `12345-6789`) for weather lookups.
- Deletion also removes readings in that deployment time window.

### 5.5 Python Analysis (`/analysis`)

- Loads Pyodide runtime from CDN (module singleton).
- Loads packages: `numpy`, `pandas`, `scipy`, `statsmodels`.
- Pulls deployment readings via Supabase client.
- Applies the selected analysis time range as an intersection with each deployment window.
- Caps each selected deployment to the latest 5000 rows in that effective window (then restores chronological order for time-series analysis).
- Runs selected analyses in-browser:
  - descriptive stats
  - correlation
  - hypothesis testing
  - seasonal decomposition
  - forecasting
- No analysis API route is required; computation is client-side after data retrieval.

### 5.6 AI Chat (`POST /api/chat`)

- Route requires authenticated user (`getServerUser`).
- Uses Gemini (`gemini-2.5-flash`) with function-calling tools.
- Tools execute server-side through `aiTools.ts` with service-role Supabase client.
- Tool loop is bounded (max 10 iterations).
- Returned values include Fahrenheit convenience fields and local-time formatting (`America/Phoenix`).
- System prompt/tool descriptions include weather device IDs so AI can compare indoor sensor readings against outdoor weather companions.

### 5.7 Keepalive (`GET /api/keepalive`)

- Protected by `CRON_SECRET`.
- Uses server-side Supabase client.
- Performs lightweight `readings` count query for periodic project activity.
- Evaluates device freshness/anomaly states and sends email alerts via Resend when configured.
- Sends one problem alert per incident state transition (no repeated spam while state is unchanged).
- Sends one optional recovery alert when a device returns to `ok`.

### 5.8 Weather Ingestion (`GET /api/weather`)

- Triggered by Vercel Cron hourly (`0 * * * *`).
- Protected by `CRON_SECRET` (header bearer token or `?secret=` query param).
- Requires server env vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEATHER_API_KEY`.
- Reads active deployments with non-null `zip_code`.
- Normalizes and validates ZIP codes, deduplicates WeatherAPI calls by ZIP, and resolves duplicates for the same active device by most recent `started_at`.
- Writes one weather row per tracked sensor device into `readings` with `source = weather`, `deployment_id`, `zip_code`, and `observed_at`.
- Performs idempotency checks per weather device per UTC hour to avoid duplicate inserts.
- Returns summary counters (`fetched_count`, `inserted_count`, `skipped_existing_count`, `invalid_zip_count`, `duplicate_active_device_count`) and per-ZIP errors.

## 6) Data Semantics

- Storage temperature unit: Celsius.
- Display temperature unit: Fahrenheit (UI and AI helper fields).
- Sensor device IDs: `node1`, `node2`.
- Weather device IDs: `weather_node1`, `weather_node2` (derived from sensor IDs).
- `source = sensor` rows come from Arduino nodes; `source = weather` rows come from `/api/weather`.
- Sensor readings remain deployment-window derived by `device_id + timestamp`.
- Weather rows also store `deployment_id` and `zip_code` metadata for traceability.

## 7) Timing and Throughput Characteristics

- Node sampling: 15s.
- Node upload: 3 min average packet (~12 samples per send window).
- Weather fetch cadence: hourly (one WeatherAPI call per unique active ZIP code).
- Dashboard refresh: 30s.
- Chart data is downsampled in Postgres (bucket RPC) to control payload size.
- Analysis page can request large windows; client-side Python runtime cost is amortized by browser caching.

## 8) Failure and Recovery Behavior

- WiFi disconnect on node:
  - firmware attempts reconnect.
- Sensor read failure:
  - reading is skipped; aggregate window continues.
- HTTPS send failure:
  - window upload fails; next cycle continues with new window.
- Supabase/RPC/UI errors:
  - client logs and returns empty-state fallbacks.
- Weather route failure:
  - missing weather key returns non-throwing JSON error (`ok: false`)
  - WeatherAPI per-ZIP failures are collected in response `errors` while continuing remaining ZIPs
  - duplicate insert races are tolerated (`23505` counted as skipped)
- Pyodide load failure:
  - analysis page surfaces retry action.

## 9) Trust Boundaries

- Device boundary:
  - device uses anon key for insert-only path.
- Browser boundary:
  - browser uses public anon client + authenticated session for reads/RPC.
- Server boundary:
  - API routes use service role only on server.
  - `/api/chat` enforces authenticated user checks.
  - `/api/keepalive` and `/api/weather` enforce `CRON_SECRET`.

## 10) Primary Source Files

- Firmware: `arduino/sensor_node/sensor_node.ino`
- Sensor node docs: `arduino/sensor_node/README.md`
- Schema + RLS + RPC: `supabase/schema.sql`
- Supabase browser client + queries: `web/src/lib/supabase.ts`
- Dashboard flow: `web/src/app/page.tsx`
- Charts flow: `web/src/app/charts/page.tsx`
- Compare flow: `web/src/app/compare/page.tsx`
- Deployments flow: `web/src/app/deployments/page.tsx`
- Analysis runtime + scripts: `web/src/lib/pyodide.ts`, `web/src/lib/analysisRunner.ts`
- AI route + tools: `web/src/app/api/chat/route.ts`, `web/src/lib/aiTools.ts`
- Keepalive route: `web/src/app/api/keepalive/route.ts`
- Weather route: `web/src/app/api/weather/route.ts`
- Weather helper utilities: `web/src/lib/weatherZip.ts`, `web/src/lib/weatherCompare.ts`
