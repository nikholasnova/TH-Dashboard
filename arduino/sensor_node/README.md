# Arduino Sensor Node

Firmware for the DHT20 temperature/humidity sensor node that sends data to Supabase.

## Hardware Required

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

### 16x2 LCD Display (Parallel Mode)

| LCD Pin | Arduino Pin | Description     |
|---------|-------------|-----------------|
| VSS     | GND         | Ground          |
| VDD     | 5V          | Power           |
| V0      | Potentiometer| Contrast (0-5V)|
| RS      | 12          | Register Select |
| RW      | GND         | Read/Write (GND for write) |
| E       | 11          | Enable          |
| D4      | 5           | Data bit 4      |
| D5      | 4           | Data bit 5      |
| D6      | 3           | Data bit 6      |
| D7      | 2           | Data bit 7      |
| A       | 5V          | Backlight +     |
| K       | GND         | Backlight -     |

**Note:** Use a 10K potentiometer between 5V and GND with the wiper connected to V0 to adjust contrast.

## Required Libraries

Install these via **Arduino IDE > Tools > Manage Libraries**:

1. **DFRobot_DHT20** - DHT20 temperature/humidity sensor
   - Search for "DFRobot DHT20" or download from [GitHub](https://github.com/DFRobot/DFRobot_DHT20)

2. **LiquidCrystal** - Built-in with Arduino IDE (no install needed)

3. **WiFiS3** - Built-in with Arduino Uno R4 WiFi board package

**Note:** Make sure you have the Arduino Uno R4 board package installed:
- **Tools > Board > Boards Manager** > Search "Arduino UNO R4" > Install

## Setup

### 1. Install Libraries

Open Arduino IDE and install the required libraries listed above.

### 2. Configure Credentials

```bash
cd arduino/sensor_node
cp secrets.example.h secrets.h
```

Edit `secrets.h` with your credentials:

```cpp
#define WIFI_SSID     "your-wifi-network"
#define WIFI_PASSWORD "your-wifi-password"

#define SUPABASE_URL      "https://your-project-id.supabase.co"
#define SUPABASE_ANON_KEY "your-anon-key-from-supabase-settings"
```

Find your Supabase credentials at: **Supabase Dashboard > Settings > API**

### 3. Set Device ID

Edit `sensor_node.ino` and set the device ID (line ~29):

```cpp
#define DEVICE_ID "node1"  // Use "node1" or "node2"
```

### 4. Upload

1. Connect your Arduino Uno R4 WiFi via USB
2. **Tools > Board** > Select "Arduino UNO R4 WiFi"
3. **Tools > Port** > Select your board's port
4. Click Upload

## Configuration Options

Edit these in `sensor_node.ino`:

| Constant | Default | Description |
|----------|---------|-------------|
| `DEVICE_ID` | `"node1"` | Unique identifier for this sensor |
| `READ_INTERVAL_MS` | `12000` | Milliseconds between readings (12s) |
| `LCD_RS`, `LCD_EN`, etc. | Various | LCD pin assignments |

## How It Works

1. **Startup**: Connects to WiFi, initializes sensor and LCD
2. **Loop**: Every `READ_INTERVAL_MS`:
   - Reads temperature (Celsius) and humidity from DHT20
   - Displays readings on LCD (temperature shown in Fahrenheit)
   - Sends data to Supabase via HTTPS POST
3. **Display**: Shows current temp/humidity, connection status

## Data Format

Readings are sent to Supabase as JSON:

```json
{
  "device_id": "node1",
  "temperature": 22.5,
  "humidity": 45.2
}
```

- **Temperature** is stored in **Celsius** (converted to Fahrenheit in the web UI)
- **Humidity** is stored as a **percentage** (0-100)
- `created_at` timestamp is added automatically by Supabase

## Troubleshooting

### "No WiFi Module!"
- Check you selected "Arduino UNO R4 WiFi" (not "UNO R4 Minima")

### "Sensor Error!"
- Check DHT20 wiring (SDA/SCL connections)
- Ensure DHT20 library is installed
- DHT20 requires 100ms delay after power-on

### "WiFi Failed!"
- Verify SSID and password in `secrets.h`
- Check WiFi network is 2.4GHz (R4 WiFi doesn't support 5GHz)
- Move closer to router

### LCD shows nothing or garbled text
- Adjust contrast potentiometer
- Check all LCD wiring connections
- Verify pin assignments match your wiring

### Data not appearing in Supabase
- Check serial monitor for error messages
- Verify Supabase URL and anon key
- Ensure `readings` table exists (run `schema.sql`)
- Check RLS policies allow anonymous inserts

## Serial Monitor

Open **Tools > Serial Monitor** (115200 baud) to see debug output:

```
=== IoT Temp/Humidity Sensor ===
Device ID: node1
Initializing DHT20... OK
Connecting to WiFi: MyNetwork...
Connected! IP: 192.168.1.42
Temp: 22.5C (72.5F), Humidity: 45.2%
Data sent to Supabase OK
```

## Power Consumption

For battery-powered deployments, consider:
- Increasing `READ_INTERVAL_MS` to reduce transmissions
- Using deep sleep between readings (requires code modification)
- The R4 WiFi draws ~100mA when active with WiFi
