# Arduino Sensor Node

Firmware for the DHT20 temperature/humidity sensor node. Reads every 15 seconds, averages over 3-minute windows, and POSTs the average to Supabase.

## Hardware

- Arduino Uno R4 WiFi
- DHT20 sensor (I2C)
- 16x2 LCD display (parallel wiring)
- Breadboard and jumper wires

## Wiring

### DHT20 Sensor (I2C)

| DHT20 Pin | Arduino Pin |
|-----------|-------------|
| VCC       | 5V          |
| GND       | GND         |
| SDA       | SDA (A4)    |
| SCL       | SCL (A5)    |

### 16x2 LCD Display (Parallel 4-bit)

| LCD Pin | Arduino Pin | Notes               |
|---------|-------------|----------------------|
| VSS     | GND         |                      |
| VDD     | 5V          |                      |
| V0      | Potentiometer | 10K pot for contrast |
| RS      | 12          |                      |
| RW      | GND         | Grounded = write-only |
| E       | 11          |                      |
| D4      | 5           |                      |
| D5      | 4           |                      |
| D6      | 3           |                      |
| D7      | 2           |                      |
| A       | 5V          | Backlight            |
| K       | GND         | Backlight            |

## Required Libraries

Install via **Arduino IDE > Tools > Manage Libraries**:

| Library | Notes |
|---------|-------|
| DFRobot_DHT20 | [GitHub](https://github.com/DFRobot/DFRobot_DHT20) |
| LiquidCrystal | Built-in |
| WiFiS3 | Built-in with R4 board package |

Board package: **Tools > Boards Manager** > search "Arduino UNO R4" > Install

## Setup

```bash
cd arduino/sensor_node
cp secrets.example.h secrets.h
```

Edit `secrets.h`:

```cpp
#define WIFI_SSID     "your-wifi-network"
#define WIFI_PASSWORD "your-wifi-password"
#define SUPABASE_URL      "https://your-project-id.supabase.co"
#define SUPABASE_ANON_KEY "your-anon-key"
```

Set device ID in `sensor_node.ino`:

```cpp
#define DEVICE_ID "node1"  // or "node2"
```

Upload: **Tools > Board > Arduino UNO R4 WiFi** > Select port > Upload

## Configuration

| Constant | Default | Description |
|----------|---------|-------------|
| `DEVICE_ID` | `"node1"` | Unique identifier sent with each reading |
| `READ_INTERVAL_MS` | `15000` | Sensor read + LCD update interval (15s) |
| `SEND_INTERVAL_MS` | `180000` | Supabase POST interval (3 min, sends average of accumulated reads) |

## How It Works

1. Connects to WiFi, initializes DHT20 and LCD
2. Every 15 seconds: reads sensor, updates LCD, accumulates values
3. Every 3 minutes: averages accumulated readings, POSTs to Supabase, resets accumulators
4. LCD always shows the latest individual reading in Fahrenheit

Temperature is stored in Celsius in the database and converted to Fahrenheit in the web UI.

## Communication Details

### I2C: DHT20 <-> Arduino Uno R4 WiFi

- Protocol: I2C
- Bus lines: `SDA`, `SCL`
- Sensor address: `0x38` (DHT20 default)
- Read cadence: every `READ_INTERVAL_MS` (default 15s)
- Error handling: invalid (`NaN`) readings are rejected and not added to averaging buffer

### HTTPS: Arduino -> Supabase REST

- Transport: TLS on port `443` using `WiFiSSLClient`
- Endpoint: `POST /rest/v1/readings`
- Headers: `apikey`, `Authorization: Bearer <anon-key>`, `Content-Type: application/json`
- Payload:

```json
{
  "device_id": "node1",
  "temperature": 22.5,
  "humidity": 45.2
}
```

- Timing: one averaged upload every `SEND_INTERVAL_MS` (default 3 minutes)

## Data Format

```json
{
  "device_id": "node1",
  "temperature": 22.5,
  "humidity": 45.2
}
```

`created_at` is added automatically by Supabase.

## Troubleshooting

**"No WiFi Module!"** — Wrong board selected. Use "Arduino UNO R4 WiFi", not "UNO R4 Minima".

**"Sensor Error!"** — Check DHT20 SDA/SCL wiring. DHT20 needs ~100ms after power-on before first read.

**"WiFi Failed!"** — Verify `secrets.h` credentials. R4 WiFi only supports 2.4GHz.

**LCD blank or garbled** — Adjust contrast pot. Verify all pin connections match the defines in code.

**Data not in Supabase** — Check serial monitor (115200 baud) for POST errors. Verify URL, anon key, and that `readings` table exists with anon INSERT policy.

## Serial Output

```
=== IoT Temp/Humidity Sensor ===
Device ID: node1
Initializing DHT20... OK
Connecting to WiFi: MyNetwork...
Connected! IP: 192.168.1.42
Reading #1 | Temp: 22.5C (72.5F), Humidity: 45.2%
Reading #2 | Temp: 22.6C (72.7F), Humidity: 45.1%
...
>> Sending average of 12 readings | Avg Temp: 22.55C, Avg Humidity: 45.15%
>> Average data sent to Supabase OK
```
