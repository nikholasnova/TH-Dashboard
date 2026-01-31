/*
 * IoT Temperature & Humidity Sensor Node
 *
 * Hardware:
 *   - Arduino Uno R4 WiFi
 *   - DHT20 sensor (I2C: SDA=A4, SCL=A5)
 *   - 16x2 LCD display (parallel wiring)
 *
 * Sends readings to Supabase every READ_INTERVAL_MS milliseconds.
 * Displays current temp/humidity on LCD.
 *
 * Setup:
 *   1. Copy secrets.example.h to secrets.h
 *   2. Fill in your WiFi and Supabase credentials
 *   3. Set DEVICE_ID to "node1" or "node2"
 *   4. Upload to your board
 */

#include <WiFiS3.h>
#include <LiquidCrystal.h>
#include "DFRobot_DHT20.h"
#include "secrets.h"

// ============== CONFIGURATION ==============
// Change this for each device
#define DEVICE_ID "node1"  // "node1" or "node2"

// How often to read and send data (milliseconds)
#define READ_INTERVAL_MS 12000  // 12 seconds

// LCD pin wiring (parallel mode)
// RS, E, D4, D5, D6, D7
#define LCD_RS 12
#define LCD_EN 11
#define LCD_D4 5
#define LCD_D5 4
#define LCD_D6 3
#define LCD_D7 2

// ============== OBJECTS ==============
LiquidCrystal lcd(LCD_RS, LCD_EN, LCD_D4, LCD_D5, LCD_D6, LCD_D7);
DFRobot_DHT20 dht20;
WiFiSSLClient wifiClient;

// HTTPS port for Supabase
const int httpsPort = 443;

// ============== STATE ==============
unsigned long lastReadTime = 0;
int wifiStatus = WL_IDLE_STATUS;
bool sensorOk = false;

// ============== SETUP ==============
void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000); // Wait up to 3s for serial

  Serial.println();
  Serial.println("=== IoT Temp/Humidity Sensor ===");
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);

  // Initialize LCD
  lcd.begin(16, 2);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Starting...");
  lcd.setCursor(0, 1);
  lcd.print("ID: ");
  lcd.print(DEVICE_ID);

  // Initialize DHT20 sensor
  Serial.print("Initializing DHT20... ");
  if (dht20.begin() == 0) {
    Serial.println("OK");
    sensorOk = true;
  } else {
    Serial.println("FAILED");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Sensor Error!");
    // Keep trying in loop
  }

  // Connect to WiFi
  connectWiFi();

  delay(1000);
  lcd.clear();
}

// ============== MAIN LOOP ==============
void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected, reconnecting...");
    connectWiFi();
  }

  // Read and send at interval
  unsigned long now = millis();
  if (now - lastReadTime >= READ_INTERVAL_MS) {
    lastReadTime = now;

    // Read sensor
    float tempC = dht20.getTemperature();
    float humidity = dht20.getHumidity() * 100;  // Convert to percentage

    // Validate readings
    if (isnan(tempC) || isnan(humidity)) {
      Serial.println("Sensor read failed!");
      displayError("Sensor Error");
      return;
    }

    // Convert to Fahrenheit for display (database stores Celsius)
    float tempF = tempC * 9.0 / 5.0 + 32.0;

    // Update LCD
    displayReadings(tempF, humidity);

    // Log to serial
    Serial.print("Temp: ");
    Serial.print(tempC, 1);
    Serial.print("C (");
    Serial.print(tempF, 1);
    Serial.print("F), Humidity: ");
    Serial.print(humidity, 1);
    Serial.println("%");

    // Send to Supabase
    bool sent = sendToSupabase(tempC, humidity);
    if (sent) {
      Serial.println("Data sent to Supabase OK");
    } else {
      Serial.println("Failed to send data");
    }
  }
}

// ============== WIFI ==============
void connectWiFi() {
  // Check for WiFi module
  if (WiFi.status() == WL_NO_MODULE) {
    Serial.println("WiFi module not found!");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("No WiFi Module!");
    while (true); // Halt
  }

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");
  lcd.setCursor(0, 1);
  lcd.print(WIFI_SSID);

  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    wifiStatus = WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print(".");
    lcd.setCursor(15, 0);
    lcd.print(attempts % 4 == 0 ? "|" :
              attempts % 4 == 1 ? "/" :
              attempts % 4 == 2 ? "-" : "\\");
    delay(1000);
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("Connected! IP: ");
    Serial.println(WiFi.localIP());

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connected!");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    delay(2000);
  } else {
    Serial.println();
    Serial.println("WiFi connection failed!");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Failed!");
    delay(2000);
  }
}

// ============== SUPABASE ==============
bool sendToSupabase(float tempC, float humidity) {
  // Extract host from URL (skip "https://")
  String host = String(SUPABASE_URL);
  if (host.startsWith("https://")) {
    host = host.substring(8);
  }

  Serial.print("Connecting to ");
  Serial.print(host);
  Serial.println("...");

  // Connect to Supabase
  if (!wifiClient.connect(host.c_str(), httpsPort)) {
    Serial.println("Connection failed!");
    return false;
  }

  // Build JSON payload
  // Temperature stored in Celsius
  String payload = "{\"device_id\":\"";
  payload += DEVICE_ID;
  payload += "\",\"temperature\":";
  payload += String(tempC, 2);
  payload += ",\"humidity\":";
  payload += String(humidity, 2);
  payload += "}";

  // Build HTTP request
  String request = "POST /rest/v1/readings HTTP/1.1\r\n";
  request += "Host: " + host + "\r\n";
  request += "Content-Type: application/json\r\n";
  request += "apikey: " + String(SUPABASE_ANON_KEY) + "\r\n";
  request += "Authorization: Bearer " + String(SUPABASE_ANON_KEY) + "\r\n";
  request += "Prefer: return=minimal\r\n";
  request += "Content-Length: " + String(payload.length()) + "\r\n";
  request += "Connection: close\r\n";
  request += "\r\n";
  request += payload;

  // Send request
  wifiClient.print(request);

  // Wait for response
  unsigned long timeout = millis();
  while (wifiClient.available() == 0) {
    if (millis() - timeout > 10000) {
      Serial.println("Request timeout!");
      wifiClient.stop();
      return false;
    }
  }

  // Read response status line
  String statusLine = wifiClient.readStringUntil('\n');
  Serial.print("Response: ");
  Serial.println(statusLine);

  // Check for 2xx success
  bool success = statusLine.indexOf("200") > 0 ||
                 statusLine.indexOf("201") > 0 ||
                 statusLine.indexOf("204") > 0;

  // Consume rest of response
  while (wifiClient.available()) {
    wifiClient.read();
  }

  wifiClient.stop();
  return success;
}

// ============== LCD DISPLAY ==============
void displayReadings(float tempF, float humidity) {
  lcd.clear();

  // Line 1: Temperature
  lcd.setCursor(0, 0);
  lcd.print("Temp: ");
  lcd.print(tempF, 1);
  lcd.print((char)223);  // Degree symbol
  lcd.print("F");

  // Line 2: Humidity
  lcd.setCursor(0, 1);
  lcd.print("Hum:  ");
  lcd.print(humidity, 1);
  lcd.print("%");
}

void displayError(const char* msg) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("ERROR:");
  lcd.setCursor(0, 1);
  lcd.print(msg);
}
