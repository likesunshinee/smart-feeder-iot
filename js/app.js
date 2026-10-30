/**
 * RTC Monitor & Manual Pump Control - Main Application Controller
 * Updated: Smart Feeding ESP32 Schedules & Code Modal Integration
 */

(function () {
  'use strict';

  // Batas buffer log maksimal sesuai PRD FR-03 (100 entri)
  const MAX_LOG_BUFFER = 100;

  // State Aplikasi
  const state = {
    pumpStatus: 'UNKNOWN', // UNKNOWN | PENDING | ON | OFF | ERROR
    pump1Status: 'UNKNOWN',
    pump2Status: 'UNKNOWN',
    isProcessingPump: false,
    autoScroll: true,
    latestValidRtc: null,
    logEntries: [],
    activityHistory: [],
    lastActivityTime: new Date(),
    feedingSchedules: {
      '06:00': { triggered: false, lastTime: null },
      '12:00': { triggered: false, lastTime: null },
      '15:15': { triggered: false, lastTime: null },
      '18:00': { triggered: false, lastTime: null }
    }
  };

  // DOM Elements Cache
  const DOM = {
    // Header & Modes
    connectionModeBadge: document.getElementById('connectionModeBadge'),
    connectionStatusText: document.getElementById('connectionStatusText'),
    lastActivityText: document.getElementById('lastActivityText'),
    openEsp32ModalBtn: document.getElementById('openEsp32ModalBtn'),

    // MQTT Toggle
    toggleMqttBtn: document.getElementById('toggleMqttBtn'),
    mqttBtnIcon: document.getElementById('mqttBtnIcon'),
    mqttBtnText: document.getElementById('mqttBtnText'),

    // Simulation Drawer & Controls
    toggleStreamBtn: document.getElementById('toggleStreamBtn'),
    streamBtnIcon: document.getElementById('streamBtnIcon'),
    streamBtnText: document.getElementById('streamBtnText'),
    injectValidBtn: document.getElementById('injectValidBtn'),
    injectInvalidBtn: document.getElementById('injectInvalidBtn'),
    triggerFeedBtn: document.getElementById('triggerFeedBtn'),
    feedScheduleSelect: document.getElementById('feedScheduleSelect'),
    execFeedSelectBtn: document.getElementById('execFeedSelectBtn'),
    toggleSimDrawerBtn: document.getElementById('toggleSimDrawerBtn'),
    simDrawer: document.getElementById('simDrawer'),
    streamIntervalRange: document.getElementById('streamIntervalRange'),
    intervalValueLabel: document.getElementById('intervalValueLabel'),
    failControlToggle: document.getElementById('failControlToggle'),
    failToggleLabel: document.getElementById('failToggleLabel'),
    mockConnStateSelect: document.getElementById('mockConnStateSelect'),
    customPayloadInput: document.getElementById('customPayloadInput'),
    sendCustomPayloadBtn: document.getElementById('sendCustomPayloadBtn'),

    // RTC Summary Card
    rtcSummaryCard: document.getElementById('rtcSummaryCard'),
    rtcPacketStatusBadge: document.getElementById('rtcPacketStatusBadge'),
    rtcPacketStatusText: document.getElementById('rtcPacketStatusText'),
    rtcLatestDate: document.getElementById('rtcLatestDate'),
    rtcLatestTime: document.getElementById('rtcLatestTime'),
    rtcLatestLogTime: document.getElementById('rtcLatestLogTime'),
    rtcDateSub: document.getElementById('rtcDateSub'),
    rtcTimeSub: document.getElementById('rtcTimeSub'),

    // Smart Feeding Schedule (4 Jadwal)
    feedEventAlert: document.getElementById('feedEventAlert'),
    feedEventTitle: document.getElementById('feedEventTitle'),
    feedEventDesc: document.getElementById('feedEventDesc'),
    feedEventTime: document.getElementById('feedEventTime'),
    schedCard1: document.getElementById('schedCard1'),
    schedCard2: document.getElementById('schedCard2'),
    schedCard3: document.getElementById('schedCard3'),
    schedCard4: document.getElementById('schedCard4'),
    schedStatus1: document.getElementById('schedStatus1'),
    schedStatus2: document.getElementById('schedStatus2'),
    schedStatus3: document.getElementById('schedStatus3'),
    schedStatus4: document.getElementById('schedStatus4'),
    schedLast1: document.getElementById('schedLast1'),
    schedLast2: document.getElementById('schedLast2'),
    schedLast3: document.getElementById('schedLast3'),
    schedLast4: document.getElementById('schedLast4'),

    // Terminal / Stream Log
    terminalScreen: document.getElementById('terminalScreen'),
    terminalEmptyState: document.getElementById('terminalEmptyState'),
    logStreamList: document.getElementById('logStreamList'),
    logCounterBadge: document.getElementById('logCounterBadge'),
    autoScrollToggle: document.getElementById('autoScrollToggle'),
    copyAllLogsBtn: document.getElementById('copyAllLogsBtn'),
    clearLogsBtn: document.getElementById('clearLogsBtn'),

    // Pump 1 Elements (Dispenser Pakan Sapi - GPIO 19)
    pump1StatusBox: document.getElementById('pump1StatusBox'),
    pump1VisualRing: document.getElementById('pump1VisualRing'),
    pump1StatusBadge: document.getElementById('pump1StatusBadge'),
    pump1StatusText: document.getElementById('pump1StatusText'),
    pump1StatusDesc: document.getElementById('pump1StatusDesc'),
    pump1OnBtn: document.getElementById('pump1OnBtn'),
    pump1OffBtn: document.getElementById('pump1OffBtn'),

    // Pump 2 Elements (Pompa Air Minum Sapi - GPIO 18)
    pump2StatusBox: document.getElementById('pump2StatusBox'),
    pump2VisualRing: document.getElementById('pump2VisualRing'),
    pump2StatusBadge: document.getElementById('pump2StatusBadge'),
    pump2StatusText: document.getElementById('pump2StatusText'),
    pump2StatusDesc: document.getElementById('pump2StatusDesc'),
    pump2OnBtn: document.getElementById('pump2OnBtn'),
    pump2OffBtn: document.getElementById('pump2OffBtn'),

    // Legacy / Master References
    pumpStatusBox: document.getElementById('pumpStatusBox'),
    pumpStatusBadge: document.getElementById('pumpStatusBadge'),
    pumpStatusText: document.getElementById('pumpStatusText'),
    pumpStatusDesc: document.getElementById('pumpStatusDesc'),
    commandFeedbackBox: document.getElementById('commandFeedbackBox'),
    feedbackIcon: document.getElementById('feedbackIcon'),
    feedbackText: document.getElementById('feedbackText'),
    pumpOnBtn: document.getElementById('pumpOnBtn'),
    pumpOffBtn: document.getElementById('pumpOffBtn'),

    // Activity Log
    activityTable: document.getElementById('activityTable'),
    activityTableBody: document.getElementById('activityTableBody'),
    activityEmptyRow: document.getElementById('activityEmptyRow'),
    clearActivityBtn: document.getElementById('clearActivityBtn'),

    // ESP32 Modal
    esp32ModalBackdrop: document.getElementById('esp32ModalBackdrop'),
    closeEsp32ModalBtn: document.getElementById('closeEsp32ModalBtn'),
    closeEsp32ModalFooterBtn: document.getElementById('closeEsp32ModalFooterBtn'),
    copyEsp32CodeBtn: document.getElementById('copyEsp32CodeBtn'),
    esp32CodeContent: document.getElementById('esp32CodeContent'),

    // Toast Container
    toastContainer: document.getElementById('toastContainer')
  };

  let feedAlertTimeoutId = null;

  function getLocalTimeStr() {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function touchActivity() {
    state.lastActivityTime = new Date();
    DOM.lastActivityText.textContent = `Aktivitas: ${getLocalTimeStr()}`;
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    DOM.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(15px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  async function copyToClipboard(text, successMsg = 'Teks disalin ke clipboard!') {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      showToast(successMsg, 'success');
    } catch (err) {
      showToast('Gagal menyalin teks', 'error');
    }
  }

  // ==========================================================================
  // INCOMING SERIAL / RTC DATA HANDLER
  // ==========================================================================

  function handleIncomingRawRtc(rawString) {
    touchActivity();

    // 1. Parsing payload string
    const parsed = window.RtcParser.parse(rawString);

    // 2. Simpan di log buffer
    state.logEntries.push(parsed);
    if (state.logEntries.length > MAX_LOG_BUFFER) {
      state.logEntries.shift();
    }

    // 3. Render ke terminal
    renderSingleLogRow(parsed, state.logEntries.length);
    updateLogCounter();

    // 4. Deteksi Event Pemberian Pakan ESP32
    if (parsed.isFeedingEvent) {
      handleFeedingEventTrigger(parsed);
      return;
    }

    // 5. Update ringkasan RTC jika format tanggal & waktu valid
    if (parsed.valid && parsed.rtcDate && parsed.rtcTime) {
      updateLatestRtcDisplay(parsed);
      checkScheduleAgainstCurrentTime(parsed.rtcTime);
    }
  }

  /**
   * Cek apakah jam RTC saat ini cocok dengan jadwal 06:00, 12:00, 15:15, atau 18:00
   */
  function checkScheduleAgainstCurrentTime(rtcTimeStr) {
    if (!rtcTimeStr) return;
    const [hh, mm] = rtcTimeStr.split(':');
    const curHm = `${hh}:${mm}`;

    if (['06:00', '12:00', '15:15', '18:00'].includes(curHm)) {
      if (state.feedingSchedules[curHm] && !state.feedingSchedules[curHm].triggered) {
        handleFeedingEventTrigger({
          raw: `Jadwal pakan: ${curHm}`,
          feedingSchedule: curHm
        });
      }
    }
  }

  /**
   * Menangani tampilan ketika jadwal pakan terpicu
   */
  function handleFeedingEventTrigger(parsed) {
    const timeStr = getLocalTimeStr();
    let schedTarget = parsed.feedingSchedule;

    // Default jika tidak spesifik
    if (!schedTarget) {
      const hour = new Date().getHours();
      if (hour < 10) schedTarget = '06:00';
      else if (hour < 14) schedTarget = '12:00';
      else if (hour < 16) schedTarget = '15:15';
      else schedTarget = '18:00';
    }

    // Tampilkan banner notifikasi live
    DOM.feedEventAlert.classList.remove('hidden');
    DOM.feedEventTitle.textContent = `WAKTU PEMBERIAN PAKAN SAPI (${schedTarget} WIB) TERDETEKSI!`;
    DOM.feedEventDesc.textContent = `Sistem mendeteksi jadwal pakan sapi aktif. Takaran konsentrat palungan dialirkan oleh ESP32.`;
    DOM.feedEventTime.textContent = timeStr;

    showToast(`Jadwal pakan sapi ${schedTarget} WIB terdeteksi! 🌾🐄`, 'info');

    // Update status kartu jadwal terkait
    updateScheduleCardUI(schedTarget, timeStr);

    // Auto-hide alert banner setelah 7 detik
    if (feedAlertTimeoutId) clearTimeout(feedAlertTimeoutId);
    feedAlertTimeoutId = setTimeout(() => {
      DOM.feedEventAlert.classList.add('hidden');
    }, 7000);
  }

  function updateScheduleCardUI(scheduleTime, timeStr) {
    if (state.feedingSchedules[scheduleTime]) {
      state.feedingSchedules[scheduleTime].triggered = true;
      state.feedingSchedules[scheduleTime].lastTime = timeStr;
    }

    let card, badge, lastLabel;
    if (scheduleTime === '06:00') {
      card = DOM.schedCard1;
      badge = DOM.schedStatus1;
      lastLabel = DOM.schedLast1;
    } else if (scheduleTime === '12:00') {
      card = DOM.schedCard2;
      badge = DOM.schedStatus2;
      lastLabel = DOM.schedLast2;
    } else if (scheduleTime === '15:15') {
      card = DOM.schedCard3;
      badge = DOM.schedStatus3;
      lastLabel = DOM.schedLast3;
    } else if (scheduleTime === '18:00') {
      card = DOM.schedCard4;
      badge = DOM.schedStatus4;
      lastLabel = DOM.schedLast4;
    }

    if (card && badge && lastLabel) {
      card.classList.add('active-highlight');
      badge.className = 'sched-status status-triggered';
      badge.textContent = 'TERDETEKSI';
      lastLabel.textContent = `Dijalankan: ${timeStr} WIB`;

      setTimeout(() => {
        card.classList.remove('active-highlight');
      }, 4000);
    }
  }

  /**
   * Update tampilan kartu ringkasan RTC
   */
  function updateLatestRtcDisplay(parsed) {
    state.latestValidRtc = parsed;

    DOM.rtcLatestDate.textContent = parsed.rtcDate;
    DOM.rtcLatestTime.textContent = parsed.rtcTime;
    DOM.rtcLatestLogTime.textContent = parsed.logTime;

    DOM.rtcDateSub.textContent = `Sinkronisasi diterima`;
    DOM.rtcTimeSub.textContent = `WIB (UTC+7)`;

    DOM.rtcPacketStatusBadge.className = 'packet-status-badge status-received';
    DOM.rtcPacketStatusText.textContent = 'Data diterima';

    DOM.rtcSummaryCard.classList.remove('pulse-highlight');
    void DOM.rtcSummaryCard.offsetWidth;
    DOM.rtcSummaryCard.classList.add('pulse-highlight');
  }

  function resetRtcSummaryToWaiting() {
    state.latestValidRtc = null;
    DOM.rtcLatestDate.textContent = '--/--/----';
    DOM.rtcLatestTime.textContent = '--:--:--';
    DOM.rtcLatestLogTime.textContent = '--:--:--.---';
    DOM.rtcDateSub.textContent = 'Belum ada sinkronisasi';
    DOM.rtcTimeSub.textContent = 'Menunggu data RTC';

    DOM.rtcPacketStatusBadge.className = 'packet-status-badge status-waiting';
    DOM.rtcPacketStatusText.textContent = 'Menunggu data RTC';
  }

  /**
   * Render satu baris log ke terminal screen
   */
  function renderSingleLogRow(parsed, index) {
    DOM.terminalEmptyState.style.display = 'none';

    const li = document.createElement('li');
    let extraClass = '';
    if (parsed.isFeedingEvent) {
      extraClass = 'feeding-event-row';
    } else if (parsed.valid) {
      extraClass = 'valid-format';
    } else {
      extraClass = 'invalid-format';
    }

    li.className = `log-row new-entry ${extraClass}`;

    const indexSpan = document.createElement('span');
    indexSpan.className = 'log-index';
    indexSpan.textContent = `#${String(index).padStart(3, '0')}`;

    const textWrap = document.createElement('div');
    textWrap.className = 'log-text-wrap';

    const rawSpan = document.createElement('span');
    rawSpan.className = 'log-raw-text';
    rawSpan.textContent = parsed.raw;
    textWrap.appendChild(rawSpan);

    const tag = document.createElement('span');
    if (parsed.isFeedingEvent) {
      tag.className = 'log-badge-tag tag-feed';
      tag.textContent = 'EVENT JADWAL';
    } else if (parsed.valid) {
      tag.className = 'log-badge-tag tag-valid';
      tag.textContent = 'VALID';
    } else {
      tag.className = 'log-badge-tag tag-invalid';
      tag.textContent = `FORMAT TIDAK DIKENALI (${parsed.errorReason})`;
    }
    textWrap.appendChild(tag);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'copy-row-btn';
    copyBtn.title = 'Salin baris ini';
    copyBtn.textContent = 'Salin';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(parsed.raw, 'String baris disalin.');
    });

    li.appendChild(indexSpan);
    li.appendChild(textWrap);
    li.appendChild(copyBtn);

    DOM.logStreamList.appendChild(li);

    while (DOM.logStreamList.children.length > MAX_LOG_BUFFER) {
      DOM.logStreamList.removeChild(DOM.logStreamList.firstElementChild);
    }

    if (state.autoScroll) {
      DOM.terminalScreen.scrollTop = DOM.terminalScreen.scrollHeight;
    }
  }

  function updateLogCounter() {
    DOM.logCounterBadge.textContent = `${state.logEntries.length} entri`;
  }

  function clearAllLogs() {
    state.logEntries = [];
    DOM.logStreamList.innerHTML = '';
    DOM.terminalEmptyState.style.display = 'flex';
    updateLogCounter();
    resetRtcSummaryToWaiting();
    showToast('Seluruh log terminal telah dibersihkan', 'info');
  }

  // ==========================================================================
  // MANUAL PUMP CONTROL & STATUS (PUMP 1 & PUMP 2)
  // ==========================================================================

  function setSinglePumpVisualStatus(pumpNum, status, explanation = '') {
    const isP1 = pumpNum === 1;
    if (isP1) {
      state.pump1Status = status;
    } else {
      state.pump2Status = status;
    }

    const box = isP1 ? DOM.pump1StatusBox : DOM.pump2StatusBox;
    const textEl = isP1 ? DOM.pump1StatusText : DOM.pump2StatusText;
    const descEl = isP1 ? DOM.pump1StatusDesc : DOM.pump2StatusDesc;

    if (box) {
      box.classList.remove('status-unknown', 'status-on', 'status-off', 'status-pending', 'status-error');
      box.classList.add(`status-${status.toLowerCase()}`);
    }
    if (textEl) textEl.textContent = status;

    const defaultExplanations = isP1 ? {
      UNKNOWN: 'Motor dispenser pakan konsentrat (GPIO 19) belum aktif.',
      ON: 'Dispenser pakan konsentrat AKTIF (Memutar takaran pakan sapi).',
      OFF: 'Dispenser pakan konsentrat STANDBY / MATI.',
      PENDING: 'Mengirimkan perintah ke motor pakan konsentrat (GPIO 19)...',
      ERROR: 'Gangguan transmisi kontrol motor pakan konsentrat.'
    } : {
      UNKNOWN: 'Pompa sirkulasi air minum sapi (GPIO 18) belum aktif.',
      ON: 'Pompa air minum palungan AKTIF (Mengalirkan air minum segar).',
      OFF: 'Pompa air minum palungan STANDBY / MATI.',
      PENDING: 'Mengirimkan perintah ke pompa air minum (GPIO 18)...',
      ERROR: 'Gangguan transmisi kontrol pompa air minum.'
    };

    if (descEl) descEl.textContent = explanation || defaultExplanations[status] || '';

    // Update Cattle Trough Animation
    const troughBox = document.querySelector('.cattle-trough-box');
    const troughBadge = document.querySelector('.trough-badge');
    const p1Active = state.pump1Status === 'ON';
    const p2Active = state.pump2Status === 'ON';

    if (troughBox) {
      troughBox.classList.toggle('status-p1-on', p1Active);
      troughBox.classList.toggle('status-p2-on', p2Active);
      troughBox.classList.toggle('status-on', p1Active || p2Active);
    }
    if (troughBadge) {
      if (p1Active && p2Active) {
        troughBadge.textContent = 'Pakan & Air Aktif 🌾💧';
      } else if (p1Active) {
        troughBadge.textContent = 'Dispenser Pakan Aktif 🌾';
      } else if (p2Active) {
        troughBadge.textContent = 'Aliran Air Minum Aktif 💧';
      } else {
        troughBadge.textContent = 'Standby / Palungan Siap 🐄';
      }
    }

    // Update master legacy status box jika ada
    if (DOM.pumpStatusBox && DOM.pumpStatusText) {
      const masterStatus = (p1Active || p2Active) ? 'ON' :
                           (state.pump1Status === 'PENDING' || state.pump2Status === 'PENDING') ? 'PENDING' :
                           (state.pump1Status === 'ERROR' || state.pump2Status === 'ERROR') ? 'ERROR' :
                           (state.pump1Status === 'OFF' && state.pump2Status === 'OFF') ? 'OFF' : 'UNKNOWN';
      state.pumpStatus = masterStatus;
      DOM.pumpStatusBox.classList.remove('status-unknown', 'status-on', 'status-off', 'status-pending', 'status-error');
      DOM.pumpStatusBox.classList.add(`status-${masterStatus.toLowerCase()}`);
      DOM.pumpStatusText.textContent = masterStatus;
      if (DOM.pumpStatusDesc) DOM.pumpStatusDesc.textContent = isP1 ? descEl.textContent : explanation;
    }
  }

  function setPumpVisualStatus(status, explanation = '') {
    setSinglePumpVisualStatus(1, status, explanation);
    setSinglePumpVisualStatus(2, status, explanation);
  }

  function setCommandFeedback(type, text) {
    DOM.commandFeedbackBox.className = `command-feedback ${type}`;
    const icons = {
      idle: '●',
      pending: '◌',
      success: '✓',
      error: '✕'
    };
    DOM.feedbackIcon.textContent = icons[type] || '●';
    DOM.feedbackText.textContent = text;
  }

  async function executePumpCommand(arg1, arg2) {
    let pumpNum = 1;
    let action = 'ON';

    if (typeof arg1 === 'number') {
      pumpNum = arg1;
      action = arg2 || 'ON';
    } else if (typeof arg1 === 'string') {
      action = arg1;
      pumpNum = 1;
    }

    if (state.isProcessingPump) {
      showToast('Perintah kontrol sedang diproses, harap tunggu...', 'info');
      return;
    }

    touchActivity();
    state.isProcessingPump = true;

    const pumpName = pumpNum === 1 ? 'PUMP 1 (Pakan)' : 'PUMP 2 (Air Minum)';
    const onBtn = pumpNum === 1 ? DOM.pump1OnBtn : DOM.pump2OnBtn;
    const offBtn = pumpNum === 1 ? DOM.pump1OffBtn : DOM.pump2OffBtn;
    const targetBtn = action === 'ON' ? onBtn : offBtn;

    if (onBtn) onBtn.disabled = true;
    if (offBtn) offBtn.disabled = true;
    if (DOM.pumpOnBtn) DOM.pumpOnBtn.disabled = true;
    if (DOM.pumpOffBtn) DOM.pumpOffBtn.disabled = true;
    if (targetBtn) targetBtn.classList.add('is-loading');

    const isMqttLive = window.MqttClient && window.MqttClient.isConnected();
    const destination = isMqttLive ? 'ESP32 via MQTT (broker.emqx.io)' : 'pengendali virtual';

    setSinglePumpVisualStatus(pumpNum, 'PENDING', `Mengirim perintah ${pumpName} ${action} ke ${destination}...`);
    setCommandFeedback('pending', `Mengirimkan sinyal perintah ${pumpName} ${action}. Menunggu konfirmasi ESP32...`);

    const actionTimeStr = getLocalTimeStr();

    // Jika MQTT terhubung ke ESP32, kirim langsung via MQTT
    if (isMqttLive) {
      try {
        const startTime = Date.now();
        window.MqttClient.publishPumpCommand(action, pumpNum);

        // Berikan jeda konfirmasi respons handshake
        await new Promise(resolve => setTimeout(resolve, 600));
        const latency = Date.now() - startTime;

        setSinglePumpVisualStatus(pumpNum, action);
        setCommandFeedback('success', `Berhasil: Perintah ${pumpName} ${action} terkirim via MQTT broker.emqx.io (${latency}ms).`);
        showToast(`Perintah ${pumpName} ${action} terkirim ke ESP32! 🐄⚡`, 'success');

        recordActivityEntry({
          time: actionTimeStr,
          command: `${pumpName} ${action}`,
          result: 'Berhasil (MQTT)',
          isSuccess: true,
          latency: `${latency}ms`
        });
      } catch (err) {
        setSinglePumpVisualStatus(pumpNum, 'ERROR', err.message);
        setCommandFeedback('error', `Gagal: ${err.message}`);
        showToast(`Gagal mengirim ${pumpName} ${action}: ${err.message}`, 'error');

        recordActivityEntry({
          time: actionTimeStr,
          command: `${pumpName} ${action}`,
          result: 'Gagal (MQTT)',
          isSuccess: false,
          latency: '--'
        });
      } finally {
        state.isProcessingPump = false;
        if (onBtn) onBtn.disabled = false;
        if (offBtn) offBtn.disabled = false;
        if (DOM.pumpOnBtn) DOM.pumpOnBtn.disabled = false;
        if (DOM.pumpOffBtn) DOM.pumpOffBtn.disabled = false;
        if (targetBtn) targetBtn.classList.remove('is-loading');
      }
      return;
    }

    // Fallback: Mode Simulasi Virtual jika ESP32 offline
    const shouldFail = DOM.failControlToggle.checked;

    try {
      const response = await window.RtcSimulation.dispatchPumpCommand(action, shouldFail);

      setSinglePumpVisualStatus(pumpNum, response.status);
      setCommandFeedback('success', `Berhasil: ${pumpName} sekarang dalam status ${response.status}. (Latensi: ${response.latencyMs}ms)`);
      showToast(`${pumpName} ${action} berhasil dikonfirmasi! 🐄💧`, 'success');

      recordActivityEntry({
        time: actionTimeStr,
        command: `${pumpName} ${action}`,
        result: 'Berhasil (Simulasi)',
        isSuccess: true,
        latency: `${response.latencyMs}ms`
      });

    } catch (err) {
      setSinglePumpVisualStatus(pumpNum, 'ERROR', err.message);
      setCommandFeedback('error', `Gagal: ${err.message}`);
      showToast(`Gagal mengeksekusi ${pumpName} ${action}!`, 'error');

      recordActivityEntry({
        time: actionTimeStr,
        command: `${pumpName} ${action}`,
        result: 'Gagal (Timeout/Error)',
        isSuccess: false,
        latency: `${err.latencyMs || '--'}ms`
      });

    } finally {
      state.isProcessingPump = false;
      if (onBtn) onBtn.disabled = false;
      if (offBtn) offBtn.disabled = false;
      if (DOM.pumpOnBtn) DOM.pumpOnBtn.disabled = false;
      if (DOM.pumpOffBtn) DOM.pumpOffBtn.disabled = false;
      if (targetBtn) targetBtn.classList.remove('is-loading');
    }
  }

  function recordActivityEntry({ time, command, result, isSuccess, latency }) {
    state.activityHistory.unshift({ time, command, result, isSuccess, latency });

    if (DOM.activityEmptyRow) {
      DOM.activityEmptyRow.style.display = 'none';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="font-mono">${time}</td>
      <td><strong>${command}</strong></td>
      <td>
        <span class="badge-result ${isSuccess ? 'result-success' : 'result-error'}">
          ${result}
        </span>
      </td>
      <td class="font-mono text-muted">${latency}</td>
    `;

    DOM.activityTableBody.insertBefore(tr, DOM.activityTableBody.firstChild);
  }

  function clearActivityHistory() {
    state.activityHistory = [];
    DOM.activityTableBody.innerHTML = `
      <tr class="activity-empty-row" id="activityEmptyRow">
        <td colspan="4" class="text-center text-muted">
          Belum ada perintah kontrol yang dikirim pada sesi ini.
        </td>
      </tr>
    `;
    showToast('Riwayat aktivitas telah dibersihkan', 'info');
  }

  // ==========================================================================
  // EVENT BINDINGS
  // ==========================================================================

  function setupEvents() {
    // 1. Play / Pause Stream
    DOM.toggleStreamBtn.addEventListener('click', () => {
      const active = window.RtcSimulation.toggleStream();
      DOM.streamBtnIcon.textContent = active ? '⏸' : '▶';
      DOM.streamBtnText.textContent = active ? 'Pause Stream' : 'Resume Stream';
      showToast(active ? 'Stream simulasi RTC dilanjutkan' : 'Stream simulasi RTC dijeda', 'info');
    });

    // 2. Inject 1 Valid Packet
    DOM.injectValidBtn.addEventListener('click', () => {
      const packet = window.RtcSimulation.createNextValidPacketString();
      handleIncomingRawRtc(packet);
    });

    // 3. Trigger Feeding Button
    DOM.triggerFeedBtn.addEventListener('click', () => {
      window.RtcSimulation.triggerFeedingSimulation('06:00');
    });

    DOM.execFeedSelectBtn.addEventListener('click', () => {
      const targetTime = DOM.feedScheduleSelect.value;
      window.RtcSimulation.triggerFeedingSimulation(targetTime);
    });

    // 4. Inject 1 Corrupt Packet
    DOM.injectInvalidBtn.addEventListener('click', () => {
      const corruptPacket = window.RtcSimulation.createCorruptPacketString();
      handleIncomingRawRtc(corruptPacket);
      showToast('Paket rusak diinjeksikan untuk uji parsing format salah', 'info');
    });

    // 5. Toggle Drawer
    DOM.toggleSimDrawerBtn.addEventListener('click', () => {
      const isCollapsed = DOM.simDrawer.classList.contains('collapsed');
      if (isCollapsed) {
        DOM.simDrawer.classList.remove('collapsed');
        DOM.toggleSimDrawerBtn.setAttribute('aria-expanded', 'true');
      } else {
        DOM.simDrawer.classList.add('collapsed');
        DOM.toggleSimDrawerBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // 6. Interval Range Slider
    DOM.streamIntervalRange.addEventListener('input', (e) => {
      const val = e.target.value;
      DOM.intervalValueLabel.textContent = `${(val / 1000).toFixed(1)}s`;
      window.RtcSimulation.setIntervalTime(val);
    });

    // 7. Fail Control Toggle
    DOM.failControlToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        DOM.failToggleLabel.textContent = 'Simulasi GAGAL (Timeout / NACK)';
        DOM.failToggleLabel.style.color = 'var(--color-rose)';
      } else {
        DOM.failToggleLabel.textContent = 'Respons Normal (Berhasil)';
        DOM.failToggleLabel.style.color = 'var(--text-light)';
      }
    });

    // 8. Mock Connection Selector
    DOM.mockConnStateSelect.addEventListener('change', (e) => {
      const mode = e.target.value;
      DOM.connectionModeBadge.className = 'status-chip';

      switch (mode) {
        case 'CONNECTED':
          DOM.connectionModeBadge.classList.add('chip-simulation', 'connected');
          DOM.connectionStatusText.textContent = 'CONNECTED (ESP32)';
          break;
        case 'DISCONNECTED':
          DOM.connectionModeBadge.classList.add('chip-simulation', 'disconnected');
          DOM.connectionStatusText.textContent = 'DISCONNECTED';
          break;
        case 'CONNECTING':
          DOM.connectionModeBadge.classList.add('chip-simulation', 'connecting');
          DOM.connectionStatusText.textContent = 'CONNECTING...';
          break;
        default:
          DOM.connectionModeBadge.classList.add('chip-simulation');
          DOM.connectionStatusText.textContent = 'SIMULATION MODE';
          break;
      }
      showToast(`Mode koneksi diubah: ${DOM.connectionStatusText.textContent}`, 'info');
    });

    // 9. Custom Serial Injector
    DOM.sendCustomPayloadBtn.addEventListener('click', () => {
      const customText = DOM.customPayloadInput.value;
      if (!customText || customText.trim() === '') {
        showToast('Masukkan string serial kustom terlebih dahulu', 'error');
        return;
      }
      handleIncomingRawRtc(customText);
      DOM.customPayloadInput.value = '';
    });

    DOM.customPayloadInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        DOM.sendCustomPayloadBtn.click();
      }
    });

    // 10. Auto Scroll Toggle
    DOM.autoScrollToggle.addEventListener('change', (e) => {
      state.autoScroll = e.target.checked;
    });

    // 11. Copy All Logs
    DOM.copyAllLogsBtn.addEventListener('click', () => {
      if (state.logEntries.length === 0) {
        showToast('Belum ada log yang dapat disalin', 'info');
        return;
      }
      const allText = state.logEntries.map(e => e.raw).join('\n');
      copyToClipboard(allText, `Berhasil menyalin ${state.logEntries.length} baris log ke clipboard!`);
    });

    // 12. Clear Logs
    DOM.clearLogsBtn.addEventListener('click', clearAllLogs);

    // 13. Pump 1 & Pump 2 Buttons
    if (DOM.pump1OnBtn) DOM.pump1OnBtn.addEventListener('click', () => executePumpCommand(1, 'ON'));
    if (DOM.pump1OffBtn) DOM.pump1OffBtn.addEventListener('click', () => executePumpCommand(1, 'OFF'));
    if (DOM.pump2OnBtn) DOM.pump2OnBtn.addEventListener('click', () => executePumpCommand(2, 'ON'));
    if (DOM.pump2OffBtn) DOM.pump2OffBtn.addEventListener('click', () => executePumpCommand(2, 'OFF'));

    // Legacy Pump Buttons (alias to Pump 1)
    if (DOM.pumpOnBtn && DOM.pumpOnBtn !== DOM.pump1OnBtn) {
      DOM.pumpOnBtn.addEventListener('click', () => executePumpCommand(1, 'ON'));
    }
    if (DOM.pumpOffBtn && DOM.pumpOffBtn !== DOM.pump1OffBtn) {
      DOM.pumpOffBtn.addEventListener('click', () => executePumpCommand(1, 'OFF'));
    }

    // 14. Clear Activity
    DOM.clearActivityBtn.addEventListener('click', clearActivityHistory);

    // 15. ESP32 Modal Open / Close
    function openModal() {
      DOM.esp32ModalBackdrop.classList.add('is-open');
      DOM.esp32ModalBackdrop.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
      DOM.esp32ModalBackdrop.classList.remove('is-open');
      DOM.esp32ModalBackdrop.setAttribute('aria-hidden', 'true');
    }

    DOM.openEsp32ModalBtn.addEventListener('click', openModal);
    DOM.closeEsp32ModalBtn.addEventListener('click', closeModal);
    DOM.closeEsp32ModalFooterBtn.addEventListener('click', closeModal);

    DOM.esp32ModalBackdrop.addEventListener('click', (e) => {
      if (e.target === DOM.esp32ModalBackdrop) {
        closeModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && DOM.esp32ModalBackdrop.classList.contains('is-open')) {
        closeModal();
      }
    });

    // Copy Code Button
    DOM.copyEsp32CodeBtn.addEventListener('click', () => {
      const codeText = DOM.esp32CodeContent.textContent;
      copyToClipboard(codeText, 'Kode ESP32 Arduino (.ino) disalin ke clipboard!');
    });

    // 16. MQTT Reconnect / Toggle Button
    if (DOM.toggleMqttBtn) {
      DOM.toggleMqttBtn.addEventListener('click', () => {
        if (window.MqttClient && window.MqttClient.isConnected()) {
          window.MqttClient.disconnect();
          showToast('Koneksi MQTT diputus manual. Kembali ke simulasi.', 'info');
        } else {
          initMqttIntegration();
        }
      });
    }
  }

  // ==========================================================================
  // MQTT CLIENT INTEGRATION
  // ==========================================================================

  function initMqttIntegration() {
    if (!window.MqttClient) return;

    window.MqttClient.connect({
      onStatusChange: (status, detail) => {
        console.log('[APP MQTT Status]', status, detail);
        if (status === 'CONNECTED') {
          DOM.connectionModeBadge.className = 'status-chip chip-simulation connected';
          DOM.connectionStatusText.textContent = 'MQTT LIVE (ESP32)';
          if (DOM.mqttBtnText) DOM.mqttBtnText.textContent = 'MQTT Terhubung';
          if (DOM.mqttBtnIcon) DOM.mqttBtnIcon.textContent = '🟢';
          showToast('Koneksi MQTT ke broker.emqx.io aktif! Menunggu data ESP32...', 'success');

          // Jeda sementara simulasi lokal agar data riil ESP32 yang ditampilkan
          if (window.RtcSimulation && typeof window.RtcSimulation.pauseStream === 'function') {
            window.RtcSimulation.pauseStream();
            DOM.streamBtnText.textContent = 'Lanjutkan Stream';
            DOM.streamBtnIcon.textContent = '▶';
          }
        } else if (status === 'CONNECTING') {
          DOM.connectionModeBadge.className = 'status-chip chip-simulation';
          DOM.connectionStatusText.textContent = 'CONNECTING MQTT...';
          if (DOM.mqttBtnText) DOM.mqttBtnText.textContent = 'Menghubungkan...';
          if (DOM.mqttBtnIcon) DOM.mqttBtnIcon.textContent = '⏳';
        } else if (status === 'DISCONNECTED') {
          DOM.connectionModeBadge.className = 'status-chip chip-simulation disconnected';
          DOM.connectionStatusText.textContent = 'SIMULATION MODE';
          if (DOM.mqttBtnText) DOM.mqttBtnText.textContent = 'Hubungkan MQTT';
          if (DOM.mqttBtnIcon) DOM.mqttBtnIcon.textContent = '📡';
        }
      },
      onRtcData: (data) => {
        touchActivity();
        if (data.tanggal && data.waktu) {
          updateLatestRtcDisplay({
            rtcDate: data.tanggal,
            rtcTime: data.waktu,
            logTime: getLocalTimeStr() + '.000',
            valid: true
          });
          checkScheduleAgainstCurrentTime(data.waktu);
        }
        if (data.pump1_status) {
          setSinglePumpVisualStatus(1, data.pump1_status.toUpperCase());
        }
        if (data.pump2_status) {
          setSinglePumpVisualStatus(2, data.pump2_status.toUpperCase());
        }
        if (data.pump_status && !data.pump1_status) {
          setPumpVisualStatus(data.pump_status.toUpperCase());
        }
      },
      onRtcLog: (logText) => {
        touchActivity();
        const parsed = window.RtcParser.parse(logText);
        state.logEntries.push(parsed);
        renderSingleLogRow(parsed, state.logEntries.length);
        updateLogCounter();
      },
      onPumpStatus: (status) => {
        touchActivity();
        const upper = status.toUpperCase();
        if (upper.includes('P1:') || upper.includes('P2:')) {
          const parts = upper.split(',');
          for (let part of parts) {
            const [p, s] = part.split(':');
            if (p && s && p.trim() === 'P1') setSinglePumpVisualStatus(1, s.trim());
            if (p && s && p.trim() === 'P2') setSinglePumpVisualStatus(2, s.trim());
          }
        } else if (upper.startsWith('PUMP1') || upper.startsWith('P1')) {
          const st = upper.includes('ON') ? 'ON' : 'OFF';
          setSinglePumpVisualStatus(1, st);
        } else if (upper.startsWith('PUMP2') || upper.startsWith('P2')) {
          const st = upper.includes('ON') ? 'ON' : 'OFF';
          setSinglePumpVisualStatus(2, st);
        } else {
          setPumpVisualStatus(upper);
        }
        setCommandFeedback('success', `ESP32 mengonfirmasi status pompa: ${status}`);
        recordActivityEntry({
          time: getLocalTimeStr(),
          command: 'STATUS ESP32',
          result: status,
          isSuccess: true,
          latency: 'MQTT'
        });
      },
      onSchedule: (scheduleMsg) => {
        touchActivity();
        let schedTarget = '06:00';
        if (scheduleMsg.includes('|')) {
          schedTarget = scheduleMsg.split('|')[1].trim();
        }
        handleFeedingEventTrigger({
          raw: scheduleMsg,
          feedingSchedule: schedTarget
        });
      }
    });
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  function init() {
    setPumpVisualStatus('UNKNOWN');
    setupEvents();

    window.RtcSimulation.onPacket((rawString) => {
      // Jika MQTT sedang aktif terhubung, utamakan data dari MQTT
      if (!window.MqttClient || !window.MqttClient.isConnected()) {
        handleIncomingRawRtc(rawString);
      }
    });

    window.RtcSimulation.startStream();

    // Otomatis hubungkan ke MQTT broker.emqx.io
    initMqttIntegration();

    console.log('RTC Monitor & Smart Feeding Controller initialized successfully with MQTT support.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
