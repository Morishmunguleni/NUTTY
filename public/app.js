// =============================================================
// N.U.T.T.Y. CLIENT LOGIC - ANDROID MOBILE OPTIMIZED
// =============================================================

// ---- Server URL auto-detection ----
// When the Capacitor config sets server.url, the WebView loads from that IP directly.
// All relative fetch('/api/...') calls will automatically go to the same origin.
// This constant is a safety fallback only used if origin detection fails.
const PC_SERVER_IP = '192.168.1.189';
const PC_SERVER_PORT = '3000';

function getServerBase() {
  const customUrl = localStorage.getItem('nutty_server_url');
  if (customUrl) return customUrl.replace(/\/+$/, '');

  const origin = window.location.origin;
  // Capacitor live reload or regular browser - use same origin
  if (origin && origin !== 'null' && !origin.startsWith('capacitor://') && !origin.startsWith('file://')) {
    return ''; // relative paths work fine
  }
  // Fallback: running from file:// (old capacitor without server.url set)
  return `http://${PC_SERVER_IP}:${PC_SERVER_PORT}`;
}

const SERVER_BASE = getServerBase();

async function apiFetch(path, options = {}) {
  const url = SERVER_BASE + path;
  return fetch(url, options);
}

document.addEventListener('DOMContentLoaded', () => {

  // ---- Platform Detection ----
  const isAndroid = /android/i.test(navigator.userAgent);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMobile = isAndroid || isIOS || window.innerWidth < 600;

  // ---- State ----
  let isListening = false;
  let isSpeaking = false;
  let recognition = null;
  let synthVoices = [];
  let currentAudioCtx = null;
  let webcamStream = null;
  let chatBadgeCount = 0;
  let activeTab = 'tab-home';

  // ---- DOM Elements ----
  const btnOrbMic = document.getElementById('btn-orb-mic');
  const micIcon   = document.getElementById('mic-icon');
  const orbStatus = document.getElementById('orb-status');
  const liveSpeechText = document.getElementById('live-speech-text');
  const chatTranscript  = document.getElementById('chat-transcript');
  const chatForm   = document.getElementById('chat-form');
  const chatInput  = document.getElementById('chat-input');
  const selectVoice = document.getElementById('select-voice');
  const hudClock   = document.getElementById('hud-clock');

  // System meters
  const cpuBar   = document.getElementById('cpu-bar');
  const cpuText  = document.getElementById('cpu-text');
  const cpuBadge = document.getElementById('cpu-badge');
  const ramBar   = document.getElementById('ram-bar');
  const ramText  = document.getElementById('ram-text');
  const sysOs    = document.getElementById('sys-os');
  const sysUptime = document.getElementById('sys-uptime');

  // Memory & Modals
  const memoryList       = document.getElementById('memory-list');
  const btnAddMemory     = document.getElementById('btn-add-memory');
  const memoryModal      = document.getElementById('memory-modal');
  const closeMemoryModal = document.getElementById('close-memory-modal');
  const btnSaveMemory    = document.getElementById('btn-save-memory');

  // Vision Modal
  const btnCamera       = document.getElementById('btn-camera');
  const visionModal     = document.getElementById('vision-modal');
  const closeVisionModal = document.getElementById('close-vision-modal');
  const webcamFeed      = document.getElementById('webcam-feed');
  const btnSnapAnalyze  = document.getElementById('btn-snap-analyze');
  const visionResults   = document.getElementById('vision-results');

  // Weather
  const weatherTemp = document.getElementById('weather-temp');
  const weatherCond = document.getElementById('weather-cond');
  const weatherHum  = document.getElementById('weather-hum');
  const weatherWind = document.getElementById('weather-wind');

  // Inline mic button (chat tab)
  const btnMicInline    = document.getElementById('btn-mic-inline');
  const micInlineIcon   = document.getElementById('mic-inline-icon');

  // ---- Set Platform Info ----
  if (isAndroid) {
    const sysOsEl = document.getElementById('sys-os');
    const platEl = document.getElementById('platform-type');
    const platRow = document.getElementById('platform-row');
    if (sysOsEl) sysOsEl.textContent = 'Android Device';
    if (platEl) platEl.textContent = 'Mobile';
    if (platRow) platRow.querySelector('i').className = 'fa-brands fa-android text-cyan';
  } else if (isIOS) {
    const sysOsEl = document.getElementById('sys-os');
    const platEl = document.getElementById('platform-type');
    if (sysOsEl) sysOsEl.textContent = 'iOS Device';
    if (platEl) platEl.textContent = 'Mobile';
  }

  // -----------------------------------------------------------
  // 1. BOTTOM TAB NAVIGATION
  // -----------------------------------------------------------
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanels = document.querySelectorAll('.tab-panel');

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      switchTab(targetId);
    });
  });

  function switchTab(tabId) {
    activeTab = tabId;

    // Update panels
    tabPanels.forEach(p => p.classList.remove('active'));
    const targetPanel = document.getElementById(tabId);
    if (targetPanel) targetPanel.classList.add('active');

    // Update nav buttons
    navTabs.forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
    });

    // Clear chat badge when opening chat tab
    if (tabId === 'tab-chat') {
      chatBadgeCount = 0;
      const badge = document.getElementById('chat-badge');
      if (badge) badge.style.display = 'none';
    }

    // Load memories when switching to memory tab
    if (tabId === 'tab-memory') loadMemories();
  }

  // -----------------------------------------------------------
  // 2. CLOCK & SYSTEM STATS
  // -----------------------------------------------------------
  function updateClock() {
    const now = new Date();
    hudClock.textContent = now.toLocaleTimeString();
  }
  setInterval(updateClock, 1000);
  updateClock();

  async function fetchSystemStats() {
    try {
      const res = await apiFetch('/api/system');
      const data = await res.json();
      if (data.success) {
        const s = data.data;
        cpuBar.style.width   = `${s.cpuUsage}%`;
        cpuText.textContent  = `${s.cpuUsage}%`;
        cpuBadge.textContent = `${s.cpuUsage}% LOAD`;

        ramBar.style.width  = `${s.ramPercent}%`;
        ramText.textContent = `${s.ramUsedGb} GB / ${s.ramTotalGb} GB`;
        sysUptime.textContent = s.uptimeFormatted;

        // Only update OS text if not Android/iOS (keep device platform label)
        if (!isMobile && sysOs) {
          sysOs.textContent = s.distro || s.platform;
        }
      }
    } catch (e) {
      console.warn('System stats offline', e);
      if (cpuText) cpuText.textContent = 'N/A';
    }
  }
  setInterval(fetchSystemStats, 4000);
  fetchSystemStats();

  async function fetchWeather() {
    try {
      const res = await apiFetch('/api/weather');
      const data = await res.json();
      if (data.success) {
        const w = data.data;
        if (weatherTemp) weatherTemp.textContent = w.temperature;
        if (weatherCond) weatherCond.textContent = w.condition;
        if (weatherHum)  weatherHum.textContent  = w.humidity;
        if (weatherWind) weatherWind.textContent  = w.windSpeed;
      }
    } catch (e) { console.warn('Weather offline', e); }
  }
  fetchWeather();

  // -----------------------------------------------------------
  // 3. MEMORY SYSTEM
  // -----------------------------------------------------------
  async function loadMemories() {
    if (!memoryList) return;
    memoryList.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>`;
    try {
      const res  = await apiFetch('/api/memory');
      const data = await res.json();
      if (data.success && data.memories) renderMemories(data.memories);
    } catch (e) {
      memoryList.innerHTML = `<div class="memory-item">Failed to load memories.</div>`;
    }
  }

  function renderMemories(mems) {
    if (!memoryList) return;
    if (mems.length === 0) {
      memoryList.innerHTML = `<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:2rem 1rem;">No memories logged yet.<br>Say "Nutty, remember that..." to store something.</div>`;
      return;
    }
    memoryList.innerHTML = mems.map(m => `
      <div class="memory-item">
        <div class="memory-fact">${escapeHtml(m.fact)}</div>
        <div class="memory-meta">
          <span><i class="fa-solid fa-tag"></i> ${escapeHtml(m.category)}</span>
          <button class="del-mem-btn" data-id="${m.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.del-mem-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        await apiFetch(`/api/memory/${id}`, { method: 'DELETE' });
        loadMemories();
      });
    });
  }

  if (btnAddMemory) btnAddMemory.addEventListener('click', () => memoryModal.classList.add('active'));
  if (closeMemoryModal) closeMemoryModal.addEventListener('click', () => memoryModal.classList.remove('active'));

  // Memory quick button from home tab
  const btnMemoryQuick = document.getElementById('btn-memory-quick');
  if (btnMemoryQuick) btnMemoryQuick.addEventListener('click', () => {
    switchTab('tab-memory');
  });

  if (btnSaveMemory) {
    btnSaveMemory.addEventListener('click', async () => {
      const fact = document.getElementById('mem-input-fact').value.trim();
      const cat  = document.getElementById('mem-input-cat').value.trim() || 'general';
      if (!fact) return;

      await apiFetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fact, category: cat })
      });

      document.getElementById('mem-input-fact').value = '';
      memoryModal.classList.remove('active');
      playBeepSound(600, 0.1);
      loadMemories();
    });
  }

  loadMemories();

  // -----------------------------------------------------------
  // 4. AUDIO CHIMES
  // -----------------------------------------------------------
  function playBeepSound(freq = 440, duration = 0.1, type = 'sine') {
    try {
      if (!currentAudioCtx) currentAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = currentAudioCtx.createOscillator();
      const gain = currentAudioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.07, currentAudioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentAudioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(currentAudioCtx.destination);
      osc.start();
      osc.stop(currentAudioCtx.currentTime + duration);
    } catch (e) {}
  }

  function playActivateChime() {
    playBeepSound(520, 0.08, 'triangle');
    setTimeout(() => playBeepSound(680, 0.12, 'sine'), 80);
  }

  // -----------------------------------------------------------
  // 5. TTS - TEXT TO SPEECH
  // -----------------------------------------------------------
  function initTTS() {
    if (!('speechSynthesis' in window)) return;
    function populateVoices() {
      synthVoices = window.speechSynthesis.getVoices();
      if (!selectVoice) return;
      selectVoice.innerHTML = synthVoices.map((v, i) =>
        `<option value="${i}" ${v.lang.startsWith('en') ? 'selected' : ''}>${v.name}</option>`
      ).join('');
    }
    populateVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = populateVoices;
    }
  }
  initTTS();

  function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voiceIdx  = selectVoice ? selectVoice.value : 0;
    if (synthVoices[voiceIdx]) utterance.voice = synthVoices[voiceIdx];
    utterance.pitch = 1.0;
    utterance.rate  = 1.05;

    utterance.onstart = () => {
      isSpeaking = true;
      btnOrbMic.classList.add('speaking');
      orbStatus.textContent = 'SPEAKING';
    };
    utterance.onend = () => {
      isSpeaking = false;
      btnOrbMic.classList.remove('speaking');
      orbStatus.textContent = isListening ? 'LISTENING' : 'TAP TO SPEAK';
    };
    window.speechSynthesis.speak(utterance);
  }

  // -----------------------------------------------------------
  // 6. SPEECH RECOGNITION
  // -----------------------------------------------------------
  function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      liveSpeechText.textContent = 'Speech recognition not supported. Use Chrome.';
      return;
    }

    recognition = new SR();
    recognition.continuous    = true;
    recognition.interimResults = true;
    recognition.lang          = 'en-US';

    recognition.onstart = () => {
      isListening = true;
      btnOrbMic.classList.add('listening');
      micIcon.className = 'fa-solid fa-microphone';
      orbStatus.textContent = 'LISTENING';
      if (btnMicInline) btnMicInline.classList.add('listening-inline');
      if (micInlineIcon) micInlineIcon.className = 'fa-solid fa-microphone';
      playActivateChime();
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (liveSpeechText) liveSpeechText.textContent = finalTranscript || interim || 'Listening...';

      if (finalTranscript) {
        const cleanMsg = finalTranscript.trim();
        const lower    = cleanMsg.toLowerCase();

        if (lower.includes('hey nutty') || lower.includes('nutty') || isListening) {
          const query = cleanMsg
            .replace(/^hey\s+nutty\b/i, '')
            .replace(/^nutty\b/i, '')
            .trim() || cleanMsg;
          if (query.length > 1) handleUserMessage(query);
        }
      }
    };

    recognition.onerror = (err) => {
      console.warn('Speech error:', err.error);
      if (err.error !== 'no-speech') stopListening();
    };

    recognition.onend = () => {
      if (isListening) {
        try { recognition.start(); } catch(e) {}
      } else {
        stopListening();
      }
    };
  }
  initSpeechRecognition();

  function startListening() {
    if (recognition) {
      try { recognition.start(); } catch(e) { console.warn(e); }
    }
  }

  function stopListening() {
    isListening = false;
    btnOrbMic.classList.remove('listening');
    micIcon.className = 'fa-solid fa-microphone-slash';
    orbStatus.textContent = 'TAP TO SPEAK';
    if (btnMicInline) btnMicInline.classList.remove('listening-inline');
    if (micInlineIcon) micInlineIcon.className = 'fa-solid fa-microphone';
    if (recognition) { try { recognition.stop(); } catch(e) {} }
  }

  function toggleListening() {
    if (isListening) { stopListening(); } else { startListening(); }
  }

  btnOrbMic.addEventListener('click', toggleListening);
  if (btnMicInline) btnMicInline.addEventListener('click', toggleListening);

  // -----------------------------------------------------------
  // 7. CHAT & COMMAND HANDLING
  // -----------------------------------------------------------
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text) {
      chatInput.value = '';
      handleUserMessage(text);
    }
  });

  async function handleUserMessage(message) {
    playBeepSound(400, 0.05);
    appendChatMessage('user', message);

    // Switch to chat tab to show response
    if (activeTab !== 'tab-chat') {
      chatBadgeCount++;
      const badge = document.getElementById('chat-badge');
      if (badge) { badge.textContent = '!'; badge.style.display = 'flex'; }
    }

    if (liveSpeechText) liveSpeechText.textContent = `Processing: "${message}"...`;

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, platform: isAndroid ? 'android' : (isIOS ? 'ios' : 'desktop') })
      });
      const data = await res.json();

      if (data.success && data.reply) {
        appendChatMessage('nutty', data.reply);
        speakText(data.reply);
        if (liveSpeechText) liveSpeechText.textContent = data.reply;
        if (data.memorySaved) loadMemories();

        // Handle Android URL actions
        if (data.actionTool === 'open_url' && data.target && isMobile) {
          setTimeout(() => { window.open(data.target, '_blank'); }, 500);
        }
        if (data.actionTool === 'search_web' && data.searchUrl && isMobile) {
          setTimeout(() => { window.open(data.searchUrl, '_blank'); }, 500);
        }
      } else {
        appendChatMessage('nutty', 'My communication link experienced a glitch. Please try again.');
      }
    } catch (e) {
      appendChatMessage('nutty', 'Unable to reach Nutty core server. Make sure the server is running.');
    }
  }

  // Android-aware command sender
  async function sendQuickCommand(action, target) {
    playBeepSound(500, 0.05);

    // On Android/mobile, handle URLs directly in browser
    if (isMobile && action === 'open_url') {
      let url = target.startsWith('http') ? target : 'https://' + target;
      window.open(url, '_blank');
      appendChatMessage('nutty', `Opening ${target} in your browser.`);
      speakText(`Opening ${target}`);
      return;
    }
    if (isMobile && action === 'search_web') {
      const url = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
      window.open(url, '_blank');
      appendChatMessage('nutty', `Searching the web for "${target}".`);
      return;
    }

    try {
      const res = await apiFetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target, platform: isAndroid ? 'android' : 'desktop' })
      });
      const data = await res.json();
      appendChatMessage('nutty', data.message || `Command sent: ${action} ${target}`);
      speakText(data.message || `Executing ${target}`);
    } catch (e) {
      appendChatMessage('system', `Error: ${e.message}`);
    }
  }

  function appendChatMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${sender}-msg`;

    let authorTag  = 'YOU';
    let authorIcon = 'fa-user text-amber';
    if (sender === 'nutty') { authorTag = 'N.U.T.T.Y.'; authorIcon = 'fa-robot text-cyan'; }
    else if (sender === 'system') { authorTag = 'SYS'; authorIcon = 'fa-shield-halved'; }

    msgDiv.innerHTML = `
      <div class="msg-author"><i class="fa-solid ${authorIcon}"></i> ${authorTag}</div>
      <div class="msg-bubble">${escapeHtml(text)}</div>
    `;

    chatTranscript.appendChild(msgDiv);
    chatTranscript.scrollTop = chatTranscript.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // -----------------------------------------------------------
  // 8. QUICK ACTION BUTTONS (Android-aware)
  // -----------------------------------------------------------
  function wireQuickBtn(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  wireQuickBtn('btn-browser', () => {
    if (isMobile) { window.open('https://www.google.com', '_blank'); }
    else { sendQuickCommand('open_app', 'browser'); }
  });

  wireQuickBtn('btn-youtube', () => {
    window.open('https://www.youtube.com', '_blank');
    appendChatMessage('nutty', 'Opening YouTube for you.');
    speakText('Opening YouTube');
  });

  wireQuickBtn('btn-maps', () => {
    window.open('https://maps.google.com', '_blank');
    appendChatMessage('nutty', 'Opening Google Maps.');
    speakText('Opening Google Maps');
  });

  wireQuickBtn('btn-github', () => {
    window.open('https://github.com', '_blank');
    appendChatMessage('nutty', 'Accessing GitHub network.');
    speakText('Opening GitHub');
  });

  wireQuickBtn('btn-camera', () => {
    visionModal.classList.add('active');
    openCamera();
  });

  // -----------------------------------------------------------
  // 9. OPTICAL VISION MODAL
  // -----------------------------------------------------------
  async function openCamera() {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: isAndroid ? 'environment' : 'user' }
      });
      webcamFeed.srcObject = webcamStream;
    } catch (err) {
      if (visionResults) visionResults.textContent = 'Camera access denied. Please allow camera permission.';
    }
  }

  if (closeVisionModal) {
    closeVisionModal.addEventListener('click', () => {
      visionModal.classList.remove('active');
      if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
    });
  }

  if (btnSnapAnalyze) {
    btnSnapAnalyze.addEventListener('click', async () => {
      playBeepSound(700, 0.1);
      if (visionResults) visionResults.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scanning frame...';

      const canvas = document.getElementById('snapshot-canvas');
      canvas.width  = webcamFeed.videoWidth  || 640;
      canvas.height = webcamFeed.videoHeight || 480;
      canvas.getContext('2d').drawImage(webcamFeed, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');

      try {
        const res = await apiFetch('/api/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl })
        });
        const data = await res.json();
        if (data.success) {
          if (visionResults) visionResults.textContent = data.analysis;
          appendChatMessage('nutty', `[OPTICAL SCAN]: ${data.analysis}`);
          speakText(data.analysis);
        }
      } catch (e) {
        if (visionResults) visionResults.textContent = 'Vision server offline.';
      }
    });
  }

  // -----------------------------------------------------------
  // 10. ARC REACTOR CANVAS VISUALIZER
  // -----------------------------------------------------------
  function initCanvasVisualizer() {
    const canvas = document.getElementById('arcVisualizer');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Match canvas size to container
    function resizeCanvas() {
      const container = canvas.parentElement;
      const size = Math.min(container.offsetWidth, container.offsetHeight);
      canvas.width  = size;
      canvas.height = size;
    }
    resizeCanvas();

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let angle = 0;

    const numParticles = isMobile ? 25 : 40;
    const particles = [];
    for (let i = 0; i < numParticles; i++) {
      const maxR = canvas.width * 0.42;
      const minR = canvas.width * 0.22;
      particles.push({
        r:     minR + Math.random() * (maxR - minR),
        theta: Math.random() * Math.PI * 2,
        speed: (Math.random() * 0.02) + 0.004,
        size:  Math.random() * 2.5 + 0.8,
        color: Math.random() > 0.3 ? '#00f3ff' : '#a855f7'
      });
    }

    function render() {
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;

      ctx.clearRect(0, 0, W, H);

      const pulseFactor = isSpeaking
        ? (Math.sin(Date.now() * 0.01) * 12 + 8)
        : (isListening ? (Math.sin(Date.now() * 0.008) * 7 + 4) : 0);

      angle += 0.01;
      const baseRadius = W * 0.35 + pulseFactor;

      ctx.save();
      ctx.translate(cx, cy);

      // Rotating node dots
      for (let i = 0; i < 12; i++) {
        const rad = angle + (i * Math.PI / 6);
        const x = Math.cos(rad) * baseRadius;
        const y = Math.sin(rad) * baseRadius;
        ctx.beginPath();
        ctx.arc(x, y, isSpeaking ? 3.5 : 2, 0, Math.PI * 2);
        ctx.fillStyle = isListening ? '#ffb700' : (isSpeaking ? '#a855f7' : '#00f3ff');
        ctx.shadowBlur  = 10;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fill();
      }

      // Particles
      particles.forEach(p => {
        p.theta += p.speed;
        const px = Math.cos(p.theta) * (p.r + pulseFactor * 0.4);
        const py = Math.sin(p.theta) * (p.r + pulseFactor * 0.4);
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle   = p.color;
        ctx.shadowBlur  = 5;
        ctx.shadowColor = p.color;
        ctx.fill();
      });

      ctx.restore();
      requestAnimationFrame(render);
    }
    render();
  }
  initCanvasVisualizer();

  // -----------------------------------------------------------
  // 11. MODAL CLOSE ON BACKDROP TAP
  // -----------------------------------------------------------
  document.querySelectorAll('.hud-modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        if (modal.id === 'vision-modal' && webcamStream) {
          webcamStream.getTracks().forEach(t => t.stop());
        }
      }
    });
  });

  // -----------------------------------------------------------
  // 12. SWIPE GESTURE BETWEEN TABS (Mobile)
  // -----------------------------------------------------------
  if (isMobile) {
    const tabOrder = ['tab-home', 'tab-chat', 'tab-system', 'tab-memory'];
    let touchStartX = 0;

    document.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) < 60) return;
      const currentIdx = tabOrder.indexOf(activeTab);
      if (diff > 0 && currentIdx < tabOrder.length - 1) {
        switchTab(tabOrder[currentIdx + 1]);
      } else if (diff < 0 && currentIdx > 0) {
        switchTab(tabOrder[currentIdx - 1]);
      }
    }, { passive: true });
  }

});

