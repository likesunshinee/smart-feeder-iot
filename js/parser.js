/**
 * RTC Monitor & Manual Pump Control - Serial String Parser
 * Sesuai spesifikasi PRD FR-02, FR-08, dan kompatibel dengan ESP32 Smart Feeding
 *
 * Mendukung Format:
 * 1. Dengan Log Time: 09:59:53.488 -> Tanggal: 26/10/2026 | Waktu: 21:20:14
 * 2. Tanpa Log Time:  Tanggal: 26/10/2026 | Waktu: 21:20:14
 * 3. Event Jadwal:    >>> WAKTU PEMBERIAN PAKAN <<< / Jadwal pakan: 06:00
 */

(function (window) {
  'use strict';

  let packetCounter = 0;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function getFallbackTime() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  }

  /**
   * Validasi format tanggal DD/MM/YYYY
   */
  function isValidDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const parts = dateStr.trim().split('/');
    if (parts.length !== 3) return false;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    if (year < 2000 || year > 2100) return false;

    const daysInMonth = new Date(year, month, 0).getDate();
    return day <= daysInMonth;
  }

  /**
   * Validasi format waktu HH:mm:ss (24-jam)
   */
  function isValidTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return false;
    const parts = timeStr.trim().split(':');
    if (parts.length !== 3) return false;

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);

    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return false;
    if (hours < 0 || hours > 23) return false;
    if (minutes < 0 || minutes > 59) return false;
    if (seconds < 0 || seconds > 59) return false;

    return true;
  }

  /**
   * Parse serial string RTC / Smart Feeding yang masuk
   */
  function parseRtcPayload(rawString) {
    packetCounter += 1;
    const id = 'rtc-' + String(packetCounter).padStart(4, '0');
    const receivedAt = new Date().toISOString();

    if (!rawString || typeof rawString !== 'string' || rawString.trim() === '') {
      return {
        id,
        receivedAt,
        raw: rawString || '[PAYLOAD KOSONG]',
        logTime: null,
        rtcDate: null,
        rtcTime: null,
        valid: false,
        isFeedingEvent: false,
        errorReason: 'Payload kosong atau tidak berisi teks'
      };
    }

    const trimmed = rawString.trim();

    // Deteksi jika baris adalah Event Pemberian Pakan ESP32
    if (trimmed.includes('WAKTU PEMBERIAN PAKAN') || trimmed.includes('Jadwal pakan:') || trimmed.includes('Jadwal terdeteksi')) {
      const scheduleMatch = trimmed.match(/(\d{2}:\d{2})/);
      return {
        id,
        receivedAt,
        raw: rawString,
        logTime: getFallbackTime(),
        rtcDate: null,
        rtcTime: null,
        valid: true,
        isFeedingEvent: true,
        feedingSchedule: scheduleMatch ? scheduleMatch[1] : null,
        errorReason: null
      };
    }

    /**
     * Regex fleksibel:
     * - Group 1 (opsional): <log_time> ->
     * - Group 2: <rtcDate> (DD/MM/YYYY)
     * - Group 3: <rtcTime> (HH:mm:ss)
     */
    const rtcPattern = /^(?:(\d{2}:\d{2}:\d{2}(?:\.\d{1,4})?)\s*->\s*)?Tanggal:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*\|\s*Waktu:\s*(\d{2}:\d{2}:\d{2})$/i;

    const match = trimmed.match(rtcPattern);

    if (!match) {
      return {
        id,
        receivedAt,
        raw: rawString,
        logTime: null,
        rtcDate: null,
        rtcTime: null,
        valid: false,
        isFeedingEvent: false,
        errorReason: 'Format tidak dikenali (Pemisah atau susunan teks tidak sesuai)'
      };
    }

    const logTime = match[1] || getFallbackTime();
    const rtcDate = match[2];
    const rtcTime = match[3];

    // Validasi kalender & jam
    if (!isValidDate(rtcDate)) {
      return {
        id,
        receivedAt,
        raw: rawString,
        logTime,
        rtcDate: null,
        rtcTime: null,
        valid: false,
        isFeedingEvent: false,
        errorReason: `Tanggal RTC tidak valid: "${rtcDate}"`
      };
    }

    if (!isValidTime(rtcTime)) {
      return {
        id,
        receivedAt,
        raw: rawString,
        logTime,
        rtcDate,
        rtcTime,
        valid: false,
        isFeedingEvent: false,
        errorReason: `Waktu RTC tidak valid: "${rtcTime}"`
      };
    }

    return {
      id,
      receivedAt,
      raw: rawString,
      logTime,
      rtcDate,
      rtcTime,
      valid: true,
      isFeedingEvent: false,
      errorReason: null
    };
  }

  window.RtcParser = {
    parse: parseRtcPayload,
    isValidDate,
    isValidTime,
    getCounter: () => packetCounter,
    resetCounter: () => { packetCounter = 0; }
  };

})(window);
