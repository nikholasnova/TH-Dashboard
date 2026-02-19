# Setup

## Prerequisites

- Supabase account
- Node.js + npm
- Arduino IDE
- Vercel account (production)

## 1) Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in SQL Editor (creates all tables, RPC functions, and seed data)
3. Copy from **Settings > API**: Project URL, `anon` key, `service_role` key

## 2) Auth User

1. **Authentication > Users > Add user**
2. Create email/password user
3. Enable auto-confirm (or confirm manually)

## 3) Web (Local)

```bash
cd web
cp .env.example .env.local
# Fill in env vars (see table below)
npm install
npm run dev
```

Open `http://localhost:3000`, sign in with your Supabase Auth user.

## 4) Arduino Nodes

```bash
cd arduino/sensor_node
cp secrets.example.h secrets.h
# Fill WiFi + Supabase credentials
# Set DEVICE_ID to a unique name (e.g., node1, node2, patio_sensor)
# Upload with Arduino IDE
```

Each node needs a unique `DEVICE_ID`. The schema seeds `node1` and `node2` by default. To add more nodes, either:
- Register the device in the web dashboard (Dashboard > Manage Devices > Add Device) before powering it on, or
- Enable auto-registration in `app_settings` and the device will be created when its first reading arrives.

## 5) Vercel Deploy

1. Push repo to GitHub
2. Import in Vercel, set **Root Directory** to `web`
3. Add environment variables
4. Deploy
5. Verify cron jobs from `web/vercel.json`:
   - `/api/keepalive` — every 10 min
   - `/api/weather` — every 30 min

## 6) Environment Variables

| Variable | Scope | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Server-only |
| `GOOGLE_API_KEY` | Secret | Gemini AI |
| `WEATHER_API_KEY` | Secret | WeatherAPI.com |
| `CRON_SECRET` | Secret | Protects cron routes |
| `RESEND_API_KEY` | Secret | Alert emails |
| `ALERT_EMAIL_TO` | Config | Comma-separated recipients |
| `ALERT_EMAIL_FROM` | Config | Optional sender address |
| `MONITORED_DEVICE_IDS` | Config | Optional override. If unset, keepalive monitors all active devices with `monitor_enabled = true` in the `devices` table. |
| `ALERT_STALE_MINUTES` | Config | Default: `10` |
| `ENABLE_RECOVERY_ALERTS` | Config | `true`/`false` |
| `ALERT_DASHBOARD_URL` | Config | Optional link in alert emails |

## 7) Manual Route Checks

```bash
# Keepalive
curl -H "Authorization: Bearer <CRON_SECRET>" "https://<domain>/api/keepalive"

# Weather
curl -H "Authorization: Bearer <CRON_SECRET>" "https://<domain>/api/weather"
```

Weather response includes: `inserted_count`, `skipped_existing_count`, `invalid_zip_count`, `errors`.

## 8) Troubleshooting

| Problem | Fix |
|---------|-----|
| Can't log in | Verify Supabase Auth user exists and is confirmed. Try lowercase email. |
| Arduino won't connect | Check SSID/password in `secrets.h`. Use 2.4GHz network. |
| No data in dashboard | Confirm rows in `readings`, env vars set, authenticated session. Check that the device is registered and active in Manage Devices. |
| Charts/Compare empty | Re-run `schema.sql`. Check RPC `EXECUTE` grants for `authenticated`. |
| Analysis stuck loading | Check console for CDN errors. First load takes 10-30s. |
| AI chat not responding | Confirm `GOOGLE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, auth session. |
| Cron route returns 401 | Verify `CRON_SECRET`. Include `Authorization: Bearer <CRON_SECRET>`. |
| Weather/% Error shows `—` | Deployment needs valid ZIP. Confirm `WEATHER_API_KEY`. Trigger `/api/weather` manually. |
| `device_alert_state` errors | Re-run latest `schema.sql`. |
| No alert emails | Set `RESEND_API_KEY` + `ALERT_EMAIL_TO`. Custom sender needs domain verification. |
| Unwanted device alerts | Toggle monitoring off for that device in Manage Devices, or set `MONITORED_DEVICE_IDS` env var to only the nodes you want. |
| New node not showing up | Register it in Manage Devices first, or enable `device_auto_register` in `app_settings`. |
