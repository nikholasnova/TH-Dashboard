# IoT Temp/Humidity Dashboard

A full-stack IoT platform for collecting temperature and humidity from Arduino sensor nodes, comparing readings against local weather references, and analyzing the data through charts, statistics, and AI. Built as an educational project.

Two Arduino Uno R4 WiFi nodes with DHT20 sensors post readings to Supabase every 3 minutes. A Vercel cron fetches hourly weather from WeatherAPI.com for each node's deployment location. The web dashboard shows live data, historical charts, side-by-side comparisons with `% Error` against weather, deployment management, in-browser Python analysis via Pyodide, and an AI chat powered by Gemini.

## Architecture

```mermaid
flowchart TB
  subgraph edge["1) Edge Sensor Layer"]
    dht1["DHT20 #1"]
    dht2["DHT20 #2"]
    n1["Arduino node1<br/>15s reads, 3m averages"]
    n2["Arduino node2<br/>15s reads, 3m averages"]
    dht1 -->|"I2C (0x38)"| n1
    dht2 -->|"I2C (0x38)"| n2
  end

  subgraph ingest["2) Ingestion + Automation (Vercel)"]
    cron["Vercel Cron<br/>*/10 keepalive, 0 * * * * weather"]
    keepalive["GET /api/keepalive"]
    weatherRoute["GET /api/weather"]
    wx["WeatherAPI.com<br/>Current conditions by ZIP"]
    cron --> keepalive
    cron --> weatherRoute
    weatherRoute -->|"Fetch by ZIP"| wx
  end

  subgraph data["3) Data Platform"]
    db[(("Supabase Postgres<br/>readings / deployments / RPC"))]
  end

  subgraph app["4) App + Analysis Layer"]
    ui["Next.js App<br/>Dashboard / Charts / Compare / Analysis"]
    chat["POST /api/chat<br/>Gemini tool calls"]
  end

  n1 -->|"HTTPS POST /rest/v1/readings"| db
  n2 -->|"HTTPS POST /rest/v1/readings"| db
  keepalive -->|"Health checks + alert state"| db
  weatherRoute -->|"Insert weather_* rows<br/>source=weather"| db
  ui <-->|"Authenticated SELECT + RPC"| db
  chat -->|"Service-role queries"| db
  ui -. "Chat requests" .-> chat
```

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Live readings, device status, deployment context |
| `/charts` | Historical trends with time range selector + CSV export |
| `/compare` | Side-by-side stats, weather reference, `% Error` per node |
| `/deployments` | Manage placement windows and ZIP codes |
| `/analysis` | In-browser Python stats and forecasting (Pyodide) |
| `/api/chat` | AI chat with tool-calling for data questions and reports |

## Tech Stack

| Layer | Tech |
|-------|------|
| Hardware | Arduino Uno R4 WiFi + DHT20 (I2C) |
| Database | Supabase Postgres + Auth + RLS |
| Web | Next.js 16 (App Router), Vercel |
| AI | Gemini 2.5 Flash (tool-calling) |
| Analysis | Pyodide (numpy, pandas, scipy, statsmodels) |
| Weather | WeatherAPI.com (free tier) |

## Docs

| Doc | Contents |
|-----|----------|
| [SETUP.md](SETUP.md) | Local dev, Vercel deploy, env vars, Arduino setup, troubleshooting |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Data flow, schema, RPC functions, trust boundaries, failure modes |
| [arduino/sensor_node/README.md](arduino/sensor_node/README.md) | Firmware, wiring, hardware notes |

## Hardware

<!-- Add your own photos below -->
<!-- ![Node 1](docs/images/node1-circuit.jpg) -->
<!-- ![Node 2](docs/images/node2-circuit.jpg) -->
<!-- ![Deployment](docs/images/measurement-setting.jpg) -->

## License

MIT
