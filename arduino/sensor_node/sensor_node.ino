/*
 * IoT Temperature & Humidity Sensor Node
 *
 * Hardware: Arduino Uno R4 WiFi, DHT20 (I2C), 16x2 LCD (parallel)
 *
 * Reads sensor every 15s, averages over 3 minutes, POSTs average to Supabase.
 * LCD shows current Fahrenheit reading; database stores Celsius.
 *
 * Setup: copy secrets.example.h → secrets.h, fill in credentials,
 *        set DEVICE_ID, upload.
 */

#include <WiFiS3.h>
#include <LiquidCrystal.h>
#include "DFRobot_DHT20.h"
#include "secrets.h"

#define DEVICE_ID "node1"
#define READ_INTERVAL_MS 15000
#define SEND_INTERVAL_MS 180000

#define LCD_RS 12
#define LCD_EN 11
#define LCD_D4 5
#define LCD_D5 4
#define LCD_D6 3
#define LCD_D7 2

LiquidCrystal lcd(LCD_RS, LCD_EN, LCD_D4, LCD_D5, LCD_D6, LCD_D7);
DFRobot_DHT20 dht20;
WiFiSSLClient wifiClient;

const int httpsPort = 443;

unsigned long lastReadTime = 0;
unsigned long lastSendTime = 0;
int wifiStatus = WL_IDLE_STATUS;
bool sensorOk = false;

float tempSum = 0;
float humiditySum = 0;
int readingCount = 0;
int consecutiveFailures = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000);

  Serial.println();
  Serial.println("=== IoT Temp/Humidity Sensor ===");
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);

  lcd.begin(16, 2);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Starting...");
  lcd.setCursor(0, 1);
  lcd.print("ID: ");
  lcd.print(DEVICE_ID);

  Serial.print("Initializing DHT20... ");
  if (dht20.begin() == 0) {
    Serial.println("OK");
    sensorOk = true;
  } else {
    Serial.println("FAILED");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Sensor Error!");
  }

  connectWiFi();

  delay(1000);
  lcd.clear();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected, reconnecting...");
    connectWiFi();
  }

  unsigned long now = millis();

  if (now - lastReadTime >= READ_INTERVAL_MS) {
    lastReadTime = now;

    float tempC = dht20.getTemperature();
    float humidity = dht20.getHumidity() * 100; // DHT20 returns 0-1

    if (isnan(tempC) || isnan(humidity)) {
      Serial.println("Sensor read failed!");
      displayError("Sensor Error");
      return;
    }

    float tempF = tempC * 9.0 / 5.0 + 32.0;
    displayReadings(tempF, humidity);

    tempSum += tempC;
    humiditySum += humidity;
    readingCount++;

    Serial.print("Reading #");
    Serial.print(readingCount);
    Serial.print(" | Temp: ");
    Serial.print(tempC, 1);
    Serial.print("C (");
    Serial.print(tempF, 1);
    Serial.print("F), Humidity: ");
    Serial.print(humidity, 1);
    Serial.println("%");
  }

  if (now - lastSendTime >= SEND_INTERVAL_MS && readingCount > 0) {
    float avgTempC = tempSum / readingCount;
    float avgHumidity = humiditySum / readingCount;

    Serial.print(">> Sending average of ");
    Serial.print(readingCount);
    Serial.print(" readings | Avg Temp: ");
    Serial.print(avgTempC, 2);
    Serial.print("C, Avg Humidity: ");
    Serial.print(avgHumidity, 2);
    Serial.println("%");

    bool sent = sendToSupabase(avgTempC, avgHumidity);
    Serial.println(sent ? ">> Sent OK" : ">> Send failed - retaining buffer");

    if (sent) {
      tempSum = 0;
      humiditySum = 0;
      readingCount = 0;
      lastSendTime = now;
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      // Back off: retry after 30s, 60s, 120s... capped at SEND_INTERVAL
      unsigned long backoff = min((unsigned long)30000 * consecutiveFailures, SEND_INTERVAL_MS);
      lastSendTime = now - SEND_INTERVAL_MS + backoff;
    }
  }
}

void connectWiFi() {
  if (WiFi.status() == WL_NO_MODULE) {
    Serial.println("WiFi module not found!");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("No WiFi Module!");
    while (true);
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

bool sendToSupabase(float tempC, float humidity) {
  String host = String(SUPABASE_URL);
  if (host.startsWith("https://")) {
    host = host.substring(8);
  }

  Serial.print("Connecting to ");
  Serial.print(host);
  Serial.println("...");

  if (!wifiClient.connect(host.c_str(), httpsPort)) {
    Serial.println("Connection failed!");
    return false;
  }

  String payload = "{\"device_id\":\"";
  payload += DEVICE_ID;
  payload += "\",\"temperature\":";
  payload += String(tempC, 2);
  payload += ",\"humidity\":";
  payload += String(humidity, 2);
  payload += "}";

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

  wifiClient.print(request);

  unsigned long timeout = millis();
  while (wifiClient.available() == 0) {
    if (millis() - timeout > 10000) {
      Serial.println("Request timeout!");
      wifiClient.stop();
      return false;
    }
  }

  String statusLine = wifiClient.readStringUntil('\n');
  Serial.print("Response: ");
  Serial.println(statusLine);

  bool success = statusLine.indexOf("200") > 0 ||
                 statusLine.indexOf("201") > 0 ||
                 statusLine.indexOf("204") > 0;

  while (wifiClient.available()) {
    wifiClient.read();
  }

  wifiClient.stop();
  return success;
}

void displayReadings(float tempF, float humidity) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Temp: ");
  lcd.print(tempF, 1);
  lcd.print((char)223);
  lcd.print("F");

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
