#include <OneWire.h>
#include <DallasTemperature.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

// ===== Wi-Fi Credentials =====
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// ===== Firebase Configuration =====
#define FIREBASE_PROJECT_ID "YOUR-PROJECT-ID"
#define FIREBASE_DATABASE_SECRET "YOUR_FB_DB_SECRET"
#define FIREBASE_RTDB_HOST FIREBASE_PROJECT_ID "-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_RTDB_PORT 443

// ===== DS18B20 Sensor =====
#define ONE_WIRE_BUS 4
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// ===== MQ-7 Sensor =====
#define MQ7_ANALOG_PIN 32           // MQ-7 analog output pin
#define RL_VALUE 10.0               // Load resistor value (kΩ)
#define R0 34.0                     // Clean air resistance (calibrated)
#define ADC_RESOLUTION 4095.0       // ESP32 ADC is 12 bits
#define VCC 5.0                     // Sensor powered at 5V (recommended)

// ===== PMS5003 Sensor =====
#define RXD2 16
#define TXD2 17
struct pms5003data {
  uint16_t framelen;
  uint16_t pm10_standard;
  uint16_t pm25_standard;
  uint16_t pm100_standard;
  uint16_t pm10_env;
  uint16_t pm25_env;
  uint16_t pm100_env;
  uint16_t particles_03um;
  uint16_t particles_05um;
  uint16_t particles_10um;
  uint16_t particles_25um;
  uint16_t particles_50um;
  uint16_t particles_100um;
  uint16_t unused;
  uint16_t checksum;
};
struct pms5003data pms_data;

// ===== WiFiClientSecure object for HTTPS communication =====
WiFiClientSecure ssl_client;

// ===== Timing for readings and warm-up =====
const long MQ7_WARMUP_TIME = 60000;    // 1 minute (increase to 300000 for 5min if desired)
const long PMS_WARMUP_TIME = 60000;    // 1 minute (datasheet: at least 30s)
const long READING_INTERVAL = 3600000; // 1 hour
unsigned long lastReadingTime = 0;
unsigned long mq7StartTime = 0;
unsigned long pmsStartTime = 0;

// ===== Function Prototypes =====
boolean readPMSdata(Stream *s);
void sendSensorData(float co_ugm3, const String& isoTime);
float mq7_get_co_ugm3(float adc_raw);

void setup() {
    Serial.begin(115200);
    Serial.println("ESP32 Multi-Sensor Reading Started!");

    // WiFi
    Serial.print("Connecting to Wi-Fi: ");
    Serial.println(WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWi-Fi connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    // Set timezone for Asia/Kolkata (IST, UTC+5:30)
    setenv("TZ", "IST-5:30", 1);
    tzset();

    // NTP time sync
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    Serial.print("Waiting for NTP time sync...");
    time_t now = time(nullptr);
    while (now < 8 * 3600 * 2) { // wait for valid time
        delay(500);
        Serial.print(".");
        now = time(nullptr);
    }
    Serial.println("\nTime synced.");
    
    ssl_client.setInsecure();

    // Initialize sensors
    sensors.begin();
    Serial.println("DS18B20 sensor initialized.");

    pinMode(MQ7_ANALOG_PIN, INPUT);

    Serial1.begin(9600, SERIAL_8N1, RXD2, TXD2);
    Serial.print("PMS5003 serial initialized on RX: ");
    Serial.print(RXD2);
    Serial.print(", TX: ");
    Serial.println(TXD2);

    // Start warmup timers
    mq7StartTime = millis();
    pmsStartTime = millis();

    Serial.println("Setup complete.");
}

void loop() {
    unsigned long now = millis();

    // Warm-up logic
    bool mq7_ready = (now - mq7StartTime) >= MQ7_WARMUP_TIME;
    bool pms_ready = (now - pmsStartTime) >= PMS_WARMUP_TIME;

    if (!mq7_ready) Serial.println("Waiting for MQ7 warm-up...");
    if (!pms_ready) Serial.println("Waiting for PMS5003 warm-up...");

    // Take a reading every READING_INTERVAL, but only if both sensors are ready
    if (mq7_ready && pms_ready && (now - lastReadingTime >= READING_INTERVAL || lastReadingTime == 0)) {
        lastReadingTime = now;

        float adc_raw = analogRead(MQ7_ANALOG_PIN);
        float co_ugm3 = mq7_get_co_ugm3(adc_raw);

        // ISO8601 time string
        time_t tnow = time(nullptr);
        tnow += 19800;
        struct tm timeinfo;
        gmtime_r(&tnow, &timeinfo);
        char isoTime[25];
        strftime(isoTime, sizeof(isoTime), "%d-%m-%Y %H:00", &timeinfo);

        Serial.print("MQ-7 ADC: "); Serial.println(adc_raw);
        // All debug info
        float vout = (adc_raw / ADC_RESOLUTION) * VCC;
        Serial.print("Vout: "); Serial.println(vout, 3);
        float rs = (vout > 0.01) ? (VCC - vout) * RL_VALUE / vout : 0;
        Serial.print("Rs: "); Serial.println(rs, 3);
        float ratio = (rs > 0) ? rs / R0 : 0;
        Serial.print("Rs/R0: "); Serial.println(ratio, 3);
        float ppm = (ratio > 0) ? 99.042 * pow(ratio, -1.518) : 0;
        Serial.print("PPM: "); Serial.println(ppm, 3);
        Serial.print("CO ug/m3: "); Serial.println(co_ugm3, 3);

        sendSensorData(co_ugm3, String(isoTime));
    }
    yield();
}

// ===== Calculate CO ug/m3 from MQ-7 sensor reading =====
float mq7_get_co_ugm3(float adc_raw) {
    float a = 99.042;
    float b = -1.518;
    float vout = (adc_raw / ADC_RESOLUTION) * VCC;
    if (vout <= 0.01) return 0; // avoid div by 0
    float rs = (VCC - vout) * RL_VALUE / vout;
    if (rs <= 0.01) return 0;
    float ratio = rs / R0;
    float ppm = a * pow(ratio, b); // datasheet curve
    float co_ugm3 = ppm * 1145.0; // conversion factor
    return co_ugm3;
}

// ===== PMS5003 Parser (unchanged) =====
boolean readPMSdata(Stream *s) {
    if (! s->available()) return false;
    if (s->peek() != 0x42) { s->read(); return false; }
    if (s->available() < 32) return false;
    uint8_t buffer[32];
    uint16_t sum = 0;
    s->readBytes(buffer, 32);
    for (uint8_t i = 0; i < 30; i++) sum += buffer[i];
    uint16_t buffer_u16[15];
    for (uint8_t i = 0; i < 15; i++) {
        buffer_u16[i] = buffer[2 + i * 2 + 1];
        buffer_u16[i] += (buffer[2 + i * 2] << 8);
    }
    memcpy((void *)&pms_data, (void *)buffer_u16, 30);
    if (sum != pms_data.checksum) {
        Serial.println("PMS5003 Checksum failure");
        return false;
    }
    return true;
}

// ===== Send Sensor Data to Firebase Realtime Database =====
void sendSensorData(float co_ugm3, const String& isoTime) {
    // ===== Temperature (Celsius only) =====
    sensors.requestTemperatures();
    float temperatureC = sensors.getTempCByIndex(0);
    if (temperatureC == DEVICE_DISCONNECTED_C) {
        Serial.println("Temperature sensor not ready. Skipping upload.");
        return;
    }

    // ===== PMS5003 (ug/m3) =====
    bool pms_read_success = readPMSdata(&Serial1);
    if (!pms_read_success) {
        Serial.println("PMS5003 not ready or bad data. Skipping upload.");
        return;
    }

    // ===== Build JSON only if all readings valid =====
    String jsonPayload = "{";
    jsonPayload += "\"datetime\":\"" + isoTime + "\"";
    jsonPayload += ",\"temp\":" + String(temperatureC, 2);
    jsonPayload += ",\"co\":" + String(co_ugm3, 1);
    jsonPayload += ",\"pm2_5\":" + String(pms_data.pm25_standard);
    jsonPayload += ",\"pm10\":" + String(pms_data.pm100_standard);
    jsonPayload += "}";

    Serial.print("Attempting to send JSON: ");
    Serial.println(jsonPayload);

    String rtdbPath = "/.json?auth=" + String(FIREBASE_DATABASE_SECRET);

    Serial.print("Connecting to Firebase RTDB host: ");
    Serial.println(FIREBASE_RTDB_HOST);

    if (ssl_client.connect(FIREBASE_RTDB_HOST, FIREBASE_RTDB_PORT)) {
        Serial.println("Connected to Firebase RTDB via HTTPS.");

        String httpRequest = "POST " + rtdbPath + " HTTP/1.1\r\n";
        httpRequest += "Host: " + String(FIREBASE_RTDB_HOST) + "\r\n";
        httpRequest += "Content-Type: application/json\r\n";
        httpRequest += "Content-Length: " + String(jsonPayload.length()) + "\r\n";
        httpRequest += "Connection: close\r\n\r\n";
        httpRequest += jsonPayload;
        Serial.println("Sending HTTP POST request:");
        Serial.println(httpRequest);

        ssl_client.print(httpRequest);

        Serial.println("\nFirebase Server Response:");
        String response = "";
        long startTime = millis();
        while (ssl_client.connected() && (millis() - startTime < 10000)) {
            if (ssl_client.available()) {
                char c = ssl_client.read();
                response += c;
            }
        }
        ssl_client.stop();

        Serial.println(response);

        int httpCode = -1;
        int firstLineEnd = response.indexOf('\n');
        if (firstLineEnd != -1) {
            String statusLine = response.substring(0, firstLineEnd);
            int statusCodeStart = statusLine.indexOf(' ') + 1;
            int statusCodeEnd = statusLine.indexOf(' ', statusCodeStart);
            if (statusCodeStart != -1 && statusCodeEnd != -1) {
                httpCode = statusLine.substring(statusCodeStart, statusCodeEnd).toInt();
            }
        }

        if (httpCode == 200) {
            Serial.println("Data pushed successfully to Realtime Database!");
        } else {
            Serial.print("Failed to push data to Realtime Database. HTTP Code: ");
            Serial.println(httpCode);
        }
    } else {
        Serial.println("Failed to connect to Firebase RTDB via HTTPS.");
    }
}
