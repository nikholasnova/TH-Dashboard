# Setup Guide

This guide walks you through forking this repo and getting a fully working IoT temperature and humidity monitoring system. By the end, you will have Arduino sensor nodes posting data to a cloud database and a live web dashboard to view, analyze, and compare your readings.

---

## Table of Contents

1. [What You Need](#1-what-you-need)
2. [Fork and Clone the Repo](#2-fork-and-clone-the-repo)
3. [Set Up Supabase (Database)](#3-set-up-supabase-database)
4. [Set Up the Web App Locally](#4-set-up-the-web-app-locally)
5. [Set Up Arduino Sensor Nodes](#5-set-up-arduino-sensor-nodes)
6. [Deploy to Vercel (Production)](#6-deploy-to-vercel-production)
7. [Set Up Weather Comparison (Optional)](#7-set-up-weather-comparison-optional)
8. [Set Up AI Chat (Optional)](#8-set-up-ai-chat-optional)
9. [Set Up Email Alerts (Optional)](#9-set-up-email-alerts-optional)
10. [Inviting Users (Multi-User)](#10-inviting-users-multi-user)
11. [Analytics (Optional)](#11-analytics-optional)
12. [Environment Variable Reference](#12-environment-variable-reference)
13. [Verifying Everything Works](#13-verifying-everything-works)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What You Need

### Accounts (all free tier)

| Service | Purpose | Sign Up |
|---------|---------|---------|
| **GitHub** | Host your fork | [github.com](https://github.com) |
| **Supabase** | Database + authentication | [supabase.com](https://supabase.com) |
| **Vercel** | Web hosting + scheduled jobs | [vercel.com](https://vercel.com) |

Optional services (set up later if you want them):

| Service | Purpose | Sign Up |
|---------|---------|---------|
| **Google Cloud** | AI chat (Gemini) | [console.cloud.google.com](https://console.cloud.google.com) |
| **WeatherAPI.com** | Weather comparison data | [weatherapi.com/signup](https://www.weatherapi.com/signup) |
| **Resend** | Email alerts when a sensor goes offline | [resend.com](https://resend.com) |

### Software

- **Node.js** (v18 or later) and **npm** -- [nodejs.org](https://nodejs.org)
- **Arduino IDE** (2.x recommended) -- [arduino.cc/en/software](https://www.arduino.cc/en/software)
- **Git** -- [git-scm.com](https://git-scm.com)

### Hardware (per sensor node)

| Component | Notes |
|-----------|-------|
| Arduino Uno R4 WiFi | The board with built-in WiFi -- not the R4 Minima |
| DHT20 temperature/humidity sensor | I2C, address 0x38 |
| 16x2 LCD display | Parallel 4-bit wiring (optional, for on-device readout) |
| Breadboard + jumper wires | For prototyping |
| 10K potentiometer | LCD contrast adjustment |
| USB cable | Power + programming |

---

## 2. Fork and Clone the Repo

1. Go to the original repository on GitHub.
2. Click **Fork** in the top right.
3. Clone your fork to your computer:

```bash
git clone https://github.com/YOUR-USERNAME/Temp-Humidity-Monitoring.git
cd Temp-Humidity-Monitoring
```

---

## 3. Set Up Supabase (Database)

Supabase gives you a hosted Postgres database with a REST API. The Arduino posts data here, and the web app reads from it.

### 3.1 Create a Project

1. Log in at [supabase.com](https://supabase.com) and click **New Project**.
2. Pick a name, set a database password (you won't need this directly), and choose a region close to you.
3. Wait for the project to finish provisioning.

### 3.2 Run the Schema

The file `supabase/schema.sql` creates all the tables, functions, and security policies the system needs.

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar).
2. Click **New Query**.
3. Open `supabase/schema.sql` from the repo in a text editor, copy the entire contents, and paste it into the query editor.
4. Click **Run**.

You should see success messages. This creates the `readings`, `devices`, `deployments`, `app_settings`, and `device_alert_state` tables, plus all the RPC functions the dashboard uses. It also seeds two starter devices (`node1` and `node2`).

### 3.3 Set Up User Roles

The schema already creates the `user_roles` table and the custom access token hook function. You just need to enable the hook:

1. In Supabase, go to **Authentication** > **Hooks** > **Custom Access Token Hook**.
2. Select schema `public` and function `custom_access_token_hook`.

### 3.4 Create Your Admin Account

1. In Supabase, go to **Authentication** > **Users**.
2. Click **Add User** > **Create New User**.
3. Enter an email and password. Check **Auto Confirm User**.
4. Click **Create User**.
5. Copy the user's UUID from the Users list, then run in the SQL Editor:

```sql
INSERT INTO user_roles (user_id, role) VALUES ('<your-user-uuid>', 'admin');

UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE id = '<your-user-uuid>';
```

This makes you an admin. You can invite additional users from the dashboard later (see section 9.5).

### 3.5 Copy Your API Credentials

You need three values from Supabase. Find them at **Settings** > **API** (under "Project Settings" in the left sidebar):

| What to copy | Where it is | What it's for |
|--------------|-------------|---------------|
| **Project URL** | Under "Project URL" | Tells the app and Arduino where your database is |
| **anon public** key | Under "Project API keys" | Used by the Arduino to insert data and by the browser for reads |
| **service_role** key | Under "Project API keys" (click "Reveal") | Used by server-side code only -- keep this secret |

Write these down or keep the tab open. You will need them in the next two sections.

---

## 4. Set Up the Web App Locally

### 4.1 Create Your Environment File

```bash
cd web
cp .env.example .env.local
```

Open `web/.env.local` in a text editor and fill in the three Supabase values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

You also need a `CRON_SECRET` -- this can be any random string. It protects the scheduled API routes. Make one up or generate one:

```bash
openssl rand -hex 32
```

Paste it in:

```
CRON_SECRET=your-random-string-here
```

The other variables in `.env.example` are for optional features (weather, AI, alerts). You can leave them blank for now and add them later.

### 4.2 Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You should see a login page. Sign in with the email and password you created in Supabase.

The dashboard will be empty until your Arduino starts sending data.

---

## 5. Set Up Arduino Sensor Nodes

### 5.1 Install Board Support and Libraries

In Arduino IDE:

1. **Tools > Boards Manager** -- search for **"Arduino UNO R4"** and install the board package.
2. **Tools > Manage Libraries** -- search for **"DFRobot DHT20"** and install it.

The `LiquidCrystal` and `WiFiS3` libraries are built in and do not need separate installation.

### 5.2 Wire the Hardware

#### DHT20 Sensor (I2C)

| DHT20 Pin | Arduino Pin |
|-----------|-------------|
| VCC | 5V |
| GND | GND |
| SDA | SDA (A4) |
| SCL | SCL (A5) |

#### 16x2 LCD Display (Parallel 4-bit) -- optional

| LCD Pin | Arduino Pin | Notes |
|---------|-------------|-------|
| VSS | GND | |
| VDD | 5V | |
| V0 | Potentiometer wiper | 10K pot between 5V and GND for contrast |
| RS | 12 | |
| RW | GND | Grounded = write-only |
| E | 11 | |
| D4 | 5 | |
| D5 | 4 | |
| D6 | 3 | |
| D7 | 2 | |
| A | 5V | Backlight anode |
| K | GND | Backlight cathode |

See `arduino/sensor_node/README.md` for a full wiring reference.

### 5.3 Configure Credentials

```bash
cd arduino/sensor_node
cp secrets.example.h secrets.h
```

Open `secrets.h` and fill in your WiFi network and Supabase credentials:

```cpp
#define WIFI_SSID     "your-wifi-network"
#define WIFI_PASSWORD "your-wifi-password"
#define SUPABASE_URL      "https://your-project-id.supabase.co"
#define SUPABASE_ANON_KEY "your-anon-key"
```

Important: the Arduino Uno R4 WiFi only supports **2.4GHz WiFi networks**. If your network is 5GHz only, it will not connect.

### 5.4 Set the Device ID

Open `sensor_node.ino` and find the `DEVICE_ID` line near the top:

```cpp
#define DEVICE_ID "node1"
```

Each Arduino node must have a unique ID. The schema seeds `node1` and `node2` by default. If you are setting up a third node, change this to something like `"node3"` or `"lab_bench_a"`.

Rules for device IDs: lowercase letters, numbers, hyphens, and underscores only. 1-32 characters.

If you use an ID that is not already in the database, you have two options:
- **Recommended:** Register the device in the web dashboard first (Dashboard > Manage Devices > Add Device).
- **Alternative:** Enable auto-registration in the dashboard settings so devices are created automatically when their first reading arrives.

### 5.5 Upload the Firmware

1. Connect the Arduino via USB.
2. In Arduino IDE: **Tools > Board > Arduino UNO R4 WiFi**.
3. **Tools > Port** -- select the serial port for your Arduino.
4. Click **Upload** (the right arrow button).

### 5.6 Verify It Works

Open **Tools > Serial Monitor** and set the baud rate to **115200**. You should see output like:

```
=== IoT Temp/Humidity Sensor ===
Device ID: node1
Initializing DHT20... OK
Connecting to WiFi: YourNetwork...
Connected! IP: 192.168.1.42
Reading #1 | Temp: 22.5C (72.5F), Humidity: 45.2%
...
>> Sending average of 12 readings | Avg Temp: 22.55C, Avg Humidity: 45.15%
>> Sent OK
```

The sensor reads every 15 seconds and uploads an average every 3 minutes. After the first `>> Sent OK`, check your Supabase dashboard -- go to **Table Editor > readings** and you should see a new row.

Back in your web app at [http://localhost:3000](http://localhost:3000), the dashboard should start showing live data within 30 seconds.

### 5.7 Adding More Nodes

To add another sensor node, repeat steps 5.2-5.6 with a different `DEVICE_ID`. Each node needs its own Arduino, sensor, and unique ID. Register the new device in the web dashboard before (or after, if auto-registration is on) powering it up.

---

## 6. Deploy to Vercel (Production)

Once things work locally, deploy to Vercel so the dashboard is accessible from anywhere.

### 6.1 Push Your Fork to GitHub

Make sure your latest code is pushed (do not commit `secrets.h` or `.env.local` -- they are already in `.gitignore`).

### 6.2 Create a Vercel Project

1. Log in at [vercel.com](https://vercel.com).
2. Click **Add New Project** and import your GitHub repo.
3. Under **Root Directory**, type `web` (the Next.js app is in the `web/` folder, not the repo root).
4. Under **Environment Variables**, add all the variables from your `web/.env.local`. At minimum:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key |
| `CRON_SECRET` | The random string you generated |
| `KV_REST_API_URL` | Upstash Redis REST URL (see section 6.3) |
| `KV_REST_API_TOKEN` | Upstash Redis REST token (see section 6.3) |

5. Click **Deploy**.

### 6.3 Rate Limiting + Report Storage (Upstash Redis — Required for Production)

`/api/chat`, `/api/guest-data`, `/api/guest-token`, `/api/nl-filter`, and `/api/reports/generate` all use Upstash Redis. The chat/guest/NL routes use it for rate limiting and fail closed in production if Upstash is not configured. The report pipeline additionally uses Redis to cache the data bundle (30 min TTL) between the chat-side `prepare_report` tool call and the client-side modal submission, and to stash the generated `.tex` (30 min TTL) for `Download .tex` / `Open in Overleaf`. Provisioning is free:

1. In your Vercel project, open **Storage** > **Create** > **Upstash Redis** and pick the **Free** plan.
2. Link the database to this project. Vercel auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` into all environments.
3. Redeploy so the running deployment picks up the new env vars.

In local development the rate limiters are a no-op when the env vars are missing, and the report store falls back to an in-process Map (single-server only, cleared on restart), so you don't need Upstash for local work.

### 6.4 Cron Jobs

The repo includes a `web/vercel.json` that configures two scheduled jobs:

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/keepalive` | Every 10 minutes | Checks if sensors are still reporting, sends alerts |
| `/api/weather` | Every 15 minutes | Fetches weather data for comparison (needs `WEATHER_API_KEY`) |

These run automatically on Vercel's free tier (Pro plan recommended if you need guaranteed execution). The keepalive route will work with just the Supabase keys. The weather route also needs a `WEATHER_API_KEY` (see section 7).

---

## 7. Set Up Weather Comparison (Optional)

The Compare page shows how your sensor readings stack up against actual weather conditions. This requires a free WeatherAPI.com key.

1. Sign up at [weatherapi.com/signup](https://www.weatherapi.com/signup).
2. Copy your API key from the dashboard.
3. Add it to your environment:
   - **Local:** Add `WEATHER_API_KEY=your-key` to `web/.env.local`.
   - **Vercel:** Add the same variable in your project settings > Environment Variables.
4. In the web dashboard, go to **Deployments** and make sure your active deployments have a **ZIP code** set. The weather cron fetches conditions for each unique ZIP.

To test it manually:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "https://your-app.vercel.app/api/weather"
```

You should get a JSON response with `inserted_count` showing how many weather readings were saved.

---

## 8. Set Up AI Chat (Optional)

The floating chat in the bottom-right corner uses Google Gemini to answer questions about your data (e.g., "What was the average temperature last Tuesday?" or "Compare node1 and node2 this week"). The same key powers the chat-driven **LaTeX report generator**: ask the chat to "generate a report," provide a date range, pick devices + options in the modal, and download a fully-formatted `.tex` — or click **Open in Overleaf** to compile the PDF right there in a new tab.

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a project (or use an existing one).
3. Enable the **Generative Language API** (search for it in the API library).
4. Go to **Credentials** > **Create Credentials** > **API Key**.
5. Add it to your environment:
   - **Local:** Add `GOOGLE_API_KEY=your-key` to `web/.env.local`.
   - **Vercel:** Add the same variable in your project settings.

The chat is rate-limited to 30 requests per 15 minutes per user. Report generation is separately capped at 5 reports per hour per user (the isolated prose call is slightly more expensive). Reports download the `.tex` directly and hand it to Overleaf via an inline form POST (`snip` parameter), so PDF compilation happens on Overleaf's infrastructure — no LaTeX install required locally or in production.

---

## 9. Set Up Email Alerts (Optional)

The keepalive system can email you when a sensor stops reporting (and again when it recovers).

1. Sign up at [resend.com](https://resend.com).
2. Create an API key.
3. Add these to your environment:

| Variable | Value |
|----------|-------|
| `RESEND_API_KEY` | Your Resend API key |
| `ALERT_EMAIL_TO` | Email address(es) to notify, comma-separated |

Optional additional settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `ALERT_EMAIL_FROM` | Resend default | Custom sender (requires domain verification in Resend) |
| `ALERT_STALE_MINUTES` | `10` | Minutes without data before a sensor is considered offline |
| `ENABLE_RECOVERY_ALERTS` | `true` | Send an email when a sensor comes back online |
| `ALERT_DASHBOARD_URL` | none | Link to your dashboard, included in alert emails |

In the web dashboard, you can control which devices are monitored under **Manage Devices** -- toggle the monitor switch for each device.

---

## 10. Inviting Users (Multi-User)

The admin can invite users from the dashboard via **Manage Users** (visible only to admins on the home page).

### 10.1 Configure Supabase Site URL

Before inviting anyone, set the redirect URL so invite links point to your production site (not `localhost:3000`):

1. In Supabase, go to **Authentication** > **URL Configuration**.
2. Set **Site URL** to your Vercel URL (e.g., `https://your-app.vercel.app`).
3. Add your Vercel URL to **Redirect URLs** (e.g., `https://your-app.vercel.app/**`).

### 10.2 Invite via Email

Enter the user's email in the Manage Users modal and click **Send Invite**. Supabase sends an invite email with a link. When they click it, they land on a "Set Your Password" page.

**Supabase free tier limits invite emails to 2 per hour.** If you hit the limit, either wait or use the **Copy Link** method below.

### 10.3 Invite via Link (Recommended for .edu emails)

Some email systems (especially `.edu`) silently drop invite emails due to domain mismatch in the link. To work around this:

1. Enter the user's email and click **Copy Link** (instead of Send Invite).
2. The invite link is copied to your clipboard.
3. Text or message the link to the user directly.
4. When they open it, they see the "Set Your Password" form.

Invite links expire based on the **OTP Expiry** setting in Supabase (**Authentication** > **Providers** > **Email** > **Email OTP Expiration**). Default is 3600 seconds (1 hour). Maximum is 86400 seconds (24 hours).

### 10.4 Custom SMTP (Optional, Removes Email Rate Limit)

To bypass the 2-email-per-hour Supabase limit and improve deliverability:

1. Sign up at [resend.com](https://resend.com) and verify a custom domain (Resend > Domains > Add Domain > add the DNS records).
2. In Supabase, go to **Project Settings** > **Authentication** > **SMTP Settings**.
3. Toggle **Enable Custom SMTP** and fill in:
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** your Resend API key
   - **Sender email:** an address on your verified domain (e.g., `noreply@yourdomain.com`)
   - **Sender name:** your project name

With custom SMTP, Supabase's built-in email rate limit no longer applies.

### 10.5 Guest Read-Only Access

Admins can generate a guest link that gives read-only access without requiring an account. Guests can view all dashboards, charts, compare, and data pages, and use the AI chat (including generating reports). They cannot create, edit, or delete anything.

1. Set `GUEST_VIEW_TOKEN` to a random string in your environment (local `.env.local` and Vercel).
2. In the dashboard, click your profile icon and select **Copy Guest Link**.
3. Share the link with instructors or observers.

To revoke access, change the `GUEST_VIEW_TOKEN` value and redeploy. All existing guest links become invalid immediately.

### 10.6 Roles

| Role | Can view | Can create/edit | Can delete | Can manage users/devices |
|------|----------|-----------------|------------|--------------------------|
| Admin | Everything | Deployments, devices | Deployments, readings, devices | Yes |
| User | Everything | Deployments, devices | No (shown "contact admin") | No |
| Guest (token link) | Dashboards, charts, compare, data, AI chat (including report generation) | No | No | No |

---

## 11. Analytics (Optional)

The dashboard optionally integrates PostHog for product analytics (click tracking, page views, session replay, error tracking). This is useful for monitoring how users interact with the dashboard and catching bugs, but is not required for core functionality.

To enable:

1. Sign up at [posthog.com](https://posthog.com) (free tier: 1M events/month).
2. Add to your environment:
   - `NEXT_PUBLIC_POSTHOG_KEY` -- your PostHog project API key (starts with `phc_`)
   - `NEXT_PUBLIC_POSTHOG_HOST` -- `https://us.i.posthog.com` (or a custom proxy domain)

If these variables are not set, PostHog is completely disabled with zero overhead.

---

## 12. Environment Variable Reference

All variables go in `web/.env.local` for local development and in Vercel's project settings for production.

### Required

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (e.g., `https://abc123.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only, keep secret) |
| `CRON_SECRET` | Random string to protect the `/api/keepalive` and `/api/weather` routes |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis REST URL and token. Required in production — rate limiters fail closed without these, and the report generation pipeline uses Redis to stash bundles + generated `.tex` (30-min TTL). Vercel auto-sets them when you link an Upstash database to the project. Not required locally; the report store falls back to an in-memory map in dev. |

### Optional

| Variable | Description |
|----------|-------------|
| `GOOGLE_API_KEY` | Google Gemini API key (for AI chat) |
| `WEATHER_API_KEY` | WeatherAPI.com key (for weather comparison) |
| `RESEND_API_KEY` | Resend API key (for email alerts) |
| `ALERT_EMAIL_TO` | Comma-separated alert recipient emails |
| `ALERT_EMAIL_FROM` | Custom sender address (needs Resend domain verification) |
| `MONITORED_DEVICE_IDS` | Override which devices are monitored (comma-separated). If unset, uses devices with monitoring enabled in the dashboard. |
| `ALERT_STALE_MINUTES` | Minutes without data before alerting (default: `10`) |
| `ENABLE_RECOVERY_ALERTS` | `true` or `false` (default: `true`) |
| `ALERT_DASHBOARD_URL` | URL included in alert emails |
| `GUEST_VIEW_TOKEN` | Random string for guest read-only access links (see section 10.5) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project API key (for analytics, optional) |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host or proxy domain (default: `https://us.i.posthog.com`) |

---

## 13. Verifying Everything Works

Use this checklist to confirm each piece is working:

- [ ] **Supabase schema**: The `readings`, `devices`, `deployments` tables exist in your Supabase Table Editor.
- [ ] **Auth user**: You can log in at your web app's login page.
- [ ] **Arduino posting data**: Serial monitor shows `>> Sent OK` and rows appear in the `readings` table.
- [ ] **Dashboard live data**: The dashboard shows your sensor readings and updates every 30 seconds.
- [ ] **Vercel deployment**: Your app is accessible at `https://your-app.vercel.app`.
- [ ] **Keepalive cron**: Run `curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/keepalive` and check for a 200 response.
- [ ] **Weather (if configured)**: The Compare page shows weather data next to your sensor readings.
- [ ] **AI chat (if configured)**: The chat icon in the bottom-right responds to questions about your data.

---

## 14. Troubleshooting

### Arduino Issues

| Problem | Solution |
|---------|----------|
| "No WiFi Module!" | Wrong board selected. Use **Arduino UNO R4 WiFi**, not UNO R4 Minima. |
| "Sensor Error!" | Check DHT20 wiring (SDA to A4, SCL to A5). The sensor needs about 100ms after power-on. |
| "WiFi Failed!" | Verify SSID and password in `secrets.h`. The R4 WiFi only supports 2.4GHz networks. |
| LCD is blank or garbled | Adjust the contrast potentiometer. Double-check all LCD pin connections. |
| "Send failed - retaining buffer" | Upload failed but data is kept. The node retries automatically. Check WiFi and that your Supabase URL/key are correct. |
| Data not appearing in Supabase | Open Serial Monitor at 115200 baud and look for error codes. Verify the `readings` table exists and the validated anon INSERT policy is in place. If the serial log shows HTTP 401/403 on send, check that your Arduino's `device_id` matches the `^[a-z0-9_-]{1,32}$` regex the policy enforces (lowercase letters, digits, `_` or `-`, max 32 chars, no `weather_` prefix). |

### Web App Issues

| Problem | Solution |
|---------|----------|
| Can't log in | Verify your Supabase Auth user exists and is confirmed. Try typing the email in all lowercase. |
| Dashboard is empty | Confirm there are rows in the `readings` table, your env vars are set, and the device is registered and active in Manage Devices. |
| Charts or Compare page is empty | Re-run `supabase/schema.sql`. The RPC functions may be missing. Check that `EXECUTE` is granted to `authenticated`. |
| AI chat not responding | Confirm `GOOGLE_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set. You must be logged in. |
| Report modal never opens | Chat asks for a date range first; reply with one (e.g. "last 7 days"). Check browser console for a failed `__QUESTION__` parse. If `prepare_report` itself errored, it's almost always because the `get_report_bundle` RPC isn't in your database — re-run `supabase/schema.sql`. |
| "Open in Overleaf" says file not found | Overleaf used to be called with `snip_uri` pointing at your server, which fails on localhost. The current flow POSTs the raw `.tex` inline via `snip`. If you see this on a recent deployment, confirm `web/src/components/ReportArtifactCard.tsx` is using the `snip` approach. |
| Report prose looks sparse or missing | Gemini may have failed, timed out (15s budget), or tripped the forbidden-phrase filter (any causal / forward-looking / hardware speculation nulls that field). The template falls back to deterministic bullet summaries so the report always renders. Regenerate once — transient Flash failures usually clear. |
| Cron route returns 401 | The `CRON_SECRET` in your request must match the one in your environment. Include it as `Authorization: Bearer YOUR_SECRET`. |
| Weather shows dashes | The deployment needs a valid ZIP code. Confirm `WEATHER_API_KEY` is set. Try triggering `/api/weather` manually with curl. |
| No alert emails | Both `RESEND_API_KEY` and `ALERT_EMAIL_TO` must be set. A custom sender address requires domain verification in Resend. |
| New device not showing up | Register it in Manage Devices first, or enable `device_auto_register` in the app settings. |
| Unwanted device alerts | Toggle monitoring off for that device in Manage Devices, or set `MONITORED_DEVICE_IDS` to only the nodes you want monitored. |
| Invite email not received | Check spam folder. `.edu` emails may silently drop invites — use **Copy Link** instead. If rate-limited ("Email rate limit exceeded"), wait 1 hour or set up custom SMTP (section 10.4). |
| Invite link goes to localhost | Set the **Site URL** in Supabase Authentication > URL Configuration to your production URL (section 10.1). |
| "Manage Users" button not visible | Only admin users see it. Make sure your user has the admin role in the `user_roles` table and `app_metadata`. |
| Invite link stuck on "Verifying" | The invite token may have expired. Generate a new link via Copy Link. Increase OTP Expiry in Supabase (Authentication > Providers > Email). |
