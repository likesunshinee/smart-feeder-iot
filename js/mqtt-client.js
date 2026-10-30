/**
 * Smart Feeder Station — MQTT over WebSocket Client
 * Kompatibel langsung dengan ESP32 + PubSubClient di broker.emqx.io
 * 
 * Topic Konfigurasi:
 * - smartfeeding/rtc/data     --> Data JSON tanggal, waktu, status pompa
 * - smartfeeding/rtc/log      --> Log string telemetri serial
 * - smartfeeding/pump/status   --> Status riil pompa (ON / OFF)
 * - smartfeeding/pump/command  --> Perintah website (PUMP ON / PUMP OFF)
 * - smartfeeding/rtc/schedule --> Notifikasi event jadwal (JADWAL_PAKAN|HH:mm)
 */

(function (window) {
  'use strict';

  const CONFIG = {
    // URL WebSocket untuk EMQX Public Broker
    // Port 8084 = WSS (Secure WebSocket, direkomendasikan untuk browser modern)
    // Port 8083 = WS (Unencrypted WebSocket)
    wssUrl: 'wss://broker.emqx.io:8084/mqtt',
    wsUrl: 'ws://broker.emqx.io:8083/mqtt',
    topics: {
      rtcData: 'smartfeeding/rtc/data',
      rtcLog: 'smartfeeding/rtc/log',
      pumpStatus: 'smartfeeding/pump/status',
      pumpCommand: 'smartfeeding/pump/command',
      schedule: 'smartfeeding/rtc/schedule'
    },
    keepAliveSeconds: 30,
    reconnectIntervalMs: 3000
  };

  let ws = null;
  let isConnected = false;
  let isConnecting = false;
  let shouldReconnect = true;
  let pingTimer = null;
  let reconnectTimer = null;
  let packetIdCounter = 1;

  // Callback listeners
  const callbacks = {
    onStatusChange: null, // (status, detail)
    onRtcData: null,      // (jsonData)
    onRtcLog: null,       // (logString)
    onPumpStatus: null,   // ('ON' | 'OFF')
    onSchedule: null      // (scheduleString)
  };

  /**
   * Helper encode string ke UTF-8 Uint8Array
   */
  function encodeUtf8(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    const arr = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 128) arr.push(c);
      else if (c < 2048) {
        arr.push(192 | (c >> 6), 128 | (c & 63));
      } else {
        arr.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
      }
    }
    return new Uint8Array(arr);
  }

  /**
   * Helper decode Uint8Array ke string UTF-8
   */
  function decodeUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(bytes);
    }
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
      s += String.fromCharCode(bytes[i]);
    }
    return s;
  }

  /**
   * Helper encode MQTT variable byte integer
   */
  function encodeRemainingLength(length) {
    const bytes = [];
    do {
      let digit = length % 128;
      length = Math.floor(length / 128);
      if (length > 0) {
        digit |= 0x80;
      }
      bytes.push(digit);
    } while (length > 0);
    return bytes;
  }

  /**
   * Buat paket MQTT 3.1.1 CONNECT
   */
  function buildConnectPacket(clientId) {
    const protoName = encodeUtf8('MQTT');
    const clientIdBytes = encodeUtf8(clientId);
    const varHeaderLen = 2 + protoName.length + 1 + 1 + 2; // name, level 4, flags 0x02 (clean), keepalive 30
    const payloadLen = 2 + clientIdBytes.length;
    const remainingLen = varHeaderLen + payloadLen;

    const lenBytes = encodeRemainingLength(remainingLen);
    const packet = new Uint8Array(1 + lenBytes.length + remainingLen);
    let p = 0;

    packet[p++] = 0x10; // CONNECT packet type
    for (let b of lenBytes) packet[p++] = b;

    // Protocol Name
    packet[p++] = 0x00;
    packet[p++] = protoName.length;
    for (let b of protoName) packet[p++] = b;

    packet[p++] = 0x04; // Protocol Level: 4 (MQTT 3.1.1)
    packet[p++] = 0x02; // Connect Flags: Clean Session

    // KeepAlive (30s)
    packet[p++] = 0x00;
    packet[p++] = CONFIG.keepAliveSeconds;

    // Client ID
    packet[p++] = (clientIdBytes.length >> 8) & 0xFF;
    packet[p++] = clientIdBytes.length & 0xFF;
    for (let b of clientIdBytes) packet[p++] = b;

    return packet;
  }

  /**
   * Buat paket MQTT SUBSCRIBE (QoS 0)
   */
  function buildSubscribePacket(topicFilter) {
    const topicBytes = encodeUtf8(topicFilter);
    const packetId = packetIdCounter++;
    const remainingLen = 2 + 2 + topicBytes.length + 1; // packetId + len + topic + QoS
    const lenBytes = encodeRemainingLength(remainingLen);

    const packet = new Uint8Array(1 + lenBytes.length + remainingLen);
    let p = 0;

    packet[p++] = 0x82; // SUBSCRIBE (QoS 1 header)
    for (let b of lenBytes) packet[p++] = b;

    // Packet ID
    packet[p++] = (packetId >> 8) & 0xFF;
    packet[p++] = packetId & 0xFF;

    // Topic
    packet[p++] = (topicBytes.length >> 8) & 0xFF;
    packet[p++] = topicBytes.length & 0xFF;
    for (let b of topicBytes) packet[p++] = b;

    packet[p++] = 0x00; // Requested QoS: 0

    return packet;
  }

  /**
   * Buat paket MQTT PUBLISH (QoS 0)
   */
  function buildPublishPacket(topic, payloadStr) {
    const topicBytes = encodeUtf8(topic);
    const payloadBytes = encodeUtf8(payloadStr);
    const remainingLen = 2 + topicBytes.length + payloadBytes.length;
    const lenBytes = encodeRemainingLength(remainingLen);

    const packet = new Uint8Array(1 + lenBytes.length + remainingLen);
    let p = 0;

    packet[p++] = 0x30; // PUBLISH QoS 0, retain 0
    for (let b of lenBytes) packet[p++] = b;

    // Topic
    packet[p++] = (topicBytes.length >> 8) & 0xFF;
    packet[p++] = topicBytes.length & 0xFF;
    for (let b of topicBytes) packet[p++] = b;

    // Payload
    for (let b of payloadBytes) packet[p++] = b;

    return packet;
  }

  /**
   * Buat paket MQTT PINGREQ
   */
  function buildPingPacket() {
    return new Uint8Array([0xC0, 0x00]);
  }

  /**
   * Parse paket MQTT masuk dari server
   */
  function handleMqttPacket(bytes) {
    if (!bytes || bytes.length === 0) return;
    const packetType = bytes[0] >> 4;

    // 0x02 = CONNACK
    if (packetType === 2) {
      const returnCode = bytes.length >= 4 ? bytes[3] : 0;
      if (returnCode === 0) {
        isConnected = true;
        isConnecting = false;
        notifyStatus('CONNECTED', 'Terhubung ke EMQX MQTT Broker (broker.emqx.io)');
        startPingTimer();
        subscribeAllTopics();
      } else {
        notifyStatus('ERROR', `Koneksi ditolak broker, kode: ${returnCode}`);
      }
      return;
    }

    // 0x03 = PUBLISH
    if (packetType === 3) {
      let offset = 1;
      let multiplier = 1;
      let remainingLength = 0;

      // Decode remaining length
      while (offset < bytes.length) {
        let b = bytes[offset++];
        remainingLength += (b & 127) * multiplier;
        multiplier *= 128;
        if ((b & 128) === 0) break;
      }

      // Topic length
      if (offset + 2 > bytes.length) return;
      const topicLen = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;

      // Topic
      if (offset + topicLen > bytes.length) return;
      const topicBytes = bytes.slice(offset, offset + topicLen);
      const topic = decodeUtf8(topicBytes);
      offset += topicLen;

      // Payload
      const payloadBytes = bytes.slice(offset);
      const payloadStr = decodeUtf8(payloadBytes).trim();

      routeMqttMessage(topic, payloadStr);
      return;
    }

    // 0x09 = SUBACK
    if (packetType === 9) {
      // Langganan sukses
      return;
    }

    // 0x0D = PINGRESP
    if (packetType === 13) {
      // Ping respons diterima, koneksi sehat
      return;
    }
  }

  /**
   * Rute pesan MQTT ke listener yang tepat
   */
  function routeMqttMessage(topic, payload) {
    console.log(`[MQTT IN] ${topic}:`, payload);

    if (topic === CONFIG.topics.rtcData) {
      try {
        const json = JSON.parse(payload);
        if (typeof callbacks.onRtcData === 'function') {
          callbacks.onRtcData(json, payload);
        }
      } catch (e) {
        // Jika format raw
        if (typeof callbacks.onRtcData === 'function') {
          callbacks.onRtcData({ raw: payload }, payload);
        }
      }
    } else if (topic === CONFIG.topics.rtcLog) {
      if (typeof callbacks.onRtcLog === 'function') {
        callbacks.onRtcLog(payload);
      }
    } else if (topic === CONFIG.topics.pumpStatus) {
      const statusUpper = payload.toUpperCase();
      if (typeof callbacks.onPumpStatus === 'function') {
        callbacks.onPumpStatus(statusUpper);
      }
    } else if (topic === CONFIG.topics.schedule) {
      if (typeof callbacks.onSchedule === 'function') {
        callbacks.onSchedule(payload);
      }
    }
  }

  function subscribeAllTopics() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(buildSubscribePacket(CONFIG.topics.rtcData));
      ws.send(buildSubscribePacket(CONFIG.topics.rtcLog));
      ws.send(buildSubscribePacket(CONFIG.topics.pumpStatus));
      ws.send(buildSubscribePacket(CONFIG.topics.schedule));
      console.log('[MQTT] Berhasil subscribe ke semua topic ESP32 smart feeding.');
    } catch (e) {
      console.error('[MQTT] Gagal mengirim subscribe:', e);
    }
  }

  function startPingTimer() {
    stopPingTimer();
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(buildPingPacket());
        } catch (e) {
          console.warn('[MQTT] Ping gagal:', e);
        }
      }
    }, CONFIG.keepAliveSeconds * 1000);
  }

  function stopPingTimer() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function notifyStatus(status, detail = '') {
    if (typeof callbacks.onStatusChange === 'function') {
      callbacks.onStatusChange(status, detail);
    }
  }

  /**
   * Hubungkan ke broker via WebSocket
   */
  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    isConnecting = true;
    notifyStatus('CONNECTING', 'Menghubungkan ke broker.emqx.io via WebSocket...');

    // Gunakan WSS secara default
    const targetUrl = (window.location && window.location.protocol === 'https:') ? CONFIG.wssUrl : CONFIG.wssUrl;

    try {
      ws = new WebSocket(targetUrl, ['mqtt', 'mqttv3.1.1']);
      ws.binaryType = 'arraybuffer';

      ws.onopen = function () {
        console.log('[MQTT WS] WebSocket terbuka. Mengirim CONNECT packet...');
        const clientId = 'WebFeeder-' + Math.random().toString(16).substring(2, 10);
        const connectPacket = buildConnectPacket(clientId);
        ws.send(connectPacket);
      };

      ws.onmessage = function (event) {
        const data = new Uint8Array(event.data);
        handleMqttPacket(data);
      };

      ws.onerror = function (err) {
        console.warn('[MQTT WS] WebSocket error:', err);
        notifyStatus('ERROR', 'Koneksi WebSocket terganggu');
      };

      ws.onclose = function () {
        console.log('[MQTT WS] WebSocket tertutup.');
        isConnected = false;
        isConnecting = false;
        stopPingTimer();
        notifyStatus('DISCONNECTED', 'Terputus dari broker.emqx.io');

        if (shouldReconnect) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            if (shouldReconnect && !isConnected) {
              connect();
            }
          }, CONFIG.reconnectIntervalMs);
        }
      };

    } catch (err) {
      console.error('[MQTT WS] Exception saat inisialisasi WebSocket:', err);
      notifyStatus('ERROR', err.message);
      isConnecting = false;
    }
  }

  function disconnect() {
    shouldReconnect = false;
    stopPingTimer();
    clearTimeout(reconnectTimer);
    if (ws) {
      try {
        ws.close();
      } catch (e) {}
      ws = null;
    }
    isConnected = false;
    isConnecting = false;
    notifyStatus('DISCONNECTED', 'Koneksi MQTT dihentikan pengguna');
  }

  /**
   * Publikasikan perintah pompa ke ESP32
   * @param {string} action 'ON' | 'OFF'
   * @param {number} pumpNum 1 | 2
   */
  function publishPumpCommand(action, pumpNum = 1) {
    if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('MQTT belum terhubung ke broker.emqx.io. Pastikan ESP32 & Website online.');
    }

    let payload;
    if (action.startsWith('PUMP')) {
      payload = action;
    } else {
      payload = `PUMP${pumpNum} ${action}`;
    }

    const packet = buildPublishPacket(CONFIG.topics.pumpCommand, payload);
    ws.send(packet);
    console.log(`[MQTT OUT] Dikirim ke ${CONFIG.topics.pumpCommand}:`, payload);
    return true;
  }

  // Export module ke window
  window.MqttClient = {
    connect: function (handlers = {}) {
      shouldReconnect = true;
      if (handlers.onStatusChange) callbacks.onStatusChange = handlers.onStatusChange;
      if (handlers.onRtcData) callbacks.onRtcData = handlers.onRtcData;
      if (handlers.onRtcLog) callbacks.onRtcLog = handlers.onRtcLog;
      if (handlers.onPumpStatus) callbacks.onPumpStatus = handlers.onPumpStatus;
      if (handlers.onSchedule) callbacks.onSchedule = handlers.onSchedule;
      connect();
    },
    disconnect: disconnect,
    publishPumpCommand: publishPumpCommand,
    isConnected: () => isConnected,
    isConnecting: () => isConnecting,
    config: CONFIG
  };

})(window);

