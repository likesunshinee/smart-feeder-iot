# Smart Feeder Station — Sistem Pakan Sapi Otomatis (ESP32 & RTC DS3231)

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
![ESP32](https://img.shields.io/badge/Hardware-ESP32%20WiFi-0284c7?logo=espressif&logoColor=white)
![MQTT](https://img.shields.io/badge/Protocol-MQTT%20EMQX-d97706?logo=mqtt&logoColor=white)
![RTC](https://img.shields.io/badge/RTC-DS3231%20Precision-16a34a)
![Tests](https://img.shields.io/badge/Tests-12%2F12%20Passed-22c55e)

Aplikasi web dashboard monitoring IoT untuk sistem pakan dan bak minum sapi otomatis berbasis mikrokontroler ESP32, modul RTC DS3231 presisi tinggi, dan komunikasi real-time **MQTT (EMQX)**. Antarmuka didesain bertema **AgriTech Modern** dengan palet warna **Cream Organik & Hijau Padang Rumput**, dilengkapi ornamen visual sapi dan palungan pakan interaktif.

---

## 🌟 Fitur Utama

Aplikasi ini terhubung langsung secara real-time ke firmware Arduino ESP32 melalui broker publik **`broker.emqx.io`**:

1. **Komunikasi Real-Time MQTT (ESP32 Live Gateway)**
   - **Sinkronisasi 2 Arah**: Website terhubung langsung ke broker MQTT via WebSocket (Port 8084/8083).
   - **Topic Data RTC (`smartfeeding/rtc/data`)**: Menerima payload JSON tanggal, waktu, dan status pompa secara live setiap 1 detik.
   - **Topic Telemetri Serial (`smartfeeding/rtc/log`)**: Menampilkan streaming log teks serial mikrokontroler di layar terminal *Pasture Night*.
   - **Topic Kontrol Pompa (`smartfeeding/pump/command`)**: Mengirim perintah `PUMP ON` atau `PUMP OFF` dari tombol website langsung ke relay ESP32.
   - **Topic Status Pompa (`smartfeeding/pump/status`)**: Menerima konfirmasi status riil relay (maupun dari tombol fisik BT pin 5).
   - **Topic Jadwal Pakan (`smartfeeding/rtc/schedule`)**: Menerima notifikasi otomatis saat jadwal pakan terpicu.

2. **Jadwal Pemberian Pakan Sapi (4 Siklus Harian)**
   - **Pakan Pagi (06:00 WIB)**: Silase & Konsentrat Pagi (3.5 kg, durasi 5s).
   - **Pakan Siang (12:00 WIB)**: Rumput Gajah Segar & Serat Kasar (5.0 kg, durasi 6s).
   - **Pakan Sore Awal (15:15 WIB)**: Hijauan & Suplemen Lapangan (2.5 kg, durasi 4s).
   - **Pakan Sore (18:00 WIB)**: Konsentrat Penguat & Mineral (3.5 kg, durasi 5s).
   - **Banner Animasi Event Pakan**: Maskot sapi animasi yang mengunyah rumput secara interaktif ketika jadwal pakan terpicu.

3. **Palungan & Bak Minum Sapi (Dual Pump Independent Control)**
   - **Pump 1 (GPIO 19 - Dispenser Pakan Silase & Konsentrat)**: Tombol `PUMP 1 ON` (hijau padang rumput) dan `PUMP 1 OFF` (abu-abu).
   - **Pump 2 (GPIO 18 - Pompa Air Minum Palungan)**: Tombol `PUMP 2 ON` (biru cyan air) dan `PUMP 2 OFF` (abu-abu).
   - **Tombol Fisik Manual (GPIO 5 - BT)**: Active LOW dengan internal pull-up untuk pengoperasian manual di kandang.
   - **Visualizer Palungan Sapi**: Ilustrasi interaktif palungan konsentrat dan bak air minum sapi dengan animasi visual terpisah:
     - Pump 1 Aktif: Animasi taburan pakan hijau ke palungan sapi.
     - Pump 2 Aktif: Animasi aliran & riak air cyan di bak minum sapi.
   - **Handshake Asinkron**: Mensimulasikan delay konfirmasi mikrokontroler (600–900 ms) dengan anti double-click saat status `PENDING`.
   - **Activity Log**: Tabel riwayat pengiriman perintah manual pada sesi pengujian beserta hasil dan latensinya.

4. **RTC Data Monitor & Serial Terminal**
   - **Tampilan Serial Monitor**: Menerima dan menampilkan data dalam format Serial Monitor:
     ```text
     09:59:53.488 -> Tanggal: 26/10/2026 | Waktu: 21:20:14
     ```
   - **Console Terminal Deep Forest**: Terminal berwarna hijau hutan gelap (*Pasture Night*) dengan teks hijau phosphor tajam beresolusi tinggi.
   - **Buffer List Ringan**: Dibatasi maksimal 100 entri log terakhir dengan fitur Auto-Scroll, Salin Baris, Salin Semua, dan Clear.

5. **IoT Simulation Test Bench (Fallback & Pengujian)**
   - Dapat beralih secara mulus antara mode **MQTT Live** (data riil ESP32) dan mode **Simulasi Virtual** (TC-01 s/d TC-12) tanpa perlu restart server.

---

## 📁 Struktur Direktori

```text
├── index.html                                    # Antarmuka dashboard IoT bertema cream & hijau
├── css/
│   └── style.css                                 # Stylesheet tema AgriTech, palungan & animasi sapi
├── js/
│   ├── parser.js                                 # Parser regex independen untuk payload string RTC
│   ├── simulation.js                             # Engine simulasi clock virtual RTC & pompa
│   ├── mqtt-client.js                            # Client MQTT WebSocket native ke broker.emqx.io
│   └── app.js                                    # Controller utama penghubung antarmuka, event, dan MQTT
├── esp32_smart_feeding_rtc/
│   └── esp32_smart_feeding_rtc.ino               # Source code Arduino ESP32 WiFi + MQTT PubSubClient
├── .gitignore                                    # Filter file sementara, build artifact, dan log
├── LICENSE                                       # Lisensi open-source (MIT License)
└── README.md                                     # Dokumentasi teknis dan panduan pengujian
```

> [!TIP]
> **Catatan Kredensial WiFi**: Sebelum mem-flash atau mengunggah repository secara publik, pastikan untuk menyesuaikan variabel `WIFI_SSID` dan `WIFI_PASSWORD` di dalam file `esp32_smart_feeding_rtc/esp32_smart_feeding_rtc.ino` sesuai dengan jaringan WiFi hotspot Anda.

---

## 🚀 Cara Menjalankan

Aplikasi ini berbasis **Vanilla HTML, CSS, dan JavaScript murni** tanpa dependensi pihak ketiga atau proses *build*.

### Opsi 1: Menjalankan dengan Local Web Server (Direkomendasikan)
Gunakan server lokal seperti Python atau Node.js:

```bash
# Menggunakan Python:
python -m http.server 8080

# Atau menggunakan Node (npx):
npx serve -l 8080
```
Buka peramban pada alamat: [http://localhost:8080](http://localhost:8080)

### Opsi 2: Membuka Langsung File HTML
Klik dua kali file `index.html` untuk langsung membukanya di browser modern apa pun (Chrome, Edge, Firefox, Safari).

---

## 🧪 Matriks Pengujian Acceptance Criteria (TC-01 s/d TC-12)

| ID | Skenario Uji | Cara Pengujian | Hasil yang Diharapkan | Status |
|---|---|---|---|---|
| **TC-01** | Dashboard tanpa data | Buka dashboard lalu klik tombol **Clear Logs** | Kartu menampilkan pesan *"Menunggu data RTC"* dan nilai `--/--/----` | ✅ Lulus |
| **TC-02** | Menerima string RTC valid | Klik **+ Valid Packet** | String tampil utuh di terminal dan kartu tanggal/waktu diperbarui | ✅ Lulus |
| **TC-03** | Menerima data berulang | Biarkan stream otomatis berjalan | Setiap data tampil sebagai baris baru berurutan (`#001`, `#002`, dst.) | ✅ Lulus |
| **TC-04** | Menerima string salah/rusak | Klik tombol **⚠ Corrupt Packet** | Ditandai `FORMAT TIDAK DIKENALI`, kartu ringkasan tidak diubah sembarangan, stream tidak macet | ✅ Lulus |
| **TC-05** | Tekan PUMP ON | Klik tombol **PUMP ON** | Menampilkan spinner `PENDING` selama ~800ms, status berubah jadi `ON` (hijau), tercatat di Activity Log | ✅ Lulus |
| **TC-06** | Tekan PUMP OFF | Klik tombol **PUMP OFF** | Menampilkan status `PENDING`, kemudian berubah jadi `OFF` (abu-abu), tercatat di Activity Log | ✅ Lulus |
| **TC-07** | Kontrol pompa gagal | Buka **Opsi Simulasi** → aktifkan toggle **Simulasi GAGAL** → klik **PUMP ON** | Status menjadi `ERROR`, pesan kegagalan ditampilkan, tercatat sebagai `Gagal (Timeout/Error)` | ✅ Lulus |
| **TC-08** | Mencegah klik berulang | Klik tombol ON berulang kali dengan cepat | Tombol dinonaktifkan (*disabled*) selama `PENDING` untuk mencegah pengiriman ganda | ✅ Lulus |
| **TC-09** | Data masuk terus-menerus | Biarkan stream berjalan > 100 paket | Penggunaan memori stabil, buffer otomatis membatasi maksimal 100 entri | ✅ Lulus |
| **TC-10** | Tampilan mobile/responsif | Ubah ukuran jendela ke lebar mobile (&lt; 768px) | Tata letak menyesuaikan menjadi 1 kolom vertikal dan tombol tetap mudah diakses | ✅ Lulus |
| **TC-11** | Status koneksi terputus | Pilih `DISCONNECTED` pada dropdown simulasi koneksi | Chip berubah menjadi merah dan berlabel `DISCONNECTED` | ✅ Lulus |
| **TC-12** | Label mode simulasi | Periksa header atas | Label `SIMULATION MODE` tampak jelas sehingga tidak dikira terhubung ke aktuator fisik | ✅ Lulus |

---

## 🔌 Rencana Integrasi Perangkat Nyata (Tahap Lanjutan)

Modul-modul kode pada aplikasi ini dirancang modular agar mudah dihubungkan ke backend IoT:

1. **WebSocket Incoming Data (`/ws/rtc`)**:
   Ganti pemanggilan generator pada `RtcSimulation.onPacket()` dengan event listener WebSocket:
   ```javascript
   const socket = new WebSocket('ws://localhost:8080/ws/rtc');
   socket.onmessage = (event) => {
     handleIncomingRawRtc(event.data);
   };
   ```

2. **REST API Pump Command (`POST /api/pump/command`)**:
   Ganti `dispatchPumpCommand` dengan request `fetch`:
   ```javascript
   async function sendHardwarePumpCommand(action) {
     const res = await fetch('/api/pump/command', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ action: action, source: 'WEB' })
     });
     return await res.json();
   }
   ```
