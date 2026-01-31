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
| Web | Next.js 16 (App Router), Nivo charts |
| AI | Google Gemini |
| Hosting | Vercel |

## Setup

### 1. Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in SQL Editor
3. Grab URL + anon key from Settings → API

### 2. Web (Local Dev)

```bash
cd web
cp .env.example .env.local
# fill in your keys
npm install
npm run dev
```

### 3. Arduino

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
4. Add env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GOOGLE_API_KEY`
5. Deploy

Arduinos will auto-connect once they have valid `secrets.h` — no code changes needed.

## Project Structure

```
├── arduino/sensor_node/   # firmware + wiring docs
├── supabase/schema.sql    # tables, RLS, functions
├── web/src/
│   ├── app/               # pages (dashboard, charts, compare, deployments)
│   ├── components/        # LiveReadingCard, DeploymentModal, AIChat
│   └── lib/               # supabase client, queries, AI tools
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
| `GOOGLE_API_KEY` | Vercel + local | server-only, for AI chat |

## Troubleshooting

**Arduino won't connect to WiFi**
- Check `secrets.h` SSID/password
- R4 only supports 2.4GHz

**No data showing in dashboard**
- Check Supabase table has rows
- Verify env vars are set (check browser console)

**AI chat not responding**
- Confirm `GOOGLE_API_KEY` is set in Vercel
- Check browser console for errors

## License

MIT
