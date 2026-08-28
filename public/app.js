// =============================================================
// N.U.T.T.Y. CLIENT LOGIC - GENERATIVE AI & VOICE ASSISTANT
// =============================================================

const PC_SERVER_IP = '192.168.1.189';
const PC_SERVER_PORT = '3000';

function getServerBase() {
  const customUrl = localStorage.getItem('nutty_server_url');
  if (customUrl) return customUrl.replace(/\/+$/, '');

  const origin = window.location.origin;
  if (origin && origin !== 'null' && !origin.startsWith('capacitor://') && !origin.startsWith('file://')) {
    return '';
  }
  return `http://${PC_SERVER_IP}:${PC_SERVER_PORT}`;
}

let SERVER_BASE = getServerBase();

async function apiFetch(path, options = {}) {
  const url = SERVER_BASE + path;
  return fetch(url, options);
}

document.addEventListener('DOMContentLoaded', () => {

  const isAndroid = /android/i.test(navigator.userAgent);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMobile = isAndroid || isIOS || window.innerWidth < 600;

  // State & History
  let isListening = false;
  let isSpeaking = false;
  let recognition = null;
  let synthVoices = [];
  let currentAudioCtx = null;
  let webcamStream = null;
  let chatBadgeCount = 0;
  let activeTab = 'tab-home';
  let chatHistory = [];

  // DOM Elements
  const btnOrbMic = document.getElementById('btn-orb-mic');
  const micIcon   = document.getElementById('mic-icon');
  const orbStatus = document.getElementById('orb-status');
  const liveSpeechText = document.getElementById('live-speech-text');
  const chatTranscript  = document.getElementById('chat-transcript');
  const chatForm   = document.getElementById('chat-form');
  const chatInput  = document.getElementById('chat-input');
  const selectVoice = document.getElementById('select-voice');
  const hudClock   = document.getElementById('hud-clock');

  // AI Brain Settings
  const btnOpenAiSettings = document.getElementById('btn-open-ai-settings');
  const aiSettingsModal   = document.getElementById('ai-settings-modal');
  const closeAiModal      = document.getElementById('close-ai-modal');
  const inputAiKey        = document.getElementById('input-ai-key');
  const aiProviderSelect  = document.getElementById('ai-provider-select');
  const inputServerUrl    = document.getElementById('input-server-url');
  const btnSaveAiSettings = document.getElementById('btn-save-ai-settings');
  const btnClearAiKey     = document.getElementById('btn-clear-ai-key');
  const aiStatusPill      = document.getElementById('ai-status-pill');

  // System meters
  const cpuBar   = document.getElementById('cpu-bar');
  const cpuText  = document.getElementById('cpu-text');
  const cpuBadge = document.getElementById('cpu-badge');
  const ramBar   = document.getElementById('ram-bar');
  const ramText  = document.getElementById('ram-text');
  const sysOs    = document.getElementById('sys-os');
  const sysUptime = document.getElementById('sys-uptime');

  // Memory & Vision
  const memoryList       = document.getElementById('memory-list');
  const btnAddMemory     = document.getElementById('btn-add-memory');
  const memoryModal      = document.getElementById('memory-modal');
  const closeMemoryModal = document.getElementById('close-memory-modal');
  const btnSaveMemory    = document.getElementById('btn-save-memory');

  const btnCamera       = document.getElementById('btn-camera');
  const visionModal     = document.getElementById('vision-modal');
  const closeVisionModal = document.getElementById('close-vision-modal');
  const webcamFeed      = document.getElementById('webcam-feed');
  const btnSnapAnalyze  = document.getElementById('btn-snap-analyze');
  const visionResults   = document.getElementById('vision-results');

  const weatherTemp = document.getElementById('weather-temp');
  const weatherCond = document.getElementById('weather-cond');
  const weatherHum  = document.getElementById('weather-hum');
  const weatherWind = document.getElementById('weather-wind');

  const btnMicInline    = document.getElementById('btn-mic-inline');
  const micInlineIcon   = document.getElementById('mic-inline-icon');

  // Init Saved Settings
  const savedKey = localStorage.getItem('nutty_ai_key');
  const savedProvider = localStorage.getItem('nutty_ai_provider');
  const savedUrl = localStorage.getItem('nutty_server_url');

  if (savedKey && inputAiKey) {
    inputAiKey.value = savedKey;
    if (aiStatusPill) aiStatusPill.textContent = 'AI ACTIVE';
  }
  if (savedProvider && aiProviderSelect) aiProviderSelect.value = savedProvider;
  if (savedUrl && inputServerUrl) inputServerUrl.value = savedUrl;

  // Platform Setup
  if (isAndroid) {
    if (sysOs) sysOs.textContent = 'Android Device';
    const platEl = document.getElementById('platform-type');
    if (platEl) platEl.textContent = 'Mobile';
  }

  // Navigation
  function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));

    const panel = document.getElementById(tabId);
    if (panel) panel.classList.add('active');

    const navBtn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
    if (navBtn) navBtn.classList.add('active');

    activeTab = tabId;
    if (tabId === 'tab-chat') {
      chatBadgeCount = 0;
      const badge = document.getElementById('chat-badge');
      if (badge) badge.style.display = 'none';
      if (chatTranscript) chatTranscript.scrollTop = chatTranscript.scrollHeight;
    }
    if (tabId === 'tab-memory') loadMemories();
  }

  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) switchTab(tabId);
    });
  });

  // Clock
  function updateClock() {
    if (hudClock) hudClock.textContent = new Date().toLocaleTimeString();
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Diagnostics
  async function fetchSystemStats() {
    try {
      const res = await apiFetch('/api/system');
      const data = await res.json();
      if (data.success && data.data) {
        const s = data.data;
        if (cpuBar) cpuBar.style.width = `${s.cpuUsage}%`;
        if (cpuText) cpuText.textContent = `${s.cpuUsage}%`;
        if (cpuBadge) cpuBadge.textContent = `${s.cpuUsage}% LOAD`;
        if (ramBar) ramBar.style.width = `${s.ramPercent}%`;
        if (ramText) ramText.textContent = `${s.ramUsedGb} GB / ${s.ramTotalGb} GB`;
        if (sysUptime) sysUptime.textContent = s.uptimeFormatted;
      }
    } catch (e) {}
  }
  setInterval(fetchSystemStats, 4000);
  fetchSystemStats();

  async function fetchWeather() {
    try {
      const res = await apiFetch('/api/weather');
      const data = await res.json();
      if (data.success && data.data) {
        const w = data.data;
        if (weatherTemp) weatherTemp.textContent = w.temperature;
        if (weatherCond) weatherCond.textContent = w.condition;
        if (weatherHum)  weatherHum.textContent  = w.humidity;
        if (weatherWind) weatherWind.textContent  = w.windSpeed;
      }
    } catch (e) {}
  }
  fetchWeather();

  // Memory
  async function loadMemories() {
    if (!memoryList) return;
    memoryList.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading archives...</div>`;
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
  const btnMemoryQuick = document.getElementById('btn-memory-quick');
  if (btnMemoryQuick) btnMemoryQuick.addEventListener('click', () => switchTab('tab-memory'));

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
      loadMemories();
    });
  }

  // Audio / Chimes
  function playBeepSound(freq = 440, duration = 0.08) {
    try {
      const ctx = currentAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
      currentAudioCtx = ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  // Text-To-Speech
  function initTTS() {
    if (!('speechSynthesis' in window)) return;
    function populateVoices() {
      synthVoices = window.speechSynthesis.getVoices();
      if (!selectVoice || synthVoices.length === 0) return;
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

    let spoken = text;
    if (text.length > 200 || text.includes('#') || text.includes('Dear ') || text.includes('Subject:')) {
      spoken = "I have drafted that for you, Boss. The full document is ready in your console.";
    }

    spoken = spoken.replace(/[*_#`~]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1');

    const utterance = new SpeechSynthesisUtterance(spoken);
    const voiceIdx  = selectVoice ? selectVoice.value : 0;
    if (synthVoices[voiceIdx]) utterance.voice = synthVoices[voiceIdx];
    utterance.pitch = 1.0;
    utterance.rate  = 1.05;

    utterance.onstart = () => {
      isSpeaking = true;
      if (btnOrbMic) btnOrbMic.classList.add('speaking');
      if (orbStatus) orbStatus.textContent = 'SPEAKING';
    };
    utterance.onend = () => {
      isSpeaking = false;
      if (btnOrbMic) btnOrbMic.classList.remove('speaking');
      if (orbStatus) orbStatus.textContent = isListening ? 'LISTENING' : 'TAP TO SPEAK';
    };
    window.speechSynthesis.speak(utterance);
  }

  // Speech Recognition
  function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      if (liveSpeechText) liveSpeechText.textContent = 'Speech recognition not supported in this browser.';
      return;
    }

    recognition = new SR();
    recognition.continuous    = true;
    recognition.interimResults = true;
    recognition.lang          = 'en-US';

    recognition.onstart = () => {
      isListening = true;
      if (btnOrbMic) btnOrbMic.classList.add('listening');
      if (micIcon) micIcon.className = 'fa-solid fa-microphone';
      if (orbStatus) orbStatus.textContent = 'LISTENING';
      if (btnMicInline) btnMicInline.classList.add('listening-inline');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }

      if (liveSpeechText) liveSpeechText.textContent = finalTranscript || interim || 'Listening...';

      if (finalTranscript) {
        const cleanMsg = finalTranscript.trim();
        const lower    = cleanMsg.toLowerCase();
        if (lower.includes('hey nutty') || lower.includes('nutty') || isListening) {
          const query = cleanMsg.replace(/^hey\s+nutty\b/i, '').replace(/^nutty\b/i, '').trim() || cleanMsg;
          if (query.length > 1) handleUserMessage(query);
        }
      }
    };

    recognition.onerror = () => stopListening();
    recognition.onend = () => {
      if (isListening) { try { recognition.start(); } catch(e) {} }
      else stopListening();
    };
  }
  initSpeechRecognition();

  function startListening() {
    if (recognition) { try { recognition.start(); } catch(e) {} }
  }

  function stopListening() {
    isListening = false;
    if (btnOrbMic) btnOrbMic.classList.remove('listening');
    if (micIcon) micIcon.className = 'fa-solid fa-microphone-slash';
    if (orbStatus) orbStatus.textContent = 'TAP TO SPEAK';
    if (btnMicInline) btnMicInline.classList.remove('listening-inline');
    if (recognition) { try { recognition.stop(); } catch(e) {} }
  }

  function toggleListening() {
    if (isListening) stopListening();
    else startListening();
  }

  if (btnOrbMic) btnOrbMic.addEventListener('click', toggleListening);
  if (btnMicInline) btnMicInline.addEventListener('click', toggleListening);

  // Chat Form
  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text) {
        chatInput.value = '';
        handleUserMessage(text);
      }
    });
  }

  // Quick Prompt Chips
  document.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) {
        switchTab('tab-chat');
        handleUserMessage(prompt);
      }
    });
  });

  const btnQuickLetter = document.getElementById('btn-quick-letter');
  if (btnQuickLetter) btnQuickLetter.addEventListener('click', () => {
    switchTab('tab-chat');
    handleUserMessage('Write me a formal business letter');
  });

  const btnQuickEmail = document.getElementById('btn-quick-email');
  if (btnQuickEmail) btnQuickEmail.addEventListener('click', () => {
    switchTab('tab-chat');
    handleUserMessage('Write a professional email update');
  });

  // User Message Processing
  async function handleUserMessage(message) {
    playBeepSound(400, 0.05);
    appendChatMessage('user', message);
    chatHistory.push({ role: 'user', content: message });

    if (activeTab !== 'tab-chat') {
      chatBadgeCount++;
      const badge = document.getElementById('chat-badge');
      if (badge) { badge.textContent = '!'; badge.style.display = 'flex'; }
    }

    if (liveSpeechText) liveSpeechText.textContent = `Generating: "${message}"...`;

    try {
      const storedKey = localStorage.getItem('nutty_ai_key') || '';
      const storedProvider = localStorage.getItem('nutty_ai_provider') || 'auto';

      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          contextHistory: chatHistory.slice(-8),
          platform: isAndroid ? 'android' : 'desktop',
          apiKey: storedKey,
          apiProvider: storedProvider
        })
      });
      const data = await res.json();

      if (data.success && data.reply) {
        chatHistory.push({ role: 'assistant', content: data.reply });
        appendChatMessage('nutty', data.reply, data.source);
        speakText(data.reply);
        if (liveSpeechText) liveSpeechText.textContent = 'Response ready.';
        if (data.memorySaved) loadMemories();

        if (data.actionTool === 'open_url' && data.target && isMobile) {
          setTimeout(() => window.open(data.target, '_blank'), 500);
        }
        if (data.actionTool === 'search_web' && data.searchUrl && isMobile) {
          setTimeout(() => window.open(data.searchUrl, '_blank'), 500);
        }
      } else {
        appendChatMessage('nutty', 'Communication anomaly detected. Please try again.');
      }
    } catch (e) {
      appendChatMessage('nutty', 'Could not reach core brain. Verify connection.');
    }
  }

  function appendChatMessage(sender, text, source = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${sender}-msg`;

    let authorTag  = 'YOU';
    let authorIcon = 'fa-user text-amber';
    let sourceBadge = '';

    if (sender === 'nutty') {
      authorTag = 'N.U.T.T.Y.';
      authorIcon = 'fa-robot text-cyan';
      if (source) sourceBadge = `<span class="source-pill">${escapeHtml(source)}</span>`;
    } else if (sender === 'system') {
      authorTag = 'SYS';
      authorIcon = 'fa-shield-halved';
    }

    const isDocument = text.includes('\n\n') || text.length > 250 || text.includes('Dear ') || text.includes('Subject:');
    const copyBtnHtml = sender === 'nutty' && isDocument ? `<button class="copy-bubble-btn" title="Copy Document"><i class="fa-solid fa-copy"></i> Copy</button>` : '';

    msgDiv.innerHTML = `
      <div class="msg-header-row">
        <div class="msg-author"><i class="fa-solid ${authorIcon}"></i> ${authorTag} ${sourceBadge}</div>
        ${copyBtnHtml}
      </div>
      <div class="msg-bubble">${formatMessageText(text)}</div>
    `;

    const copyBtn = msgDiv.querySelector('.copy-bubble-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(text);
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        setTimeout(() => copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy', 2000);
      });
    }

    chatTranscript.appendChild(msgDiv);
    chatTranscript.scrollTop = chatTranscript.scrollHeight;
  }

  function formatMessageText(text) {
    let formatted = escapeHtml(text);
    // Bold **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Bullet lines • or -
    formatted = formatted.replace(/^[-•]\s+(.*)$/gm, '<span class="bullet-item">• $1</span>');
    return formatted;
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // AI Settings Modal
  if (btnOpenAiSettings) btnOpenAiSettings.addEventListener('click', () => aiSettingsModal.classList.add('active'));
  if (closeAiModal) closeAiModal.addEventListener('click', () => aiSettingsModal.classList.remove('active'));

  if (btnSaveAiSettings) {
    btnSaveAiSettings.addEventListener('click', () => {
      const key = inputAiKey.value.trim();
      const provider = aiProviderSelect.value;
      const customUrl = inputServerUrl.value.trim();

      if (key) localStorage.setItem('nutty_ai_key', key);
      else localStorage.removeItem('nutty_ai_key');

      localStorage.setItem('nutty_ai_provider', provider);

      if (customUrl) {
        localStorage.setItem('nutty_server_url', customUrl);
        SERVER_BASE = customUrl.replace(/\/+$/, '');
      } else {
        localStorage.removeItem('nutty_server_url');
        SERVER_BASE = getServerBase();
      }

      if (aiStatusPill) aiStatusPill.textContent = key ? 'AI ACTIVE' : 'AI BRAIN';
      aiSettingsModal.classList.remove('active');
      appendChatMessage('system', key ? 'AI Brain configured successfully! You can now ask me anything like ChatGPT.' : 'Settings updated.');
    });
  }

  if (btnClearAiKey) {
    btnClearAiKey.addEventListener('click', () => {
      inputAiKey.value = '';
      localStorage.removeItem('nutty_ai_key');
      if (aiStatusPill) aiStatusPill.textContent = 'AI BRAIN';
    });
  }

  // Quick Action Buttons
  function wireQuickBtn(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  wireQuickBtn('btn-browser', () => window.open('https://www.google.com', '_blank'));
  wireQuickBtn('btn-youtube', () => {
    window.open('https://www.youtube.com', '_blank');
    appendChatMessage('nutty', 'Opening YouTube.');
  });
  wireQuickBtn('btn-camera', () => {
    visionModal.classList.add('active');
    openCamera();
  });

  // Camera Vision
  async function openCamera() {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: isAndroid ? 'environment' : 'user' }
      });
      if (webcamFeed) webcamFeed.srcObject = webcamStream;
    } catch (err) {
      if (visionResults) visionResults.textContent = 'Camera permission denied or camera not found.';
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
        if (data.success && data.analysis) {
          if (visionResults) visionResults.textContent = data.analysis;
          appendChatMessage('nutty', `[OPTICAL SCAN]: ${data.analysis}`);
          speakText(data.analysis);
        }
      } catch (e) {
        if (visionResults) visionResults.textContent = 'Vision scan server offline.';
      }
    });
  }

  // Visualizer
  function initCanvasVisualizer() {
    const canvas = document.getElementById('arcVisualizer');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;
    const size = Math.min(container.offsetWidth, container.offsetHeight);
    canvas.width  = size;
    canvas.height = size;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let angle = 0;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      angle += 0.02;

      ctx.beginPath();
      ctx.arc(centerX, centerY, canvas.width * 0.44, angle, angle + Math.PI * 1.5);
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.6)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, canvas.width * 0.38, -angle * 1.5, -angle * 1.5 + Math.PI);
      ctx.strokeStyle = 'rgba(255, 183, 0, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      requestAnimationFrame(draw);
    }
    draw();
  }
  initCanvasVisualizer();

});
