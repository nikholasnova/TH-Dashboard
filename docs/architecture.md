# System Architecture

This document describes the full data path from sensor read to dashboard/analysis consumption.

## 1) Scope

- Hardware: two Arduino Uno R4 WiFi nodes with DHT20 sensors (I2C) and 16x2 LCDs.
- Cloud: Supabase Postgres (`readings`, `deployments`, RPC functions).
- Application: Next.js web app with authenticated dashboard, charts, comparisons, deployment management, AI chat, and in-browser Python analysis.

## 2) Component Topology

```text
[DHT20 #1] --I2C--> [Arduino Uno R4 node1] --HTTPS POST--> 
                                                     [Supabase Postgres] <--authenticated queries/RPC-- [Next.js app]
[DHT20 #2] --I2C--> [Arduino Uno R4 node2] --HTTPS POST-->
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
  - `device_id`, `temperature` (C), `humidity`, `created_at`
  - index on `(device_id, created_at DESC)`
- `deployments`
  - metadata for placement windows (`name`, `location`, `started_at`, `ended_at`)
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

### 4.3 RPC Functions

- `get_device_stats(p_start, p_end, p_device_id)`
  - aggregate avg/min/max/stddev/count by device over time range.
- `get_chart_samples(p_start, p_end, p_bucket_minutes, p_device_id)`
  - time-bucketed averages for charting.
- `get_deployment_stats(deployment_ids[])`
  - deployment-scoped aggregates using `device_id + deployment time window`.
- `get_deployment_readings(p_deployment_id, p_limit)`
  - raw readings within a deployment window.

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
- CSV export uses raw readings query for selected range/filter.

### 5.3 Compare (`/compare`)

- Resolves time range (or deployment window).
- Calls `get_device_stats`.
- Converts Celsius -> Fahrenheit in UI for presentation.

### 5.4 Deployments (`/deployments`)

- Reads deployments with optional filters (device/location/status).
- Computes reading counts per deployment using time-window queries.
- Create/update/end/delete deployment metadata via Supabase client operations.
- Deletion also removes readings in that deployment time window.

### 5.5 Python Analysis (`/analysis`)

- Loads Pyodide runtime from CDN (module singleton).
- Loads packages: `numpy`, `pandas`, `scipy`, `statsmodels`.
- Pulls deployment readings via Supabase client.
- Current implementation scope is deployment-window based (up to 5000 rows per selected deployment).
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

### 5.7 Keepalive (`GET /api/keepalive`)

- Protected by `CRON_SECRET`.
- Uses server-side Supabase client.
- Performs lightweight `readings` count query for periodic project activity.
- Evaluates device freshness/anomaly states and sends email alerts via Resend when configured.
- Sends one problem alert per incident state transition (no repeated spam while state is unchanged).
- Sends one optional recovery alert when a device returns to `ok`.

## 6) Data Semantics

- Storage temperature unit: Celsius.
- Display temperature unit: Fahrenheit (UI and AI helper fields).
- `readings` are not foreign-keyed to `deployments`.
  - Association is derived by `device_id` plus timestamp inclusion in deployment window.

## 7) Timing and Throughput Characteristics

- Node sampling: 15s.
- Node upload: 3 min average packet (~12 samples per send window).
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
- Pyodide load failure:
  - analysis page surfaces retry action.

## 9) Trust Boundaries

- Device boundary:
  - device uses anon key for insert-only path.
- Browser boundary:
  - browser uses public anon client + authenticated session for reads/RPC.
- Server boundary:
  - API routes use service role only on server.
  - `/api/chat` and `/api/keepalive` enforce request-level auth/secret checks.

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
