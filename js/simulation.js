/**
 * RTC Monitor & Manual Pump Control - Simulation Engine
 * Mengatur stream virtual data RTC, simulasi jadwal pakan ESP32, dan kontrol pompa
 */

(function (window) {
  'use strict';

  let isStreaming = true;
  let streamIntervalMs = 2000;
  let intervalTimerId = null;
  let packetCallback = null;

  // Virtual RTC Clock State
  let virtualRtcDate = new Date(); // Ikuti jam sistem saat ini layaknya compile-time sync!

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function pad3(n) {
    return String(n).padStart(3, '0');
  }

  function generateLogTimestamp() {
    const now = new Date();
    const h = pad2(now.getHours());
    const m = pad2(now.getMinutes());
    const s = pad2(now.getSeconds());
    const ms = pad3(now.getMilliseconds());
    return `${h}:${m}:${s}.${ms}`;
  }

  function formatRtcDate(dateObj) {
    const d = pad2(dateObj.getDate());
    const m = pad2(dateObj.getMonth() + 1);
    const y = dateObj.getFullYear();
    return `${d}/${m}/${y}`;
  }

  function formatRtcTime(dateObj) {
    const h = pad2(dateObj.getHours());
    const m = pad2(dateObj.getMinutes());
    const s = pad2(dateObj.getSeconds());
    return `${h}:${m}:${s}`;
  }

  /**
   * Menghasilkan string Serial Monitor valid
   */
  function createNextValidPacketString(includeLogPrefix = true) {
    virtualRtcDate.setSeconds(virtualRtcDate.getSeconds() + 1);

    const logTime = generateLogTimestamp();
    const rtcDateStr = formatRtcDate(virtualRtcDate);
    const rtcTimeStr = formatRtcTime(virtualRtcDate);

    if (includeLogPrefix) {
      return `${logTime} -> Tanggal: ${rtcDateStr} | Waktu: ${rtcTimeStr}`;
    } else {
      // Format langsung Serial.printf ESP32 tanpa Serial Monitor timestamp
      return `Tanggal: ${rtcDateStr} | Waktu: ${rtcTimeStr}`;
    }
  }

  /**
   * Koleksi variasi format data tidak valid untuk pengujian FR-08 & TC-04
   */
  const corruptPacketGenerators = [
    () => `${generateLogTimestamp()} -> Tanggal: 32/13/2026 | Waktu: 21:20:14`,
    () => `${generateLogTimestamp()} -> Tanggal: 26/10/2026 | Waktu: 25:70:99`,
    () => `${generateLogTimestamp()} -> DataCorrupt_UART_CRC_ERROR_0xDEADBEEF`,
    () => `${generateLogTimestamp()} -> Waktu: 21:20:15 [Tanggal Hilang]`,
    () => `${generateLogTimestamp()} -> Tanggal: 26/10/2026 | [Waktu Hilang]`,
    () => `SERIAL_FRAME_ERROR: Parity error on pin RX`,
    () => `   `
  ];

  function createCorruptPacketString() {
    const generator = corruptPacketGenerators[Math.floor(Math.random() * corruptPacketGenerators.length)];
    return generator();
  }

  /**
   * Mensimulasikan trigger event jadwal pakan ESP32
   * @param {string} schedule '06:00' | '12:00' | '18:00'
   */
  function triggerFeedingSimulation(schedule = '06:00') {
    if (typeof packetCallback === 'function') {
      packetCallback(`>>> WAKTU PEMBERIAN PAKAN <<<`);
      setTimeout(() => {
        if (typeof packetCallback === 'function') {
          packetCallback(`Jadwal pakan: ${schedule}`);
          packetCallback(`Status: Jadwal terdeteksi.`);
        }
      }, 250);
    }
  }

  function startStream() {
    if (intervalTimerId) clearInterval(intervalTimerId);
    isStreaming = true;

    intervalTimerId = setInterval(() => {
      if (typeof packetCallback === 'function') {
        // Bergantian antara format dengan log time dan murni serial
        const withPrefix = Math.random() > 0.3;
        const payload = createNextValidPacketString(withPrefix);
        packetCallback(payload);
      }
    }, streamIntervalMs);
  }

  function stopStream() {
    if (intervalTimerId) {
      clearInterval(intervalTimerId);
      intervalTimerId = null;
    }
    isStreaming = false;
  }

  function toggleStream() {
    if (isStreaming) {
      stopStream();
    } else {
      startStream();
    }
    return isStreaming;
  }

  function setIntervalTime(ms) {
    streamIntervalMs = Math.max(300, parseInt(ms, 10) || 2000);
    if (isStreaming) {
      startStream();
    }
  }

  function dispatchPumpCommand(action, shouldFailFlag = false) {
    const startTime = performance.now();

    return new Promise((resolve, reject) => {
      const simulatedLatency = Math.floor(Math.random() * 300) + 600;

      setTimeout(() => {
        const elapsed = Math.round(performance.now() - startTime);

        if (shouldFailFlag) {
          reject({
            success: false,
            action: action,
            status: 'ERROR',
            latencyMs: elapsed,
            message: 'Timeout: Mikrokontroler / Driver pompa tidak merespons (Simulasi Kegagalan)'
          });
        } else {
          resolve({
            success: true,
            action: action,
            status: action === 'ON' ? 'ON' : 'OFF',
            latencyMs: elapsed,
            message: `Perintah PUMP ${action} berhasil dieksekusi dan dikonfirmasi oleh sistem kontrol.`
          });
        }
      }, simulatedLatency);
    });
  }

  function onPacket(cb) {
    packetCallback = cb;
  }

  window.RtcSimulation = {
    startStream,
    stopStream,
    toggleStream,
    isStreaming: () => isStreaming,
    setIntervalTime,
    getIntervalTime: () => streamIntervalMs,
    createNextValidPacketString,
    createCorruptPacketString,
    triggerFeedingSimulation,
    dispatchPumpCommand,
    onPacket
  };

})(window);
