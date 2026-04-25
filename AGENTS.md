# IoT Temp/Humidity Dashboard — Project Notes

You are a senior dev helping build an open‑source IoT dashboard for an intro engineering class. Goal: impressive but simple, reproducible, well‑documented.

## Project snapshot
- **Hardware**: N Arduino Uno R4 WiFi nodes, DHT20 sensors (I2C), 16x2 LCD (parallel pins). Number of nodes is dynamic — managed via `devices` table and web UI.
- **DB**: Supabase Postgres via REST API (anon key, RLS insert/select only).
- **Web**: Next.js (App Router) on Vercel.
- **Charts**: Nivo (client only).
- **AI**: Google Gemini via server API route.
- **Data**: store Celsius in DB, convert to Fahrenheit in UI.
- **Sampling**: 15s reads, 3-min averaged uploads. Retry with linear backoff on failure.
- **Live**: polling (30s).

## Long‑term context
- Public repo for college; docs must let others rebuild.
- Supabase Auth required (login page, `AuthGate` wrapper). Single user expected.
- Keep it simple first, add complexity only if needed.
- Dark, glassy, high-contrast UI (timeless + clean).

## Directory map (target)
```
/
├── arduino/
│   └── sensor_node/
├── supabase/
│   └── schema.sql
├── web/
│   └── src/
│       ├── app/
│       ├── components/
│       ├── contexts/
│       └── lib/
├── README.md
└── AGENTS.md
```

## Key refs (when they exist)
- Arduino sketch: `arduino/sensor_node/sensor_node.ino`
- Supabase schema: `supabase/schema.sql`
- Supabase queries: `web/src/lib/supabase/` (types, client, server, queries/)
- Dashboard pages: `web/src/app/*`
- UI components: `web/src/components/*`
- Device context: `web/src/contexts/DevicesContext.tsx`

## Operating principles
- Correct > clever. Keep changes small and reviewable.
- Start simple, add only when needed.
- Avoid new deps unless required.
- Keep secrets out of repo (Arduino `secrets.h`, web `.env*`).
- No PlatformIO; Arduino IDE workflow only.
- Ignore `GEMINI.md` if it shows up.

## Workflow
1) Read relevant files before proposing changes.
2) Ask for missing requirements.
3) Plan non‑trivial work before coding.
4) Change in small steps; recheck behavior.
5) Update README if behavior/env/structure changes.

## Scope rules
- Do only what user asked.
- Prefer editing existing files.
- Create new files only when asked/needed.
- Never commit without explicit approval.

## Verification (if changes warrant)
- **Web**: `cd web && npm run lint && npm run build`
- **Arduino**: compile in Arduino IDE.
- If you can't run tests, say so and give exact commands.

## Data + AI notes
- Table: `readings(device_id, temperature, humidity, created_at, source, deployment_id, zip_code, observed_at)`.
- Device IDs are dynamic, stored in the `devices` table. Sensor device IDs follow the pattern `nodeX` (e.g., `node1`, `node2`). Weather device IDs are `weather_<sensor_id>` (e.g., `weather_node1`).
- AI chat: Gemini 2.5 Flash with 9 function-calling tools (`get_deployments`, `get_deployment_stats`, `get_readings`, `get_device_stats`, `get_chart_data`, `get_report_data`, `get_report_bundle`, `prepare_report`, `get_weather`). Upstash Redis rate limiting (30 req/15 min for auth users, 5 report generations/hour).
- Floating `ChatShell` on all pages; page context injected via `ChatPageContextProvider`.
- Report generation: `prepare_report` emits `__QUESTION__<json>` marker → `ReportOptionsModal` → POST `/api/reports/generate` → isolated Gemini prose call + pure-TS `reportTemplate.ts` → `.tex` stashed in Redis (30-min TTL) → `ReportArtifactCard` with Download .tex + Open in Overleaf (inline `snip` form POST).

---

## Current state (post N-node refactor)

All original phases (0-8) are complete. The project now also includes:

- **N-node scalability**: Dynamic `devices` table replaces hardcoded device list. `DeviceManager` UI for adding/editing/deactivating devices. `DevicesContext` provides device list app-wide. Optional auto-registration on first reading.
- **Weather integration**: WeatherAPI.com cron (every 15 min), per-deployment ZIP, sensor-vs-weather `% Error`.
- **Deployments page**: CRUD for placement windows with device/location/ZIP filters.
- **Keepalive + alerts**: 10-min cron, reads monitored devices from `devices` table, Resend email for incident/recovery.
- **Chat-driven LaTeX report generator** (replaced the old Pyodide analysis page): AI asks for a date range, calls `prepare_report` → `__QUESTION__` marker opens a modal → direct POST to `/api/reports/generate` → isolated Gemini prose call + deterministic pgfplots template → `.tex` served with Download + Open-in-Overleaf buttons.
- **Dashboard extras**: `DashboardStats` (24h aggregates + sensor accuracy).
- **Floating AI chat**: `ChatShell` in root layout, page context injection, 9 tools, streaming with `__STATUS__` and `__QUESTION__` markers.
- **Auth + multi-user**: Supabase Auth with login page, `AuthGate` on all pages, `AuthProvider` with role (`admin`/`user`). `user_roles` table + Custom Access Token Hook injects role into JWT. `UserManager` modal for admin to invite/manage users. Invite-only signup with set-password flow. Middleware for session refresh.
- **Analytics (optional)**: PostHog integration (autocapture, session replay, error tracking). Managed reverse proxy via custom domain. Disabled when env vars are unset.
- **Arduino retry**: Failed uploads retain buffer and retry with linear backoff.

### Key refs
- Arduino sketch: `arduino/sensor_node/sensor_node.ino`
- Supabase schema: `supabase/schema.sql`
- Supabase queries: `web/src/lib/supabase/` (index, types, client, server, queries/)
- Dashboard pages: `web/src/app/{page,charts,compare,data,deployments,login}/page.tsx`
- UI components: `web/src/components/*`
- Device management: `web/src/components/DeviceManager.tsx`, `web/src/contexts/DevicesContext.tsx`, `web/src/lib/supabase/queries/devices.ts`
- AI chat: `web/src/app/api/chat/route.ts`, `web/src/lib/aiTools.ts`, `web/src/components/ChatShell.tsx`, `web/src/components/AIChat.tsx`, `web/src/lib/chatContext.tsx`
- Keepalive: `web/src/app/api/keepalive/route.ts`
- Weather: `web/src/app/api/weather/route.ts`, `web/src/lib/weatherZip.ts`
- Report generation: `web/src/app/api/reports/{generate,[id]/tex,[id]/meta}/route.ts`, `web/src/lib/reportTemplate.ts`, `web/src/lib/reportProse.ts`, `web/src/lib/reportStore.ts`, `web/src/components/ReportOptionsModal.tsx`, `web/src/components/ReportArtifactCard.tsx`
- Dashboard extras: `web/src/components/DashboardStats.tsx`
- User management: `web/src/app/api/users/route.ts`, `web/src/components/UserManager.tsx`
- Auth/roles: `web/src/components/AuthProvider.tsx`, `web/src/lib/serverAuth.ts`, `web/src/middleware.ts`
- Analytics: `web/src/components/PostHogProvider.tsx`, `web/src/lib/posthog-server.ts`

### Design notes
- **Sensor**: DHT20 (I2C) on Uno R4 WiFi.
- **LCD**: parallel 16x2 (based on existing project wiring).
- **Arduino tooling**: Arduino IDE workflow (no PlatformIO).
- **DB units**: store Celsius; UI converts to Fahrenheit.
- **Sampling**: 15s reads, 3-min averaged uploads. Retry with backoff on failure.
- **Live data**: polling every 30s.
- **Charts**: Nivo (client-only rendering).
- **Device management**: `devices` table + `DeviceManager` UI. No hardcoded device list.
