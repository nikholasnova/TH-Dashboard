# Design Decisions & Rationale

This document explains why each major feature in this dashboard was planned and implemented the way it was. It covers architecture choices, feature rationale, challenges encountered, and lessons learned.

---

## 1. Project Goals & Constraints

This project started with a simple brief: build an an arduino temp and humidity sensor using the provided kit by the colledge and collet some data. How to collect the data and what to do with it was left open ended. The instructor mentioned it might be cool if someone figured out how to diplay it on the web as well. So I began plannig a system that collects temperature and humidity data from physical sensors and displays it on a web dashboard. The twist was making it genuinely useful and technically interesting without spending any money. Every service used in this project runs on a free tier: Supabase for the database, Vercel for web hosting, WeatherAPI.com for weather reference data, Google Gemini for the AI chat, and Resend for email alerts.

The target audience is an intro engineering class. That means the system needs to be reproducible, another student should be able to fork the repo, follow the setup guide, and have a working system within an afternoon even if they didn't have deep technical knowledge. This ruled out anything that requires specialized infrastructure, paid accounts, or deep DevOps knowledge. At the same time, I wanted the project to demonstrate real engineering patterns: data pipelines, authentication, monitoring, statistical analysis, and AI integration. The balance between a production grade system and simple system drove most of the decisions documented here.

The project is a public GitHub repository. Every design choice had to account for the fact that credentials cannot be committed, setup instructions need to be complete, and the code needs to be readable by someone who did not write it. Arduino IDE is the required toolchain for firmware, no PlatformIO or custom config. The hardware is an Arduino Uno R4 WiFi with a DHT20 sensor and an optional 16x2 LCD, all on a breadboard. The board only supports 2.4GHz WiFi, which is a constraint worth noting since many campus and modern home networks default to 5GHz.

The scope grew incrementally. The initial version had two hardcoded sensors posting to Supabase and a basic dashboard with live readings. Over time, features were added in response to real needs: deployments because we wanted to move sensors between locations, weather comparison because we wanted to validate sensor accuracy, N-node support because we added more hardware, analysis because the the project goal at the end was to write a paper based on your data, and AI chat because it made exploring the data significantly faster and would speed up data conclusions. 

The end-to-end data path is: DHT20 sensor reads temperature and humidity via I2C, the Arduino accumulates and averages readings, POSTs a JSON payload over HTTPS to Supabase's REST API, Supabase stores the row in a Postgres table with server-side timestamps, and the Next.js dashboard polls the database every 30 seconds to update the UI. Weather data follows a parallel path: a Vercel cron triggers an API route that fetches conditions from WeatherAPI.com and inserts them into the same readings table with a different `source` value. Both paths converge in the same database, which means every query, chart, and AI tool works identically for sensor and weather data.

---

## 2. Architecture Choices

### Why Supabase over Firebase or a Custom Backend

I needed a database that an Arduino could write to directly over HTTPS without an intermediary server. Supabase exposes a REST API backed by Postgres, which means the Arduino can POST a JSON payload to `/rest/v1/readings` with just an anon key in the `apikey` and `Authorization` headers. This means no SDK, no WebSocket, no authentication. The Arduino firmware constructs a raw HTTP request string and sends it over `WiFiSSLClient`. Firebase would have required either a Firebase SDK (not available for Arduino) or a custom Cloud Function as a relay. A custom backend would mean maintaining a server, which adds cost and complexity.

Supabase also gave me Postgres features that are neat: RPC functions for aggregation queries (`get_device_stats`, `get_chart_samples`, `get_dashboard_live`), Row Level Security for fine-grained access control, exclusion constraints for preventing overlapping deployment windows, and partial unique indexes for weather deduplication. The schema file (`supabase/schema.sql`) is 658 lines and defines 5 tables, 8 RPC functions, 3 constraint checks, and multiple index strategies. All of this runs on the database side, which means the web app stays thin.

The free tier provides 500MB of storage and 50,000 monthly active users, which is more than enough for a class project generating one row every 3 minutes per sensor. I estimated that two sensors running for a full semester would produce roughly 115,000 rows, well under the limit. They also do not charge for the API. 

The built-in Auth system was another factor. I needed a login page to protect the dashboard, and Supabase Auth integrates directly with RLS policies. This is simpler than spening hours hardening the chat and database paths from potential bad actors and preventing abuse. The `anon` role can INSERT readings (for Arduino), while the `authenticated` role can SELECT readings and execute RPC functions (for the dashboard). This meant I could enforce access control at the database level without writing middleware. The `service_role` key is used only on the server side and bypasses RLS entirely.

One less obvious benefit of Supabase is that the REST API handles TLS termination. The Arduino's `WiFiSSLClient` connects to the Supabase host on port 443, and the certificate validation is handled by the R4 WiFi's built-in TLS stack. I did not need to manage certificates, pin roots, or handle TLS handshake errors beyond the basic connection timeout. The request itself is a plain HTTP POST with JSON. 

### Why Next.js App Router on Vercel

The dashboard needs both client-rendered pages (charts, compare, analysis) and server-side API routes (weather cron, keepalive, AI chat). Next.js App Router handles both in one framework. The client pages use `'use client'` directives and dynamic imports (e.g., `dynamic(() => import('@nivo/line'), { ssr: false })`) to avoid SSR issues with browser-only libraries. The API routes run as serverless functions.

Vercel provides free hosting with built-in cron job support via `vercel.json`. I use this for the weather ingestion route (every 15 minutes on the quarter hour) and the keepalive health check (every 10 minutes). Both are protected by a `CRON_SECRET` header. Deploying is a git push, Vercel watches the repo and rebuilds automatically. No CI/CD configuration was needed for deployment itself, though I later added GitHub Actions for linting and testing.

I considered a plain React SPA with a separate Express backend, but that would mean two deployments, two sets of environment variables, and CORS configuration. Next.js collapses the frontend and backend into one project. The root layout wraps the entire app in `ThemeProvider > AuthProvider > DevicesProvider > ChatPageContextProvider`, making theme, auth, device list, and chat context available on every page without prop drilling.

The App Router's file-system routing also simplified the project structure. Each page is a `page.tsx` file in its own directory under `web/src/app/`. API routes follow the same convention at `web/src/app/api/`. There is no router configuration file to maintain.

The cron job configuration lives in `web/vercel.json`, which defines two schedules: `/api/keepalive` every 10 minutes and `/api/weather` at minutes 0, 15, 30, and 45 of every hour. Vercel's cron system calls these as HTTP GET requests with the `CRON_SECRET` as a Bearer token in the Authorization header. On the free tier, cron execution is best-effort, so both routes are designed to be idempotent.

### Why Arduino Uno R4 WiFi

The Uno R4 WiFi was chosen because it is an official Arduino board with built-in WiFi, meaning students already familiar with Arduino IDE can use it without learning a new platform. The `WiFiS3` library handles HTTPS connections, and the board supports the `WiFiSSLClient` class needed for posting to Supabase over TLS on port 443. The DHT20 sensor communicates over I2C (address `0x38` on SDA/SCL), which keeps wiring simple, only four wires for the sensor.

The 16x2 LCD is optional and uses parallel 4-bit wiring, which is more complex but is what the existing project kit provided from the class. The LCD displays the current reading in Fahrenheit, WiFi connection status with a spinning animation during connect, the device ID on boot, and error messages when something goes wrong. The database stores Celsius; Fahrenheit conversion happens in the firmware for LCD display and in the web UI for dashboard display.

The firmware itself is a single `.ino` file with no external dependencies beyond `WiFiS3`, `LiquidCrystal`, and `DFRobot_DHT20`. Credentials live in a `secrets.h` file that is `.gitignore`d, with a `secrets.example.h` template in the repo. This keeps the firmware simple enough for students to understand the entire data pipeline from sensor read to cloud upload by reading one file.

The `DEVICE_ID` is a `#define` at the top of the sketch. Each physical Arduino needs a unique value (e.g., `"node1"`, `"node2"`, `"lab_bench_a"`). Device IDs must match the regex `^[a-z0-9_-]{1,32}$` -- lowercase letters, numbers, hyphens, and underscores only, up to 32 characters. This constraint is enforced both in the `devices` table schema (as a CHECK constraint) and in the auto-registration trigger. The setup guide explains how to choose and register device IDs, including the two options: pre-register in the web UI or enable auto-registration.

I intentionally kept the firmware as a single file rather than splitting it into multiple header files. For this class, being able to scroll through one file and see everything from WiFi connection to sensor reading to HTTP upload is more valuable than clean separation of concerns. The only external file is `secrets.h` for credentials.

### Why Nivo for Charts

Nivo is a React-native charting library built on D3. I chose it because it provides good defaults for dark themes, handles responsive sizing, and works well as a client-only component. The key requirement was client-side rendering, Next.js App Router renders components on the server by default, and D3's DOM manipulation does not work in a Node.js environment. The `ssr: false` flag on the dynamic import ensures the chart library is only loaded in the browser.

Other options like Chart.js or Recharts would have worked, but Nivo's declarative API felt cleanest for the line charts and comparison views I needed. The charts page supports temperature, humidity, or both metrics simultaneously, with device filtering and time range selection. Time ranges include preset options (1 hour, 6 hours, 24 hours, 7 days), custom date pickers, and deployment-scoped "All Time" ranges that automatically use a deployment's start and end timestamps. CSV export fetches raw readings (excluding `weather_*` rows) for offline analysis in Excel or Python.

### Why Pyodide for In-Browser Analysis

The analysis page runs Python (numpy, pandas, scipy, statsmodels) entirely in the browser using Pyodide, a WebAssembly port of CPython. I chose this because Vercel does not natively run Python, and I did not want to add a separate Python backend just for statistical analysis. Students maybe more familiar with Python for data analysis than JavaScript, so the analysis scripts are written in Python and executed client-side.

The five analysis types are: descriptive statistics (mean, median, std, skewness, kurtosis, histograms), correlation analysis (Pearson r, linear regression, scatter plots), hypothesis testing (Welch's t-test between deployment pairs with effect size), seasonal decomposition (additive model with 24-hour period), and forecasting (Holt-Winters exponential smoothing with 24-hour seasonal period). Each is a self-contained Python script in `analysisRunner.ts`.

The trade-off is the cold start. Loading the Pyodide runtime and packages takes roughly 10 seconds on the first load depending on connection. I mitigate this with a singleton loader and a module-level cache that survives client-side navigation. Once loaded, subsequent analyses run quickly. A progress callback (`onProgress`) lets the UI show status messages like "Fetching sensor data..." and "Running seasonal decomposition..." during execution.

### Why Gemini for AI Chat

Google Gemini 2.5 Flash was my choice for the AI chat because it offers a free API tier with good function-calling support and streaming. The chat uses 7 read-only tools (`get_deployments`, `get_deployment_stats`, `get_readings`, `get_device_stats`, `get_chart_data`, `get_report_data`, `get_weather`) that give the AI access to all project data through the same Supabase queries the dashboard uses. The tools execute via `aiTools.ts` with a service-role Supabase client, so the AI can query data without being limited by the browser session.

Streaming responses are sent via `TransformStream` with `__STATUS__` markers (e.g., `__STATUS__Looking up deployments`) so the chat UI can show progress indicators during multi-step queries. The tool loop is bounded at 10 iterations to prevent runaway API costs. Rate limiting is in-memory at 30 requests per 15 minutes per user, which resets on deploy. I made this intentioanlly simple, for the scope of this project with a single expected user, in-memory state is enough.

The system prompt is pretty large and includes instructions for handling common question patterns, report generation formatting, sensor-vs-weather comparison framing, and weather data access. It is dynamically augmented at request time with the current Arizona local time, registered device IDs (including weather counterparts like `weather_node1`), and the first 50 known deployments. This gives the AI enough context to match natural language references like "the patio deployment" to actual database records. I would have liked to keep the system prompt leaner but the flash models aren't the best at tool calling and have high failure rates without sufficent guidance.

---

## 3. Feature Design Rationale

This section covers the major features, why each exists, the key design decisions, and the trade-offs involved. Features are roughly ordered from the data pipeline (firmware) through the web layer.

### 3-Minute Averaged Uploads

The sensor reads temperature and humidity every 15 seconds (`READ_INTERVAL_MS = 15000`), but only uploads an average every 3 minutes (`SEND_INTERVAL_MS = 180000`). This means each upload represents the average of approximately 12 readings.

The primary motivation is Supabase free tier row limits. Uploading every 15 seconds would produce 5,760 rows per day per sensor. With 3-minute averaging, that drops to 480 rows per day, a 12x reduction. Over a 120-day semester with two sensors, raw uploads would produce 1.38 million rows versus 115,200 with averaging.

Beyond the row count, averaged data helps cut the noise from cheap sensors. The DHT20 sensor has a specified accuracy of plus or minus 0.5 degrees Celsius, and individual reads can jitter within that range. A 3-minute average smooths out this sensor noise and gives a more representative picture of actual conditions. For the statistics and forecasting on the analysis page, cleaner input data produces more meaningful results.

The averaging logic on the Arduino is straightforward: accumulate temperature and humidity sums in `tempSum` and `humiditySum`, increment `readingCount`, divide on send. If a read returns `NaN` (sensor error), it is silently discarded and the count is not incremented. The averages are computed in Celsius and uploaded as-is; Fahrenheit conversion happens only in the UI and on the LCD display. Storing Celsius in the database is a deliberate choice -- Celsius is the standard scientific unit, and converting to Fahrenheit for display is a simple `C * 9/5 + 32` that can be done anywhere. The `celsiusToFahrenheit()` utility function is used consistently across all UI components, the analysis runner, and the AI chat tools.

In hindesight, 3 mins is still a bit redundant, Ive found the DHT20 senors to last about 120,000 reads before they start degrading.i observered temprature changing every 5 or so mins I would most likley do that going forward. 

### Linear Backoff Retry

When an upload fails (connection refused, timeout after 10 seconds, or non-2xx response), the Arduino retains its buffer, the accumulated sums and count are not reset. It then schedules a retry with linear backoff: 30 seconds after the first failure, 60 seconds after the second, 90 after the third, and so on, capped at `SEND_INTERVAL_MS` (180 seconds). The `consecutiveFailures` counter tracks how many times in a row the send has failed, and resets to zero on success.

In the implementation i used a trick with `lastSendTime` rather than a separate timer:

```
unsigned long backoff = min((unsigned long)30000 * consecutiveFailures, SEND_INTERVAL_MS);
lastSendTime = now - SEND_INTERVAL_MS + backoff;
```

This sets `lastSendTime` such that the main loop's `now - lastSendTime >= SEND_INTERVAL_MS` check will fire after the desired backoff period, without needing a separate retry state machine.

I chose linear over exponential backoff because the retry window is already short (capped at 3 minutes), and linear is simpler to reason about on a microcontroller with limited debugging tools. Exponential backoff makes sense for APIs with rate limiting where you want to back off aggressively, but here the failure mode is almost always a transient WiFi dropout that resolves in seconds. The Arduino also checks WiFi status at the top of every `loop()` iteration and calls `connectWiFi()` if disconnected, which attempts up to 20 reconnection tries.

The key design property is that no data is lost during transient network issues. The buffer keeps accumulating readings even while retrying, so the eventual successful upload contains the average of all readings since the last successful send. If the network is down for 9 minutes, the first successful send will contain the average of roughly 36 readings spanning that entire gap. The trade-off is that a longer outage produces a single data point covering a wider time window rather than multiple points at the normal 3-minute cadence, but this is preferable to losing the data entirely.

The HTTP request itself has a 10-second timeout (`millis() - timeout > 10000`). If Supabase does not respond within 10 seconds, the connection is closed and the upload is treated as a failure. This prevents the Arduino from blocking indefinitely on a hanging connection, which would also halt sensor reads.

### N-Node Dynamic Scaling

The project originally hardcoded two devices (`node1` and `node2`). When I needed to add a third sensor, I realized the hardcoded approach was very short sighted, device IDs were scattered across the firmware constants, database seed data, dashboard components, keepalive monitoring, and weather integration. Refactoring to dynamic devices touched nearly every file in the project.

The `devices` table stores the device ID (primary key, validated by regex `^[a-z0-9_-]{1,32}$`), display name, color (hex code for chart series), active status (`is_active`), monitoring toggle (`monitor_enabled`), and sort order. An `updated_at` trigger automatically sets the timestamp on every update. The table is seeded with `node1` (blue, `#0075ff`) and `node2` (green, `#01b574`) and backfills from any existing readings or deployments.

Every part of the system that previously used a hardcoded device list now reads from this table. The dashboard page fetches devices from `DevicesContext` to know which `LiveReadingCard` components to render. The `get_dashboard_live` RPC accepts an array of device IDs and returns latest readings plus sparkline data for all of them in a single query. The keepalive route queries `devices WHERE is_active = true AND monitor_enabled = true`. The weather route reads active deployments, which reference device IDs from the table.

An auto-registration trigger on the `readings` table optionally creates a `devices` row when a new `device_id` appears in an INSERT, gated behind an `app_settings` flag (`device_auto_register = 'true'`). The trigger is `SECURITY DEFINER` so it can insert into the `devices` table even when the INSERT on `readings` comes from the `anon` role. It only fires for sensor readings (not weather), validates the ID format against the same regex as the table check, and skips IDs that start with `weather_`. New auto-registered devices start with monitoring disabled (`monitor_enabled = false`) and a high sort order (99) to avoid surprise alerts. Alternatively, users can register devices manually through the `DeviceManager` UI modal before powering up the Arduino.

The `DevicesContext` provides the active device list app-wide via React context. It fetches devices on mount (filtered by `is_active = true`, ordered by `sort_order`) and exposes a refresh function that the `DeviceManager` calls after adding or editing a device. The dashboard, charts, compare, and analysis pages all read from this context rather than making independent device queries. This ensures that when a device is deactivated in the manager, it immediately disappears from all pages without requiring a full page reload.

The grid layout on the dashboard adapts to the number of active devices: 1 device gets a centered single column with a max width, 2 devices get a responsive 2-column grid, 3 devices use up to 3 columns on large screens, and 4+ devices go up to 4 columns on extra-large screens. This means the dashboard looks good whether you have 1 sensor or 8, without manual layout configuration.

### Deployments

A deployment represents a placement window: a specific sensor at a specific location during a specific time range. The `deployments` table stores `device_id`, `name`, `location`, `zip_code`, `started_at`, and `ended_at`. This concept exists because the same physical sensor might be placed in different locations over the course of the class, on a patio one week, in a different room the next. The name field is a human-readable label that appears in the dashboard and analysis UI.

Without deployments, all readings from `node1` would be lumped together regardless of where the sensor was physically located. Deployments scope the data so that analysis is meaningful: when I run a hypothesis test comparing two deployments, I am comparing two distinct physical placements, not two random time slices from different environments. The analysis page's deployment selector lets you pick specific deployment windows for all five analysis types.

The database enforces two integrity constraints: a unique partial index (`idx_deployments_one_active_per_device`) prevents multiple active deployments per device where `ended_at IS NULL`, and an exclusion constraint using `btree_gist` (`deployments_no_overlap_per_device`) prevents overlapping time windows per device using `tstzrange` overlap checks. Both constraints are created conditionally.

The `delete_deployment_cascade` RPC function uses `SECURITY DEFINER` to delete both the deployment and its associated readings in a single transaction, even though the RLS policy restricts DELETE on `readings` to `service_role`. The function first looks up the deployment's device, start, and end times, then deletes readings that fall within that window, but only if those readings do not also belong to another deployment's window (checked via a `NOT EXISTS` subquery against other deployments for the same device).

The ZIP code field on deployments enables weather comparison. When a deployment has a ZIP code, the weather cron fetches official conditions for that location and the dashboard shows percent error. This makes the ZIP code effectively a geocoding mechanism, I chose ZIP codes because they are simpler to enter and WeatherAPI.com accepts them directly.

### Weather Comparison and Percent Error

Every 15 minutes, a Vercel cron job hits `GET /api/weather`, which queries active deployments with non-null ZIP codes, fetches current conditions from WeatherAPI.com for each unique ZIP (deduplicating API calls when multiple deployments share a ZIP), and inserts the data as `readings` rows with `source = 'weather'` and `device_id = 'weather_<sensor_id>'` (e.g., `weather_node1` for `node1`). The rows also carry `deployment_id`, `zip_code`, and `observed_at` (from the WeatherAPI `last_updated_epoch` field).

Storing weather data in the same `readings` table as sensor data was a choice. The alternative was a separate `weather_readings` table, which would have required duplicating every RPC function, chart query, and stats computation. By using the same table with a `source` column (`'sensor'` or `'weather'`) and a device ID convention (`weather_node1` for the weather counterpart of `node1`), all existing query infrastructure works with weather data without modification. The `get_device_stats` RPC can compare `node1` and `weather_node1` side by side over the same time range. The charts page can overlay sensor and weather lines on the same graph. The AI chat's `get_device_stats` tool returns stats for both sensors and their weather counterparts in one call, letting the AI compute percent error without extra tool calls.

The `observed_at` field on weather readings stores the actual observation timestamp from WeatherAPI.com's `last_updated_epoch`, which can differ from the `created_at`. This distinction matters for data accuracy: if the cron runs at 3:15 PM but the weather API reports data last updated at 3:00 PM, the `observed_at` is 3:00 PM while `created_at` is 3:15 PM.

The Compare page and the `LiveReadingCard` both compute `% Error` using `computePercentError()` from `weatherCompare.ts`. The color coding is green below 3%, amber between 3-5%, and red above 5%. The `LiveReadingCard` shows this inline on each live card: "vs Official: 74.2°F (1.8% Error)". The Compare page shows a full table with per-device stats (avg, min, max, stddev) for both sensor and weather, plus the error percentage for each metric.

Weather deduplication uses a two-layer defense. The route code checks for existing weather rows in the current 15-minute UTC bucket (computed by `getUtcBucketRange()`, which floors the current minute to the nearest 15 and returns the start and end of that 15-minute window as ISO strings) before inserting. The database has a unique partial index on `(device_id, quarter_hour(created_at)) WHERE source = 'weather'` as a fallback. Duplicate insert errors (Postgres code `23505`) are counted as skips rather than failures, so the route returns an accurate `skipped_existing_count` in its JSON response.

The route also deduplicates API calls by ZIP code. If two deployments share the same ZIP, the weather API is called once and the result is inserted for both weather device IDs. The `buildWeatherTargets` function groups deployments by normalized ZIP code and handles the case where a device has multiple active deployments by picking the most recently started one. ZIP codes are normalized via `normalizeUsZipCode()` from `weatherZip.ts`, which accepts both 5-digit (`85142`) and ZIP+4 (`85142-6789`) formats and strips the extension.

Each WeatherAPI.com request has an 8-second timeout to prevent the cron from hanging if the API is slow. If one ZIP fails (network error, invalid ZIP, API error), the remaining ZIPs continue processing. The route's JSON response includes a detailed breakdown: `fetched_count` (unique API calls made), `inserted_count` (new rows written), `skipped_existing_count`, `invalid_zip_count`, and any error messages. This makes it easy to diagnose weather ingestion issues by curling the route manually.

### In-Browser Python Analysis

The analysis page offers five analysis types, all running client-side via Pyodide. The Python scripts operate on readings fetched via Supabase, with a cap of 5,000 rows per deployment for range-scoped analyses. Forecasting uses uncapped deployment history (fetched with `useDeploymentBounds: true`) because Holt-Winters needs enough seasonal cycles to produce meaningful predictions.

The data flow is: TypeScript fetches readings from Supabase, serializes them as JSON, passes them to Python via `pyodide.globals.set('readings_json', ...)`, executes a setup script that creates a pandas DataFrame and converts Celsius to Fahrenheit, then runs the analysis-specific script. Results come back as a JSON string in `pyodide.globals.get('result_json')`. A `safe_float` helper in the setup script catches `NaN`, `Infinity`, and non-finite values that would break `JSON.stringify`. There is also a `sanitize_for_json` function that recursively handles numpy types, converting `np.floating` to Python float and `np.integer` to int.

The seasonal decomposition uses `statsmodels.tsa.seasonal.seasonal_decompose` with `model='additive'` and a period of 96. Data is resampled to regular 15-minute intervals with up to 4 missing points interpolated. Results above 1,000 points are downsampled by step for display. The forecasting uses `ExponentialSmoothing` with additive trend, additive seasonality, and a 24-hour (96-interval) seasonal period, producing a 24-hour forecast. The dashboard's standalone hourly forecast variant adds a damped trend and clips predictions to within 15 degrees of the 5th-95th percentile range.

The hypothesis testing runs Welch's t-test (`equal_var=False`) between all deployment pairs for both temperature and humidity. It computes Cohen's d effect size using pooled standard deviation (`((std_a^2 + std_b^2) / 2)^0.5`). Results include the t-statistic, p-value, a boolean `significant` flag, and sample sizes for both groups. This is useful for the class paper: you can make a statistically rigorous claim like "the temperature difference between Location A and Location B was significant (t=3.42, p=0.001, d=0.85)."

Correlation analysis computes Pearson's r between temperature and humidity within each deployment, along with linear regression slope and intercept. Scatter plot data is downsampled to 500 points (by step) to keep the visualization responsive. The analysis shows r-squared and p-value, which helps students understand whether the temperature-humidity relationship is meaningful or coincidental for their specific deployment location.

All analysis results are sanitized before JSON serialization. The `sanitize_for_json` function recursively converts numpy types to Python native types (`np.floating` to `float`, `np.integer` to `int`, `np.bool_` to `bool`) and replaces non-finite values with fallbacks. This was necessary because `json.dumps` with `allow_nan=False` would throw on any `NaN` or `Infinity` value, which can easily appear in edge cases like a deployment with only one reading (zero variance, division-by-zero in standard deviation).

The edge case handling: Correlation analysis checks that both temperature and humidity have non-zero standard deviation before computing Pearson's r (otherwise it defaults to r=0, p=1). Seasonal decomposition requires at least 2 full seasonal cycles before attempting decomposition. Forecasting trims partial days from the end of the series to avoid seasonal misalignment. These guards were added after encountering crashes with short or flat datasets during testing.

The analysis page caps input data at 5,000 rows per deployment for non-forecasting analyses. This limit prevents the browser from freezing on very long deployments (a 30-day deployment at 3-minute intervals produces about 14,400 rows). For forecasting, the full history is needed because Holt-Winters benefits from more seasonal cycles, so the cap is not applied. The `fetchReadingsForAnalysis` function handles both cases through the `maxRows` and `useDeploymentBounds` options.

### AI Chat with Tool Calling

The floating `ChatShell` component is mounted in the root layout (`layout.tsx`), making it available on every page without remounting during navigation. It sends messages to `POST /api/chat`, which authenticates the user via `getServerUser()`, checks an Upstash Redis rate limit (sliding window — 30 requests per 15 min for signed-in users, 5 per 15 min for guest IPs), and forwards the conversation to Gemini 2.5 Flash. The limiter fails closed in production if Upstash env vars are missing.

The chat route constructs a dynamic system prompt by appending the current Arizona local time (with UTC equivalent for tool parameter formatting), registered device IDs with display names and their weather counterparts, known deployments with names and locations, and optional page context from `ChatPageContextProvider`. The page context tells the AI which dashboard page the user is on and what filters are active, enabling contextual responses like "Based on the deployment you're viewing..."

Message length is capped at 4,000 characters and history is limited to the last 50 messages, with each historical message truncated to 8,000 characters. These caps prevent cost and latency abuse. 

The `maxDuration` is set to 120 seconds (the Vercel serverless function timeout for the Pro plan) to accommodate report generation, which involves multiple sequential tool calls (get all deployments, get stats, get trend data) plus a long structured Gemini response. Report generation specifically uses `get_report_data` as a first tool call, which fetches all deployments with full statistics in one batch, followed by `get_chart_data` with daily buckets for trend analysis. The system prompt includes a structured report template with sections like Executive Summary, Per-Deployment Analysis, Cross-Location Comparison, and Key Findings.

Error handling in the chat route covers several edge cases. If Gemini's response is blocked by safety filters (the `finishReason` is `'SAFETY'`), a helpful message tells the user to rephrase. If Gemini returns empty text after tool calls (which can happen when the model gets confused by complex tool results), a fallback message is shown rather than an empty chat bubble. If the client disconnects mid-stream (`signal.aborted`), the async loop exits without wasting further API calls or writing to a closed stream.

Individual tool failures are also handled gracefully. If a tool throws an error (e.g., a Supabase query failure), the error is caught and sent back to Gemini as a tool response with an error message. Gemini then typically rephrases its approach or tells the user what went wrong.

### Keepalive and Email Alerts

The keepalive route (`GET /api/keepalive`) runs every 10 minutes via Vercel cron, protected by `CRON_SECRET`. It reads monitored devices from the `devices` table (falling back to the `MONITORED_DEVICE_IDS` env var, then to a default list of `['node1', 'node2']`). For each device, it fetches the latest reading and classifies it into one of four states:

- `ok`: Reading exists, is within the staleness threshold (default 10 minutes, configurable via `ALERT_STALE_MINUTES`), and sensor values are within bounds.
- `missing`: No readings have ever been received for this device.
- `stale`: Latest reading is older than the staleness threshold.
- `anomaly`: Latest reading has temperature outside -40 to 85 degrees Celsius, or humidity outside 0-100%. These are the DHT20's specified operating limits.

State transitions are tracked in the `device_alert_state` table. The deduplication logic is critical: `shouldSendProblemAlert` returns true only when transitioning from `ok` to a problem state, or when the problem type changes (e.g., `stale` to `anomaly`). `shouldSendRecoveryAlert` returns true only on transition from any non-ok state back to `ok`. This means a sensor that stays offline for days generates exactly one alert email, not one every 10 minutes. The `last_alert_sent_at` timestamp is recorded regardless of whether the email actually delivered, so a down email provider does not cause infinite retry attempts.

Emails are sent via Resend with subject lines like `[IoT Alert] node1 OFFLINE / STALE` and `[IoT Recovery] node1 is reporting again`. The body is plain text (not HTML) and includes the device ID, classified status, the reason string, last seen timestamp, reading age in minutes, the configured stale threshold, latest temperature and humidity values, and optionally a dashboard URL from the `ALERT_DASHBOARD_URL` env var. Recipients are configurable via `ALERT_EMAIL_TO` (comma-separated). The sender address defaults to Resend's onboarding domain but can be customized with `ALERT_EMAIL_FROM` if you verify a domain in Resend.

The architecture supports multiple notification channels through the `dispatchNotifications` function, which runs all channels in parallel via `Promise.all`. Currently only email is implemented, but adding SMS or Slack would be a matter of adding another function alongside `sendEmail` and including it in the `Promise.all` array. The function returns counts of attempted and successful deliveries, which appear in the route's JSON response for debugging.

The monitoring thresholds themselves are configurable via environment variables. `ALERT_STALE_MINUTES` defaults to 10 (the sensor uploads every 3 minutes, so 10 minutes means roughly 3 missed uploads before alerting). `ENABLE_RECOVERY_ALERTS` defaults to `true` but can be set to `false` if you only want problem notifications. The `MONITORED_DEVICE_IDS` env var overrides the database query for which devices to monitor, which is useful during initial setup when the devices table may not exist yet.

The health classification also detects sensor anomalies. If the latest reading has a temperature below -40 or above 85 degrees Celsius (the DHT20's specified operating range), or humidity below 0% or above 100%, the device is classified as `anomaly` rather than `ok`. This catches the case where the sensor is technically connected and uploading but producing garbage.


### Auth with Supabase

Authentication uses Supabase Auth with a dedicated `/login` page and an `AuthGate` wrapper component that checks for an active session on every protected page. The `AuthProvider` component in the root layout manages the session lifecycle and provides it via React context. The system expects a single user.

This exists for two reasons. First, the dashboard displays real sensor data from active deployments that should not be publicly accessible, anyone with acess to the dashboard could modify dployments for delete data. They could also absue the chat api. Second, the RLS policies on `readings` require an authenticated session for SELECT queries. Without a valid session, the Supabase client cannot read any data.

The root layout wraps the app in a specific provider order: `ThemeProvider > AuthProvider > DevicesProvider > ChatPageContextProvider`. This order matters because `DevicesProvider` needs an authenticated Supabase client to fetch the device list, and `ChatPageContextProvider` needs to be inside `DevicesProvider` to inject device context into chat messages. Getting this order wrong produces subtle bugs, for example, if `DevicesProvider` renders outside `AuthProvider`, the Supabase client will not have a session token and the devices query will fail silently with an empty result, making the dashboard show "No devices configured" even when devices exist.

A skip-to-content link (`<a href="#main-content" className="sr-only focus:not-sr-only">`) is included for keyboard accessibility, though the primary expected interaction is mouse-based during class demos and lab sessions. The viewport meta tag disables user scaling (`userScalable: false`) to prevent accidental pinch-zoom on mobile, which can break the fixed tab bar layout.

---

## 4. Challenges & Solutions

This section documents real problems encountered during development and deployment, along with the solutions that worked. 

### WiFi Reliability on Arduino

The Arduino Uno R4 WiFi occasionally drops its WiFi connection, especially on busy or congested networks. The original firmware assumed the connection would stay up after `setup()`, which led to silent upload failures, the `sendToSupabase` function would fail to connect but the buffer would be reset anyway.

The fix has two parts. First, a WiFi status check at the top of every `loop()` iteration calls `connectWiFi()` if the connection dropped. The `connectWiFi()` function attempts up to 20 reconnection tries with 1-second delays, displaying a spinning animation on the LCD (`|`, `/`, `-`, `\`). Second, the upload function explicitly checks the HTTP response for a `200`, `201`, or `204` status code. On any failure, the buffer is retained and the backoff timer is set. The LCD shows a visual spinner during reconnection so you can see the state without a serial monitor.

Together with the retry-with-backoff on upload failure, this makes the system resilient to WiFi dropouts lasting up to several minutes. In practice, most dropouts resolve within 1-2 retries (30-60 seconds). An important detail: the Uno R4 WiFi only supports 2.4GHz networks. Many modern routers combine 2.4GHz and 5GHz under a single SSID, which usually works, but some networks are 5GHz-only and will fail silently, the board just reports a connection failure. The troubleshooting section in `SETUP.md` calls this out explicitly because it was the most common issue reported by other students trying to replicate the setup.

There is also a guard for the case where the WiFi module itself is missing or broken (`WiFi.status() == WL_NO_MODULE`). In this case, the firmware prints an error, shows "No WiFi Module!" on the LCD, and halts with an infinite loop.

### Supabase Free Tier Limits

The Supabase free tier limits database size and API throughput. With sensors reading every 15 seconds, two sensors would generate over 11,500 rows per day of raw data. The 3-minute averaging reduces this to about 960 rows per day for two sensors. Over a full semester (roughly 120 days), that is approximately 115,000 rows instead of 1.38 million.

I also use Postgres RPC functions to push aggregation to the database rather than fetching raw rows and aggregating client-side. The `get_dashboard_live` function is the most complex of the 8 RPCs: it uses three `UNION ALL` branches to return the latest sensor reading per device, the latest weather reading per weather device, and time-bucketed sparkline data for all devices. Before this function existed, the dashboard made 3 separate queries per device (latest reading, latest weather, sparkline), which meant 6 queries for 2 devices. With N-node support, this would have scaled to 3N queries per poll cycle. The batched RPC reduces it to 1 query regardless of device count.

The dashboard polls this RPC every 30 seconds and uses `Promise.allSettled` so a failure in the stats query does not prevent live data from updating or vice versa. A module-level `dashboardCache` object stores the last known state and is used to initialize the component on remount during client-side navigation, preventing a flash of empty state when navigating away from the dashboard and back.

Another optimization is the index on `readings (device_id, created_at DESC)`. This index is critical for the `DISTINCT ON (device_id) ... ORDER BY device_id, created_at DESC` pattern used in `get_dashboard_live` to find the latest reading per device. Without it, the query would do a sequential scan on the entire readings table, which would degrade as the table grows.

### Pyodide Cold Start

The first time a user visits the analysis page, Pyodide downloads and initializes the WebAssembly runtime plus numpy, pandas, scipy, and statsmodels from a CDN. This takes roughly 10 seconds on a decent connection and can be longer on slow networks. Subsequent visits within the same browser tab reuse the cached runtime.

The loader is a singleton in `pyodide.ts` that returns the same promise if called multiple times concurrently. This is impotant because without it, navigating away from the analysis page and back would trigger a second Pyodide download. The module-level variable holding the Pyodide instance survives Next.js client-side navigation. A progress callback lets the UI show loading state during initialization. If the load fails (CDN unreachable, etc.), a retry action is surfaced to the user.

This cold start is the single biggest UX issue in the project. On the first visit, users see a loading spinner for 10+ seconds before they can run any analysis. On subsequent visits within the same browser session, analyses start instantly. I added a prominent loading indicator and the "Loading Python runtime..." message to set expectations, but it still feels slow compared to the rest of the dashboard.

One approach I considered but did not implement was preloading Pyodide on the dashboard page so it would be ready by the time the user navigates to the analysis page. I decided against it because it would increase memory usage on every page and download megabytes of WASM on pages where it might never be needed. The trade-off of a one-time cold start felt better than a universal resource cost.

### Dashboard Cache and Navigation

The dashboard uses a module-level `dashboardCache` variable to persist state across client-side navigations. When the user navigates from `/` to `/charts` and back, Next.js unmounts and remounts the Dashboard component, which would normally trigger a full data refetch. The cache stores the last known `deviceData`, `stats`, and `lastRefresh` timestamp. On remount, the component initializes its state from the cache, so the user sees the previous data immediately while fresh data loads in the background.

The cache is updated on unmount via a `useEffect` cleanup function. This is a React pattern where the effect runs on every render (no dependency array for the cleanup registration) and the cleanup stores the current state. It is a lightweight alternative to a global state manager like Redux or Zustand.

### Weather Deduplication

The weather cron runs every 15 minutes, but Vercel can occasionally retry a failed or timed-out invocation, or the route can be triggered manually during testing. Without deduplication, this would insert duplicate weather rows that skew statistics.

The route implements a two-layer defense. First, for each weather device, it queries for existing rows with `source = 'weather'` in the current 15-minute UTC bucket (computed by `getUtcBucketRange()`, which floors the current minute to the nearest 15). If a row exists, it skips the insert and increments `skipped_existing_count`. Second, a unique partial index on `(device_id, date_trunc('hour', created_at AT TIME ZONE 'UTC'), extract(minute)::int / 15) WHERE source = 'weather'` catches any race conditions at the database level. The schema even handles the edge case where the index cannot be created due to existing duplicate weather rows -- it logs a notice and skips the index creation rather than failing the migration.

### RLS Complexity

Row Level Security policies needed to serve three different access patterns simultaneously: Arduino devices (anon role) need INSERT on `readings`, authenticated dashboard users need SELECT on `readings` and full CRUD on `deployments`/`devices`, and server-side routes need unrestricted access for weather inserts, keepalive state upserts, and cascade deletes.

The solution was careful per-table RLS policies. The `readings` table has three policies: a validated anon INSERT (`WITH CHECK` enforcing a device_id regex, temp/humidity bounds, `source = 'sensor'`, and null-enforcement on `deployment_id`/`zip_code`/`observed_at` so attackers can't backfill or mislabel rows), an authenticated SELECT gated on `auth.uid() IS NOT NULL`, and a service_role DELETE policy. Deployments and devices have a signed-in SELECT plus per-verb INSERT/UPDATE/DELETE policies that check `user_roles` on `auth.uid()` for the admin role (not the JWT claim — a direct lookup picks up role changes immediately rather than waiting for JWT refresh). The `device_alert_state` table has authenticated SELECT only, writes go through service_role (which bypasses RLS). Originally the readings anon INSERT was `WITH CHECK (true)` and deployments had a single authenticated "allow all" policy; both were tightened in a later hardening pass.

RPC functions add another layer. All functions have `REVOKE EXECUTE ... FROM PUBLIC, anon` followed by `GRANT EXECUTE ... TO authenticated, service_role`, so anonymous Arduino requests cannot call aggregation functions or read data. The `delete_deployment_cascade` function uses `SECURITY DEFINER` to run as the function owner, letting authenticated users delete readings through the function even though they lack direct DELETE permission on the `readings` table. The auto-registration trigger also uses `SECURITY DEFINER` since it needs to write to the `devices` table from an `anon`-initiated INSERT on `readings`.

Getting RLS right was one of the more frustrating parts of the project. Policies that look correct y themselves can interact in strange ways, and Supabase's error messages for RLS violations are not always descriptive. I ended up testing each policy combination manually.

The schema file includes explicit `DROP POLICY IF EXISTS` before each `CREATE POLICY` to make the migration idempotent. Re-running `schema.sql` does not fail on existing policies. Constraint creation is wrapped in `DO $$ ... END $$` blocks that check for existing constraints and for data that would violate them. This was necessary because the schema evolved over time; running the full migration on a database that already had some of the schema applied needed to work without errors.

### Vercel Cron Reliability

Vercel's cron job execution on the free tier is best-effort. Jobs may occasionally be delayed, skipped, or retried. This affected both the weather and keepalive routes. For weather, the deduplication logic handles retries gracefully. For keepalive, the state-transition-based alerting means a delayed cron just extends the detection window slightly.

Both routes validate the `CRON_SECRET` header and return 401 if it is missing or wrong. This prevents unauthorized triggering from the public internet. The secret is matched as a Bearer token in the Authorization header, matching Vercel's cron invocation format.

### Error Boundaries and Empty States

Every page in the dashboard has to handle the case where data is unavailable, either because the database is empty, the network is down, or a query fails. I used `Promise.allSettled` throughout so that one failed query does not prevent other data from rendering. For example, if the stats query fails but the live readings query succeeds, the dashboard still shows live cards with a loading skeleton in the stats section.

Each live reading card handles four states: loading, live, current readings, sparkline, offline/stale, and no-data. The state is determined by the combination of whether a reading exists and whether it is within the `STALE_THRESHOLD_MS` (5 minutes). These empty states are the first thing a new user sees before any sensor data arrives, so they need to look intentional rather than broken.

The app also includes a `global-error.tsx` boundary for unhandled exceptions, an `error.tsx` for route-level errors, and a `not-found.tsx` for 404 pages. These all use the same glass card styling as the rest of the dashboard, so even error states look visually consistent.

### Testing Strategy

The test suite has 331 tests across 35 test files, covering API routes, components, library utilities, Supabase queries, and context providers.

Tests use Jest with React Testing Library. API route tests mock the Supabase client and verify the correct queries are made, the response format is correct, and error cases return appropriate status codes. Component tests verify that the right elements render for each state and that user interactions trigger the expected callbacks.

I did not aim for 100% coverage, the goal was to cover the critical paths well and leave the purely visual components less covered. The CI pipeline runs `npm run lint` and `npm run build` on every push, with the full test suite and coverage report generated as build artifacts.

---

## 5. What I'd Do Differently

If this were not a school project constrained to free tiers, the architecture in my mind would look different in a few key areas.

**MQTT instead of direct HTTP POSTs.** The current design has each Arduino POST readings directly to Supabase's REST API over HTTPS. A more robust approach would be an MQTT broker e.g., Mosquitto sitting between the sensors and the backend. Sensors would publish to lightweight MQTT topics, and a server-side subscriber would consume messages and write them to the database. MQTT is designed for constrained IoT devices: it uses persistent TCP connections instead of per-request TLS handshakes, supports QoS levels for guaranteed delivery, and handles intermittent connectivity more gracefully than raw HTTP. It also decouples the sensors from the database, so switching from Supabase to another DB would not require reflashing firmware.

**WebSocket push instead of polling.** The dashboard currently polls Supabase every 30 seconds for new readings. With an MQTT broker, the backend could forward new readings to connected dashboard clients over WebSockets.

**Server-side Python instead of in-browser Pyodide.** Running Python analysis in the browser via Pyodide works, but the 10+ second cold start to download and initialize the WebAssembly runtime is the single biggest UX issue in the project. A dedicated serverless function like AWS Lambda running native Python with numpy, pandas, and scipy would execute analyses in milliseconds with no client-side download. The trade-off is cost and infrastructure.

**Dedicated serverless functions for scheduled tasks.** Vercel's cron system on the free tier is best-effort, meaning jobs can be delayed, skipped, or retried unpredictably. A dedicated scheduler like AWS EventBridge triggering Lambda, would provide reliable execution for the weather ingestion and keepalive health checks.

**Multi-user support.** The current auth model assumes a single user. A production system would need role-based access, per-user device scoping, and shared dashboards with configurable permissions.

All of these improvements add complexity and cost, which were the two things I most wanted to avoid. In my opinion for a school project meant to be forked and reproduced by other students, the simpler architecture is the correct choice here. 

---

Overall, the project grew from a barebones two-sensor dashboard into a comprehensive IoT platform with weather validation, statistical analysis, and AI chat. Each feature was added to solve a real problem encountered during use, and I tried to make decisions that balanced educational value and technical correctness.

The most important lesson was that starting simple and iterating is always better than trying to build everything at once. But that does not mean ignoring scalability. I now think about how I would scale something from the very beginning, even if the first implementation is intentionally simple. The second lesson was that free tiers are powerful but impose constraints that shape your architecture. The 3-minute averaging, adaptive chart bucketing, batched RPC queries, and weather deduplication all exist because of free tier limits. These constraints are net positives in my eyes: they forced me to think about efficiency in ways that a pay-as-you-go setup would not have.

Thank you for reading!
