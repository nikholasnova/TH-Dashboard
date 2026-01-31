# IoT Temp/Humidity Dashboard

Real-time monitoring from multiple sensor nodes. Built for intro engineering class.

## Architecture

```
┌─────────────────┐                     ┌─────────────────┐
│  Arduino R4     │ ── HTTPS POST ───►  │    Supabase     │
│  WiFi + DHT20   │                     │    (Postgres)   │
└─────────────────┘                     └────────┬────────┘
                                                 │
┌─────────────────┐                              ▼
│  Arduino R4     │ ── HTTPS POST ───►  ┌─────────────────┐
│  WiFi + DHT20   │                     │   Next.js App   │
└─────────────────┘                     │   (Vercel)      │
                                        └─────────────────┘
```

## Features

- **Auth**: Shared login (single account) protects dashboard
- Live readings from 2 nodes (30s polling)
- Deployments: track device placement sessions (location + time range)
- Historical charts (1h/6h/24h/7d/custom) with device/deployment filters
- Side-by-side stats comparison with filtering
- AI chat with tool calling (Gemini)
- CSV export
- Dark glassy UI

## Stack

| Layer | Tech |
|-------|------|
| Hardware | Arduino Uno R4 WiFi, DHT20 (I2C), 16x2 LCD |
| Database | Supabase Postgres |
| Auth | Supabase Auth (email/password) |
| Web | Next.js 16 (App Router), Nivo charts |
| AI | Google Gemini |
| Hosting | Vercel |

## Setup

### 1. Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in SQL Editor
3. Grab these from **Settings → API**:
   - Project URL
   - `anon` public key
   - `service_role` secret key

### 2. Supabase Auth (Dashboard Login)

1. Go to **Authentication → Users → Add user**
2. Create a user with email + password (this is your shared login)
3. Make sure "Auto Confirm User" is checked (or confirm manually)

### 3. Web (Local Dev)

```bash
cd web
cp .env.example .env.local
# fill in your keys (see Env Vars section below)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with your Supabase Auth user.

### 4. Arduino

See [arduino/sensor_node/README.md](arduino/sensor_node/README.md) for wiring + firmware.

Quick version:
1. Copy `secrets.example.h` → `secrets.h`
2. Fill in WiFi + Supabase creds
3. Set `DEVICE_ID` to `"node1"` or `"node2"`
4. Upload via Arduino IDE

## Deploy to Vercel

1. Push repo to GitHub
2. Import repo in [Vercel](https://vercel.com)
3. Set **Root Directory** to `web`
4. Add env vars (see table below)
5. Deploy
6. (Optional) Set up Vercel Cron for `/api/keepalive` with `CRON_SECRET`

Arduinos will auto-connect once they have valid `secrets.h` — no code changes needed.

## Project Structure

```
├── arduino/sensor_node/       # firmware + wiring docs
├── supabase/schema.sql        # tables, RLS policies, functions
├── web/src/
│   ├── app/
│   │   ├── page.tsx           # live dashboard
│   │   ├── charts/            # historical charts
│   │   ├── compare/           # stats comparison
│   │   ├── deployments/       # deployment management
│   │   ├── login/             # login page
│   │   └── api/               # chat, summary, keepalive
│   ├── components/
│   │   ├── AuthProvider.tsx   # auth context
│   │   ├── AuthGate.tsx       # protects pages
│   │   ├── UserMenu.tsx       # profile dropdown
│   │   ├── LiveReadingCard.tsx
│   │   ├── DeploymentModal.tsx
│   │   └── AIChat.tsx
│   └── lib/
│       ├── supabase.ts        # client + queries
│       ├── auth.ts            # signIn, signOut, getSession
│       ├── serverAuth.ts      # server-side session check
│       └── aiTools.ts         # Gemini tool execution
```

## Data Format

Stored in Celsius, converted to Fahrenheit in UI.

```json
{"device_id": "node1", "temperature": 22.5, "humidity": 45.2}
```

Device IDs: `node1`, `node2`

## Env Vars

| Var | Where | Notes |
|-----|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local | public |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + local | **secret**, server-only |
| `GOOGLE_API_KEY` | Vercel + local | server-only, for AI chat |
| `CRON_SECRET` | Vercel + local | protects `/api/keepalive` |

Your `.env.local` should look like:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GOOGLE_API_KEY=your-google-api-key
CRON_SECRET=some-random-secret
```

## Auth Notes

- **Dashboard requires login** — all pages redirect to `/login` if not authenticated
- **Arduino uses anon key** — devices can still POST readings without auth (fast path)
- **RLS policies** require `authenticated` role for SELECT on most tables
- **API routes** check session before processing; return 401 if unauthenticated
- **Service role key** is used server-side to bypass RLS after auth is verified

If you want a fully public dashboard (no login), you can:
1. Remove `<AuthGate>` wrappers from pages
2. Revert RLS policies to allow `anon` SELECT

## Troubleshooting

**Can't log in**
- Make sure you created the Supabase Auth user
- Check email is confirmed (or "Auto Confirm" was checked)
- Try lowercase email

**Arduino won't connect to WiFi**
- Check `secrets.h` SSID/password
- R4 only supports 2.4GHz

**No data showing in dashboard**
- Check Supabase table has rows
- Verify env vars are set (check browser console)
- Make sure you're logged in

**Charts/Compare pages empty**
- Run the updated `schema.sql` — function signatures changed
- Grant execute to `authenticated` role (see schema.sql)

**AI chat not responding**
- Confirm `GOOGLE_API_KEY` is set in Vercel
- Check browser console for errors
- Make sure you're logged in (AI routes require auth)

**/api/keepalive returns 401**
- Set `CRON_SECRET` in env vars
- Vercel Cron needs to send `Authorization: Bearer <CRON_SECRET>` header

## License

MIT
