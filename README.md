# IoT Temp/Humidity Dashboard

Real-time environmental monitoring from multiple sensor nodes with historical analytics, deployment tracking, and AI-powered data analysis.

## Architecture

```
┌─────────────────┐                     ┌─────────────────┐
│  Arduino R4     │ ── HTTPS POST ───>  │    Supabase     │
│  WiFi + DHT20   │                     │    (Postgres)   │
└─────────────────┘                     └────────┬────────┘
                                                 │
┌─────────────────┐                              v
│  Arduino R4     │ ── HTTPS POST ───>  ┌─────────────────┐
│  WiFi + DHT20   │                     │   Next.js App   │
└─────────────────┘                     │   (Vercel)      │
                                        └─────────────────┘
```

Sensor nodes read temperature/humidity every 15 seconds, average over 3-minute windows, and POST to Supabase. The dashboard polls every 30 seconds.

## Features

- Live readings from multiple nodes (30s polling, offline detection after 5 min)
- Deployment tracking: group readings by device + location + time range
- Historical charts (1h/6h/24h/7d/custom) with device and deployment filters
- Side-by-side stats comparison (avg, min, max, stddev, delta)
- AI chat with Gemini tool-calling (queries deployments, stats, readings)
- AI-generated summaries with rate limiting
- CSV export per time range
- Shared login via Supabase Auth
- Mobile-responsive layout

## Stack

| Layer | Tech |
|-------|------|
| Hardware | Arduino Uno R4 WiFi, DHT20 (I2C), 16x2 LCD |
| Database | Supabase Postgres |
| Auth | Supabase Auth (email/password) |
| Web | Next.js 16 (App Router), Nivo charts |
| AI | Google Gemini 2.5 Flash |
| Hosting | Vercel |

## Data Model

| Table | Purpose |
|-------|---------|
| `readings` | Temperature (Celsius) and humidity per device. Converted to Fahrenheit in UI. |
| `deployments` | Device placement sessions: device + location + time range. Readings associate by matching `device_id` and `created_at` within the window. |
| `ai_requests` | Rate limiting metadata for AI endpoints (15-min cooldown). |

Device IDs: `node1`, `node2`

## API Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/chat` | Required | AI chat with tool-calling. Accepts `{ message, history }`. Streams response. |
| `POST /api/summary` | Required | One-shot 24h data summary via Gemini. Rate limited (15 min). |
| `POST /api/keepalive` | CRON_SECRET | Prevents Supabase free-tier from pausing. |

## Security

- **RLS**: Authenticated users only for SELECT on dashboard data.
- **Device writes**: Anon INSERT for Arduino fast path. Trade-off: data integrity relies on key secrecy rather than per-device auth.
- **API routes**: Return 401 if unauthenticated or missing secret.
- **Server-only secrets**: `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_API_KEY` never exposed to client. Service role key bypasses RLS only after auth is verified at the request level.

## Setup

### 1. Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in SQL Editor
3. Grab from **Settings > API**: Project URL, `anon` public key, `service_role` secret key

### 2. Supabase Auth

1. Go to **Authentication > Users > Add user**
2. Create a user with email + password
3. Enable "Auto Confirm User" (or confirm manually)

### 3. Web (Local Dev)

```bash
cd web
cp .env.example .env.local
# Fill in your keys (see Env Vars below)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with your Supabase Auth user.

### 4. Arduino

See [arduino/sensor_node/README.md](arduino/sensor_node/README.md) for wiring and firmware setup.

```bash
cd arduino/sensor_node
cp secrets.example.h secrets.h
# Fill in WiFi + Supabase credentials
# Set DEVICE_ID to "node1" or "node2"
# Upload via Arduino IDE
```

## Deploy to Vercel

1. Push repo to GitHub
2. Import in [Vercel](https://vercel.com), set **Root Directory** to `web`
3. Add env vars (see table below)
4. Deploy
5. (Optional) Set up Vercel Cron for `/api/keepalive` with `CRON_SECRET`

Arduinos connect automatically once `secrets.h` is configured.

## Project Structure

```
├── arduino/sensor_node/       # Firmware + wiring docs
├── supabase/schema.sql        # Tables, RLS policies, RPC functions
├── web/src/
│   ├── app/
│   │   ├── page.tsx           # Live dashboard
│   │   ├── charts/            # Historical charts
│   │   ├── compare/           # Stats comparison
│   │   ├── deployments/       # Deployment management
│   │   ├── login/             # Auth page
│   │   └── api/               # chat, summary, keepalive
│   ├── components/
│   │   ├── AuthProvider.tsx    # Auth context
│   │   ├── AuthGate.tsx       # Route protection
│   │   ├── Navbar.tsx
│   │   ├── LiveReadingCard.tsx
│   │   ├── DeploymentModal.tsx
│   │   └── AIChat.tsx
│   └── lib/
│       ├── supabase.ts        # Client + queries + RPC wrappers
│       ├── auth.ts            # signIn, signOut, getSession
│       ├── serverAuth.ts      # Server-side session check
│       └── aiTools.ts         # Gemini tool execution
```

## Env Vars

| Var | Where | Notes |
|-----|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + local | **Secret**, server-only |
| `GOOGLE_API_KEY` | Vercel + local | Server-only, Gemini |
| `CRON_SECRET` | Vercel + local | Protects `/api/keepalive` |

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GOOGLE_API_KEY=your-google-api-key
CRON_SECRET=some-random-secret
```

## Disabling Auth

To run as a fully public dashboard:

1. Remove `<AuthGate>` wrappers from pages
2. Revert RLS policies to allow `anon` SELECT

## Performance Notes

- **Server-side aggregation**: Charts and stats use Postgres RPC functions (`get_device_stats`, `get_chart_samples`, `get_deployment_stats`) to avoid transferring raw readings to the client.
- **Bucketing**: Chart queries downsample readings into time buckets (3min for ≤6h, 6min for ≤24h, 30min for ≤7d, 1h for longer ranges). Bucket sizes are tuned for the 3-minute device sampling interval.
- **AI guardrails**: Tool calls cap result sizes (max deployment IDs, max readings per query, 5-iteration tool-call loop limit).
- **Polling**: Dashboard refreshes every 30s. Sensors average over 3 minutes to reduce write volume.

## Trade-offs

- **Shared login** instead of per-user accounts. Simpler ops, no user management overhead.
- **Anon INSERT for devices** keeps firmware simple. Data integrity relies on key secrecy rather than per-device authentication.
- **No foreign key between readings and deployments.** Association is implicit via `device_id` + timestamp window. Simpler schema, but queries must always join on time bounds.

## Troubleshooting

**Can't log in**
- Verify the Supabase Auth user exists and is confirmed
- Try lowercase email

**Arduino won't connect to WiFi**
- Check `secrets.h` SSID/password
- R4 WiFi only supports 2.4GHz networks

**No data in dashboard**
- Check Supabase table for rows
- Verify env vars (check browser console for errors)
- Confirm you're logged in

**Charts/Compare pages empty**
- Run the latest `schema.sql` — RPC function signatures may have changed
- Verify `EXECUTE` is granted to `authenticated` role

**AI chat not responding**
- Confirm `GOOGLE_API_KEY` is set
- Check browser console for errors
- AI routes require authentication

**/api/keepalive returns 401**
- Set `CRON_SECRET` in env vars
- Vercel Cron must send `Authorization: Bearer <CRON_SECRET>` header

## License

MIT
