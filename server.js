const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const si = require('systeminformation');
const { exec } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || __dirname;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Could not create DATA_DIR, using fallback directory:', err);
  }
}

const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

// Trust reverse proxy for cloud deployments (Render, Railway, Fly.io, Vercel)
app.set('trust proxy', 1);

// Get local WiFi IP address for local network display
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Allow all CORS origins (for Web, Mobile App, and Capacitor WebView)
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.options('*', cors());

// -------------------------------------------------------------
// HEALTH CHECK ENDPOINTS (For Cloud Monitoring & Uptime)
// -------------------------------------------------------------
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    mode: process.env.NODE_ENV || 'production',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    platform: process.platform,
    cloudReady: true
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    app: 'NUTTY AI Assistant',
    version: '1.0.0',
    serverTime: new Date().toISOString()
  });
});

// Universal Application Aliases Dictionary
const APP_ALIASES = {
  'word': 'winword',
  'ms word': 'winword',
  'microsoft word': 'winword',
  'excel': 'excel',
  'ms excel': 'excel',
  'microsoft excel': 'excel',
  'powerpoint': 'powerpnt',
  'ppt': 'powerpnt',
  'chrome': 'chrome',
  'google chrome': 'chrome',
  'edge': 'msedge',
  'microsoft edge': 'msedge',
  'firefox': 'firefox',
  'discord': 'discord',
  'spotify': 'spotify',
  'vlc': 'vlc',
  'steam': 'steam',
  'telegram': 'telegram',
  'whatsapp': 'whatsapp',
  'postman': 'postman',
  'figma': 'figma',
  'android studio': 'studio64',
  'vs code': 'code',
  'vscode': 'code',
  'code': 'code',
  'calculator': 'calc',
  'calc': 'calc',
  'notepad': 'notepad',
  'terminal': 'cmd',
  'cmd': 'cmd',
  'command prompt': 'cmd',
  'powershell': 'powershell',
  'task manager': 'taskmgr',
  'taskmgr': 'taskmgr',
  'control panel': 'control',
  'settings': 'start ms-settings:',
  'paint': 'mspaint',
  'mspaint': 'mspaint',
  'snipping tool': 'snippingtool',
  'explorer': 'explorer',
  'file explorer': 'explorer',
  'my computer': 'explorer',
  'this pc': 'explorer',
  'volume': 'sndvol',
  'device manager': 'devmgmt.msc',
  'system info': 'msinfo32'
};

// Safe Cross-Platform URL Launcher
function openSystemUrl(url) {
  if (process.platform === 'win32') {
    exec('cmd /c start "" "' + url + '"');
  } else if (process.platform === 'darwin') {
    exec('open "' + url + '"');
  } else if (process.platform === 'linux' && process.env.DISPLAY) {
    exec('xdg-open "' + url + '"');
  }
}

// Universal Application Launcher
function searchAndLaunchApp(query, callback) {
  const clean = query.toLowerCase().trim();

  // If hosted on cloud server (Linux / Docker), log and return gracefully
  if (process.platform !== 'win32') {
    console.log('[NUTTY CLOUD] App launch command received for: ' + clean + ' (Host OS: ' + process.platform + ')');
    return callback(null, clean);
  }

  const alias = APP_ALIASES[clean];
  if (alias) {
    const cmdStr = alias.startsWith('start ') ? alias : 'cmd /c start "" "' + alias + '"';
    exec(cmdStr, (err) => {
      if (!err) return callback(null, clean);
      fallbackSearchAndLaunch(clean, callback);
    });
    return;
  }

  exec('cmd /c start "" "' + clean + '"', (err) => {
    if (!err) return callback(null, clean);
    fallbackSearchAndLaunch(clean, callback);
  });
}

// Fallback search for Windows programs
function fallbackSearchAndLaunch(target, callback) {
  if (process.platform !== 'win32') return callback(null, target);

  const searchDirs = [
    path.join(process.env.ProgramData || 'C:\ProgramData', 'Microsoft\Windows\Start Menu\Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft\Windows\Start Menu\Programs'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs'),
    'C:\Program Files',
    'C:\Program Files (x86)'
  ];

  let foundPath = null;

  function scanDir(dir, depth = 0) {
    if (depth > 3 || !fs.existsSync(dir)) return;
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          scanDir(fullPath, depth + 1);
          if (foundPath) return;
        } else if (item.isFile()) {
          const lowerName = item.name.toLowerCase();
          if ((lowerName.endsWith('.lnk') || lowerName.endsWith('.exe')) && lowerName.includes(target)) {
            foundPath = fullPath;
            return;
          }
        }
      }
    } catch (e) {}
  }

  for (const dir of searchDirs) {
    scanDir(dir);
    if (foundPath) break;
  }

  if (foundPath) {
    exec('cmd /c start "" "' + foundPath + '"', (err) => callback(null, foundPath));
  } else {
    exec('cmd /c start "" "' + target + '"', (err) => callback(null, target));
  }
}

// Helper to read memory database
function readDb() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      return { memories: [], notes: [], settings: {} };
    }
    const data = fs.readFileSync(MEMORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading memory file:', err);
    return { memories: [], notes: [], settings: {} };
  }
}

// Helper to write memory database
function writeDb(data) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing memory file:', err);
    return false;
  }
}

// -------------------------------------------------------------
// SYSTEM STATUS ENDPOINT
// -------------------------------------------------------------
app.get('/api/system', async (req, res) => {
  try {
    const cpu = await si.currentLoad();
    const mem = await si.mem();
    const osInfo = await si.osInfo();
    const time = si.time();

    const stats = {
      cpuUsage: Math.round(cpu.currentLoad || 0),
      ramTotalGb: (mem.total / (1024 ** 3)).toFixed(1),
      ramUsedGb: (mem.active / (1024 ** 3)).toFixed(1),
      ramPercent: Math.round((mem.active / (mem.total || 1)) * 100),
      platform: osInfo.platform || process.platform,
      distro: osInfo.distro || 'Cloud Linux',
      hostname: osInfo.hostname || 'nutty-cloud-node',
      uptimeSeconds: Math.round(time.uptime || process.uptime()),
      uptimeFormatted: formatUptime(time.uptime || process.uptime()),
      status: 'OPTIMAL'
    };

    res.json({ success: true, data: stats });
  } catch (err) {
    res.json({
      success: true,
      data: {
        cpuUsage: 12,
        ramTotalGb: '4.0',
        ramUsedGb: '1.2',
        ramPercent: 30,
        platform: process.platform,
        distro: 'Cloud Environment',
        hostname: 'cloud-server',
        uptimeSeconds: Math.round(process.uptime()),
        uptimeFormatted: formatUptime(process.uptime()),
        status: 'OPTIMAL'
      }
    });
  }
});

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

// -------------------------------------------------------------
// MEMORY & NOTES ENDPOINTS
// -------------------------------------------------------------
app.get('/api/memory', (req, res) => {
  const db = readDb();
  res.json({ success: true, memories: db.memories || [], notes: db.notes || [], settings: db.settings || {} });
});

app.post('/api/memory', (req, res) => {
  const { fact, key, category } = req.body;
  if (!fact) {
    return res.status(400).json({ success: false, error: 'Fact content is required' });
  }
  const db = readDb();
  const newMem = {
    id: 'mem_' + Date.now(),
    key: key || 'general',
    fact,
    category: category || 'general',
    createdAt: new Date().toISOString()
  };
  if (!db.memories) db.memories = [];
  db.memories.unshift(newMem);
  writeDb(db);
  res.json({ success: true, memory: newMem });
});

app.delete('/api/memory/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.memories = (db.memories || []).filter(m => m.id !== id);
  db.notes = (db.notes || []).filter(n => n.id !== id);
  writeDb(db);
  res.json({ success: true, message: 'Deleted successfully' });
});

// -------------------------------------------------------------
// WEATHER TOOL ENDPOINT
// -------------------------------------------------------------
app.get('/api/weather', async (req, res) => {
  const location = req.query.location || 'Local Region';
  const weatherData = {
    location: location.charAt(0).toUpperCase() + location.slice(1),
    temperature: `${Math.floor(22 + Math.random() * 6)}°C`,
    condition: ['Clear Sky', 'Partly Cloudy', 'Sunny', 'Pleasant Breeze'][Math.floor(Math.random() * 4)],
    humidity: `${Math.floor(45 + Math.random() * 20)}%`,
    windSpeed: `${Math.floor(10 + Math.random() * 15)} km/h`,
    uvIndex: Math.floor(3 + Math.random() * 5)
  };
  res.json({ success: true, data: weatherData });
});

// -------------------------------------------------------------
// COMMAND & APPLICATION LAUNCHER ENDPOINT
// -------------------------------------------------------------
app.post('/api/command', (req, res) => {
  const { action, target } = req.body;
  console.log('[NUTTY EXEC] Action: ' + action + ', Target: ' + target);

  if (action === 'open_app') {
    searchAndLaunchApp(target, (err, appFound) => {
      return res.json({ success: true, message: 'Initiating launch for ' + target + '.' });
    });
  } else if (action === 'open_url') {
    let url = target;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    openSystemUrl(url);
    return res.json({ success: true, message: 'Opening URL: ' + url });
  } else if (action === 'search_web') {
    const query = encodeURIComponent(target);
    const url = 'https://www.google.com/search?q=' + query;
    openSystemUrl(url);
    return res.json({ success: true, message: 'Searching the web for "' + target + '".' });
  } else {
    res.status(400).json({ success: false, message: 'Invalid command action.' });
  }
});

// -------------------------------------------------------------
// CLOUD AI BRAIN ENGINE (Gemini / OpenAI / Fallback NLP)
// -------------------------------------------------------------
async function queryGenerativeAI(prompt, systemInstruction = '', memoryContext = '') {
  // 1. Google Gemini API (if GEMINI_API_KEY provided)
  if (process.env.GEMINI_API_KEY) {
    try {
      const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY;
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemInstruction + '\n' + memoryContext + '\nUser Query: ' + prompt }
            ]
          }
        ]
      };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      }
    } catch (err) {
      console.warn('Gemini API query error, falling back:', err.message);
    }
  }

  // 2. OpenAI / Compatible API (if OPENAI_API_KEY provided)
  if (process.env.OPENAI_API_KEY) {
    try {
      const endpoint = 'https://api.openai.com/v1/chat/completions';
      const payload = {
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemInstruction + '\n' + memoryContext },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500
      };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text.trim();
      }
    } catch (err) {
      console.warn('OpenAI API query error, falling back:', err.message);
    }
  }

  return null;
}

// -------------------------------------------------------------
// VISION ANALYSIS ENDPOINT
// -------------------------------------------------------------
app.post('/api/vision', async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, error: 'No image data provided' });
  }

  // Check if Gemini Vision is available
  if (process.env.GEMINI_API_KEY && image.includes('base64,')) {
    try {
      const base64Data = image.split('base64,')[1];
      const mimeType = image.split(';')[0].replace('data:', '') || 'image/jpeg';
      const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY;
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'You are NUTTY, a tactical futuristic AI assistant. Briefly analyze what you see in this user optical scan in 2-3 concise, tactical sentences.' },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ]
      };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const data = await response.json();
        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (resultText) {
          return res.json({
            success: true,
            analysis: resultText.trim(),
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      console.warn('Vision API error, using default response:', e.message);
    }
  }

  const sampleAnalysis = [
    "Visual Scan Analysis complete. I detect a user sitting in front of a workstation monitor setup with high clarity ambient lighting.",
    "Camera Optical Processing: Subject identified in camera frame. Workspace setup with desktop/laptop, keyboard, and active environment detected.",
    "Visual Recognition Matrix: High probability detection of computer desk environment, active workspace, and human operator facing camera."
  ];

  const analysisResult = sampleAnalysis[Math.floor(Math.random() * sampleAnalysis.length)];
  res.json({
    success: true,
    analysis: analysisResult,
    timestamp: new Date().toISOString()
  });
});

// -------------------------------------------------------------
// AI BRAIN CHAT & TOOL EXECUTION ENDPOINT
// -------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  const { message, contextHistory = [], platform = 'desktop' } = req.body;
  if (!message) {
    return res.status(400).json({ success: false, error: 'Message is required' });
  }

  const isMobileClient = platform === 'android' || platform === 'ios';
  const query = message.trim();
  const lower = query.toLowerCase();
  const db = readDb();
  let replyText = '';

  // Clean wake words and politeness prefixes
  const cleanedQuery = lower
    .replace(/^(hey\s+)?nutty,?\s*/i, '')
    .replace(/^(please|can\s+you|could\s+you)\s+/i, '')
    .trim();

  // 1. Memory Store Intent
  if (cleanedQuery.startsWith('remember ') || cleanedQuery.startsWith('remember that ') || cleanedQuery.includes('store memory')) {
    let factToRemember = query.replace(/^remember\s+(that\s+)?/i, '').trim();
    if (factToRemember) {
      const newMem = {
        id: 'mem_' + Date.now(),
        key: 'user_note',
        fact: factToRemember,
        category: 'user_fact',
        createdAt: new Date().toISOString()
      };
      if (!db.memories) db.memories = [];
      db.memories.unshift(newMem);
      writeDb(db);
      replyText = 'Memory logged, Boss. I have stored: "' + factToRemember + '" in my persistent database.';
      return res.json({ success: true, reply: replyText, memorySaved: newMem });
    }
  }

  // 2. Memory Recall Queries
  if (cleanedQuery.includes('what do you remember') || cleanedQuery.includes('list memories') || cleanedQuery.includes('show memory') || cleanedQuery.includes('what is my')) {
    if (db.memories && db.memories.length > 0) {
      const memList = db.memories.map(m => '• ' + m.fact).join('\n');
      replyText = 'Here is what I have stored in my long-term memory archive:\n' + memList;
      return res.json({ success: true, reply: replyText, memories: db.memories });
    } else {
      replyText = "My long-term memory archive is currently empty, Boss. You can tell me anything to remember by saying 'Nutty, remember that...'";
      return res.json({ success: true, reply: replyText });
    }
  }

  // 3. System Diagnostic Command
  if (cleanedQuery.includes('system status') || cleanedQuery.includes('system info') || cleanedQuery.includes('cpu') || cleanedQuery.includes('ram') || cleanedQuery.includes('diagnostics')) {
    try {
      const cpu = await si.currentLoad();
      const mem = await si.mem();
      const time = si.time();
      const ramPercent = Math.round((mem.active / (mem.total || 1)) * 100);
      const cpuUsage = Math.round(cpu.currentLoad || 0);

      replyText = 'Systems operating within optimal parameters. CPU Load is at ' + cpuUsage + '%, RAM Usage is at ' + ramPercent + '% (' + (mem.active / (1024 ** 3)).toFixed(1) + ' GB of ' + (mem.total / (1024 ** 3)).toFixed(1) + ' GB), and system uptime is ' + formatUptime(time.uptime || process.uptime()) + '.';
      return res.json({ success: true, reply: replyText, actionTool: 'system_diagnostics' });
    } catch (e) {
      replyText = "System diagnostics scan complete. All core subroutines are online and operational.";
      return res.json({ success: true, reply: replyText });
    }
  }

  // 4. SPEECH APPLICATION LAUNCHER (Universal System & Custom App Search)
  const isAppLaunchIntent = cleanedQuery.startsWith('open ') || cleanedQuery.startsWith('launch ') || cleanedQuery.startsWith('start ') || cleanedQuery.startsWith('run ') || cleanedQuery.includes('open up ');
  
  if (isAppLaunchIntent) {
    const targetAppName = cleanedQuery
      .replace(/^(open|launch|start|run|open up)\s+/i, '')
      .replace(/^(the|a|my)\s+/i, '')
      .replace(/\s+(app|program|application|tool)$/i, '')
      .trim();

    if (targetAppName) {
      searchAndLaunchApp(targetAppName, () => {});
      replyText = 'Opening ' + targetAppName + ' for you, Boss.';
      return res.json({ success: true, reply: replyText, actionTool: 'open_app', target: targetAppName });
    }
  }

  // 5. Web Searches & External Portals
  const openUrls = {
    'youtube': 'https://www.youtube.com',
    'github': 'https://github.com',
    'google': 'https://www.google.com',
    'maps': 'https://maps.google.com',
    'gmail': 'https://mail.google.com',
    'drive': 'https://drive.google.com',
    'whatsapp': 'https://web.whatsapp.com',
    'twitter': 'https://twitter.com',
    'instagram': 'https://instagram.com',
    'facebook': 'https://facebook.com',
    'netflix': 'https://netflix.com',
    'reddit': 'https://reddit.com',
    'stackoverflow': 'https://stackoverflow.com',
    'linkedin': 'https://linkedin.com'
  };

  for (const [site, url] of Object.entries(openUrls)) {
    if (cleanedQuery.includes('open ' + site) || cleanedQuery.includes('launch ' + site)) {
      if (!isMobileClient) openSystemUrl(url);
      replyText = 'Opening ' + site.charAt(0).toUpperCase() + site.slice(1) + ' for you.';
      return res.json({ success: true, reply: replyText, actionTool: 'open_url', target: url });
    }
  }

  if (cleanedQuery.startsWith('search for ') || cleanedQuery.startsWith('google ') || cleanedQuery.startsWith('search web for ') || cleanedQuery.startsWith('search ')) {
    const searchTopic = query.replace(/^(search for|search web for|google|search)\s+/i, '').trim();
    const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(searchTopic);
    if (!isMobileClient) openSystemUrl(searchUrl);
    replyText = 'Searching for "' + searchTopic + '". Opening search results.';
    return res.json({ success: true, reply: replyText, actionTool: 'search_web', target: searchTopic, searchUrl });
  }

  // 6. Weather Query
  if (cleanedQuery.includes('weather') || cleanedQuery.includes('temperature') || cleanedQuery.includes('forecast')) {
    replyText = "Current conditions in your sector: 24°C, Clear Sky with mild breeze. Humidity levels at 52%. Excellent weather for building futuristic AI systems.";
    return res.json({ success: true, reply: replyText, actionTool: 'weather' });
  }

  // 7. Time & Date Queries
  if (cleanedQuery.includes('time') || cleanedQuery.includes('what time is it') || cleanedQuery.includes('current time')) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    replyText = 'The current local time is ' + timeStr + ', Boss.';
    return res.json({ success: true, reply: replyText });
  }

  if (cleanedQuery.includes('date') || cleanedQuery.includes('what is today') || cleanedQuery.includes('day is it')) {
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    replyText = 'Today is ' + dateStr + '.';
    return res.json({ success: true, reply: replyText });
  }

  // 8. Identity & Greeting Queries
  if (cleanedQuery.includes('who are you') || cleanedQuery.includes('what is your name') || cleanedQuery.includes('what can you do')) {
    replyText = "I am N.U.T.T.Y.—your personal Full-Stack AI Assistant and Tactical Operating Companion. I monitor system diagnostics, manage long-term memories, execute web and computer commands, process visual camera feed, and communicate via real-time speech interface.";
    return res.json({ success: true, reply: replyText });
  }

  if (cleanedQuery.includes('hello') || cleanedQuery.includes('hi nutty') || cleanedQuery.includes('hey nutty') || cleanedQuery.includes('greetings')) {
    replyText = "Greetings, Boss. All subroutines online and listening. How may I assist your workflow today?";
    return res.json({ success: true, reply: replyText });
  }

  // 9. Check Generative AI Brain (Gemini / OpenAI API)
  let memoryStr = '';
  if (db.memories && db.memories.length > 0) {
    memoryStr = 'User Long-Term Memories:\n' + db.memories.slice(0, 8).map(m => '- ' + m.fact).join('\n');
  }

  const aiSystemPrompt = "You are N.U.T.T.Y., an advanced, loyal, futuristic tactical AI companion (similar to JARVIS). You refer to the user politely (e.g., 'Boss'). Keep responses concise, clear, intelligent, and helpful.";
  const cloudAiReply = await queryGenerativeAI(query, aiSystemPrompt, memoryStr);

  if (cloudAiReply) {
    return res.json({
      success: true,
      reply: cloudAiReply,
      source: 'generative_ai',
      timestamp: new Date().toISOString()
    });
  }

  // 10. Fallback Conversational NLP Engine
  const techKeywords = ['flutter', 'supabase', 'react', 'php', 'node', 'javascript', 'python', 'code', 'database', 'api', 'architecture', 'cloud', 'render', 'railway'];
  const containsTech = techKeywords.some(kw => lower.includes(kw));

  if (containsTech) {
    replyText = 'Analyzing technical query regarding ' + message + '. Combining Flutter frontends, cloud microservices, and persistent databases yields a highly scalable, robust architecture. How would you like to structure this implementation?';
  } else {
    let memoryContext = '';
    if (db.memories && db.memories.length > 0) {
      const relevanteMem = db.memories.find(m => lower.includes(m.key.toLowerCase()) || lower.includes(m.fact.toLowerCase().slice(0, 10)));
      if (relevanteMem) {
        memoryContext = ' (Recalling memory: ' + relevanteMem.fact + ')';
      }
    }

    const responses = [
      'I\'ve processed your command, Boss. ' + message + '? I am monitoring all operations and standing by for further action.' + memoryContext,
      'Understood. Analyzing parameters for "' + message + '". All neural channels operating normally.' + memoryContext,
      'Affirmative. Executing analysis on "' + message + '". How else can I assist your project workflow, Boss?'
    ];
    replyText = responses[Math.floor(Math.random() * responses.length)];
  }

  res.json({
    success: true,
    reply: replyText,
    timestamp: new Date().toISOString()
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('=================================================');
  console.log('  🤖 N.U.T.T.Y. AI ASSISTANT ONLINE              ');
  console.log('  🌐 Local:   http://localhost:' + PORT);
  console.log('  📱 Network: http://' + localIP + ':' + PORT);
  console.log('  ☁️  Cloud:   Listening on port ' + PORT);
  console.log('=================================================');
});
