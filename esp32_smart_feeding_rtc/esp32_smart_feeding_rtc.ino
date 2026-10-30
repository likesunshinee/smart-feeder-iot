#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include "RTClib.h"

// ================= WIFI =================
const char* WIFI_SSID = "Samsung A17";
const char* WIFI_PASSWORD = "Fyreablaze";

// ================= MQTT =================
// Broker contoh untuk pengujian.
// Harus sama dengan broker yang digunakan website.
const char* MQTT_SERVER = "broker.emqx.io";
const int MQTT_PORT = 1883;

// Topic disamakan dengan konfigurasi website
const char* TOPIC_RTC_DATA = "smartfeeding/rtc/data";
const char* TOPIC_RTC_LOG = "smartfeeding/rtc/log";
const char* TOPIC_PUMP_STATUS = "smartfeeding/pump/status";
const char* TOPIC_PUMP_COMMAND = "smartfeeding/pump/command";
const char* TOPIC_SCHEDULE = "smartfeeding/rtc/schedule";

// ================= PIN ESP32 =================
#define Pump1 19 // Relay Pump 1: Dispenser Pakan Konsentrat
#define Pump2 18 // Relay Pump 2: Pompa Air Minum Sapi
#define BT 5     // Tombol Fisik Manual (Aktif LOW)

// Relay aktif LOW: LOW = ON, HIGH = OFF
RTC_DS3231 rtc;

WiFiClient espClient;
PubSubClient mqtt(espClient);

// ================= JADWAL PAKAN =================
const int jadwalJam[]   = {6, 12, 15, 18};
const int jadwalMenit[] = {0, 0, 15, 0};
const int JUMLAH_JADWAL = 4;

bool jadwalSudahJalan[JUMLAH_JADWAL] = {
  false, false, false, false
};

int hariTerakhir = -1;
int bulanTerakhir = -1;
int tahunTerakhir = -1;

// Status perintah pompa MQTT mandiri
bool mqttPump1On = false;
bool mqttPump2On = false;
bool statusP1Sebelumnya = false;
bool statusP2Sebelumnya = false;

unsigned long waktuKirimTerakhir = 0;
const unsigned long INTERVAL_KIRIM = 1000;

// ================= WIFI =================
void koneksiWiFi() {
  Serial.print("Menghubungkan ke WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi terhubung!");
  Serial.print("IP ESP32: ");
  Serial.println(WiFi.localIP());
}

// ================= MQTT CALLBACK =================
void callback(char* topic, byte* payload, unsigned int length) {
  String pesan = "";

  for (unsigned int i = 0; i < length; i++) {
    pesan += (char)payload[i];
  }

  pesan.trim();
  pesan.toUpperCase();

  Serial.print("Pesan MQTT [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(pesan);

  if (String(topic) == TOPIC_PUMP_COMMAND) {
    // Kontrol Mandiri Pump 1 (Dispenser Pakan)
    if (pesan == "PUMP1 ON" || pesan == "PUMP1_ON" || pesan == "PUMP 1 ON") {
      mqttPump1On = true;
      Serial.println("Perintah MQTT: Pump 1 (Pakan) ON");
    }
    else if (pesan == "PUMP1 OFF" || pesan == "PUMP1_OFF" || pesan == "PUMP 1 OFF") {
      mqttPump1On = false;
      Serial.println("Perintah MQTT: Pump 1 (Pakan) OFF");
    }
    // Kontrol Mandiri Pump 2 (Pompa Air Minum)
    else if (pesan == "PUMP2 ON" || pesan == "PUMP2_ON" || pesan == "PUMP 2 ON") {
      mqttPump2On = true;
      Serial.println("Perintah MQTT: Pump 2 (Air) ON");
    }
    else if (pesan == "PUMP2 OFF" || pesan == "PUMP2_OFF" || pesan == "PUMP 2 OFF") {
      mqttPump2On = false;
      Serial.println("Perintah MQTT: Pump 2 (Air) OFF");
    }
    // Kompatibilitas kontrol bersamaan (PUMP ON / PUMP OFF)
    else if (pesan == "PUMP ON" || pesan == "PUMP_ON" || pesan == "ON") {
      mqttPump1On = true;
      mqttPump2On = true;
      Serial.println("Perintah MQTT: Semua Pompa ON");
    }
    else if (pesan == "PUMP OFF" || pesan == "PUMP_OFF" || pesan == "OFF") {
      mqttPump1On = false;
      mqttPump2On = false;
      Serial.println("Perintah MQTT: Semua Pompa OFF");
    }
  }
}

// ================= MQTT CONNECT =================
void koneksiMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Menghubungkan ke MQTT...");

    String clientId = "SmartFeeding-";
    clientId += String((uint32_t)ESP.getEfuseMac(), HEX);

    if (mqtt.connect(clientId.c_str())) {
      Serial.println("Terhubung!");

      mqtt.subscribe(TOPIC_PUMP_COMMAND);

      Serial.print("Subscribe topic: ");
      Serial.println(TOPIC_PUMP_COMMAND);

      char stMsg[32];
      snprintf(stMsg, sizeof(stMsg), "P1:%s,P2:%s", mqttPump1On ? "ON" : "OFF", mqttPump2On ? "ON" : "OFF");
      mqtt.publish(TOPIC_PUMP_STATUS, stMsg, true);
    } else {
      Serial.print("Gagal, kode: ");
      Serial.println(mqtt.state());
      delay(3000);
    }
  }
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);

  Wire.begin(21, 22);

  pinMode(Pump1, OUTPUT);
  pinMode(Pump2, OUTPUT);
  pinMode(BT, INPUT_PULLUP);

  // Relay OFF saat mulai (Aktif LOW)
  digitalWrite(Pump1, HIGH);
  digitalWrite(Pump2, HIGH);

  Serial.println();
  Serial.println("=== SMART FEEDING DUAL PUMP MQTT ===");

  if (!rtc.begin()) {
    Serial.println("RTC DS3231 tidak ditemukan!");
    while (true) {
      delay(1000);
    }
  }

  // Sinkronisasi RTC
  rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));

  Serial.println("RTC berhasil disinkronkan.");

  DateTime sekarang = rtc.now();

  hariTerakhir = sekarang.day();
  bulanTerakhir = sekarang.month();
  tahunTerakhir = sekarang.year();

  koneksiWiFi();

  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(callback);
  mqtt.setBufferSize(512);

  Serial.println("Jadwal: 06:00, 12:00, 15:15, 18:00");
  Serial.println("Pump 1: GPIO 19 | Pump 2: GPIO 18");
  Serial.println("Sistem siap.");
}

// ================= LOOP =================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    koneksiWiFi();
  }

  if (!mqtt.connected()) {
    koneksiMQTT();
  }

  mqtt.loop();

  DateTime sekarang = rtc.now();

  // Reset penanda jika tanggal berubah
  if (sekarang.day() != hariTerakhir ||
      sekarang.month() != bulanTerakhir ||
      sekarang.year() != tahunTerakhir) {

    hariTerakhir = sekarang.day();
    bulanTerakhir = sekarang.month();
    tahunTerakhir = sekarang.year();

    for (int i = 0; i < JUMLAH_JADWAL; i++) {
      jadwalSudahJalan[i] = false;
    }

    Serial.println("Tanggal berubah, jadwal direset.");
  }

  // Periksa jadwal pakan
  for (int i = 0; i < JUMLAH_JADWAL; i++) {
    if (sekarang.hour() == jadwalJam[i] &&
        sekarang.minute() == jadwalMenit[i] &&
        !jadwalSudahJalan[i]) {

      char pesanJadwal[100];

      snprintf(
        pesanJadwal,
        sizeof(pesanJadwal),
        "JADWAL_PAKAN|%02d:%02d",
        jadwalJam[i],
        jadwalMenit[i]
      );

      Serial.println(">>> JADWAL PAKAN TERDETEKSI <<<");
      Serial.println(pesanJadwal);

      mqtt.publish(TOPIC_SCHEDULE, pesanJadwal);
      mqtt.publish(TOPIC_RTC_LOG, pesanJadwal);

      jadwalSudahJalan[i] = true;
    }
  }

  // Tombol fisik BT aktif LOW (Override Manual)
  bool tombolDitekan = (digitalRead(BT) == LOW);

  // Status independen Pump 1 & Pump 2
  bool p1On = mqttPump1On || tombolDitekan;
  bool p2On = mqttPump2On || tombolDitekan;

  digitalWrite(Pump1, p1On ? LOW : HIGH);
  digitalWrite(Pump2, p2On ? LOW : HIGH);

  // Kirim data RTC dan status pompa setiap 1 detik
  if (millis() - waktuKirimTerakhir >= INTERVAL_KIRIM) {
    waktuKirimTerakhir = millis();

    char tanggal[16];
    char waktu[16];
    char payload[256];
    char logPesan[120];

    snprintf(
      tanggal, sizeof(tanggal),
      "%02d/%02d/%04d",
      sekarang.day(),
      sekarang.month(),
      sekarang.year()
    );

    snprintf(
      waktu, sizeof(waktu),
      "%02d:%02d:%02d",
      sekarang.hour(),
      sekarang.minute(),
      sekarang.second()
    );

    // Data terstruktur untuk website dengan status mandiri Pump 1 & Pump 2
    snprintf(
      payload, sizeof(payload),
      "{\"tanggal\":\"%s\",\"waktu\":\"%s\","
      "\"pump1_status\":\"%s\",\"pump2_status\":\"%s\","
      "\"pump_status\":\"%s\",\"mode\":\"mqtt\"}",
      tanggal,
      waktu,
      p1On ? "ON" : "OFF",
      p2On ? "ON" : "OFF",
      (p1On || p2On) ? "ON" : "OFF"
    );

    mqtt.publish(TOPIC_RTC_DATA, payload);

    // Log teks untuk stream terminal website
    snprintf(
      logPesan, sizeof(logPesan),
      "Tanggal: %s | Waktu: %s | P1: %s | P2: %s",
      tanggal,
      waktu,
      p1On ? "ON" : "OFF",
      p2On ? "ON" : "OFF"
    );

    mqtt.publish(TOPIC_RTC_LOG, logPesan);

    // Kirim notifikasi status jika ada perubahan
    if (p1On != statusP1Sebelumnya || p2On != statusP2Sebelumnya) {
      char stMsg[32];
      snprintf(stMsg, sizeof(stMsg), "P1:%s,P2:%s", p1On ? "ON" : "OFF", p2On ? "ON" : "OFF");
      mqtt.publish(TOPIC_PUMP_STATUS, stMsg, true);
      statusP1Sebelumnya = p1On;
      statusP2Sebelumnya = p2On;
    }
  }
}
