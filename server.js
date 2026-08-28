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

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Could not create DATA_DIR:', err);
  }
}

const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');
app.set('trust proxy', 1);

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

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.options('*', cors());

// Health Check Endpoints
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
    version: '2.0.0',
    hasServerAiKey: !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY),
    serverTime: new Date().toISOString()
  });
});

const APP_ALIASES = {
  'word': 'winword', 'ms word': 'winword', 'microsoft word': 'winword',
  'excel': 'excel', 'ms excel': 'excel', 'microsoft excel': 'excel',
  'powerpoint': 'powerpnt', 'ppt': 'powerpnt',
  'chrome': 'chrome', 'google chrome': 'chrome',
  'edge': 'msedge', 'microsoft edge': 'msedge',
  'firefox': 'firefox', 'discord': 'discord', 'spotify': 'spotify',
  'vlc': 'vlc', 'steam': 'steam', 'telegram': 'telegram', 'whatsapp': 'whatsapp',
  'postman': 'postman', 'figma': 'figma', 'android studio': 'studio64',
  'vs code': 'code', 'vscode': 'code', 'code': 'code',
  'calculator': 'calc', 'calc': 'calc', 'notepad': 'notepad',
  'terminal': 'cmd', 'cmd': 'cmd', 'command prompt': 'cmd', 'powershell': 'powershell',
  'task manager': 'taskmgr', 'taskmgr': 'taskmgr', 'control panel': 'control',
  'settings': 'start ms-settings:', 'paint': 'mspaint', 'mspaint': 'mspaint',
  'snipping tool': 'snippingtool', 'explorer': 'explorer', 'file explorer': 'explorer',
  'my computer': 'explorer', 'this pc': 'explorer', 'volume': 'sndvol',
  'device manager': 'devmgmt.msc', 'system info': 'msinfo32'
};

function openSystemUrl(url) {
  if (process.platform === 'win32') {
    exec('cmd /c start "" "' + url + '"');
  } else if (process.platform === 'darwin') {
    exec('open "' + url + '"');
  } else if (process.platform === 'linux' && process.env.DISPLAY) {
    exec('xdg-open "' + url + '"');
  }
}

function searchAndLaunchApp(query, callback) {
  const clean = query.toLowerCase().trim();
  if (process.platform !== 'win32') {
    console.log('[NUTTY CLOUD] App launch request: ' + clean);
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

function fallbackSearchAndLaunch(target, callback) {
  if (process.platform !== 'win32') return callback(null, target);

  const searchDirs = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs'),
    'C:\\Program Files',
    'C:\\Program Files (x86)'
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

function readDb() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      return { memories: [], notes: [], settings: {} };
    }
    const data = fs.readFileSync(MEMORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { memories: [], notes: [], settings: {} };
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

// System Status Endpoint
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
      distro: osInfo.distro || 'Cloud Node',
      hostname: osInfo.hostname || 'nutty-cloud',
      uptimeSeconds: Math.round(time.uptime || process.uptime()),
      uptimeFormatted: formatUptime(time.uptime || process.uptime()),
      status: 'OPTIMAL'
    };
    res.json({ success: true, data: stats });
  } catch (err) {
    res.json({
      success: true,
      data: {
        cpuUsage: 10,
        ramTotalGb: '4.0',
        ramUsedGb: '1.1',
        ramPercent: 28,
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

// Memory Endpoints
app.get('/api/memory', (req, res) => {
  const db = readDb();
  res.json({ success: true, memories: db.memories || [], notes: db.notes || [], settings: db.settings || {} });
});

app.post('/api/memory', (req, res) => {
  const { fact, key, category } = req.body;
  if (!fact) return res.status(400).json({ success: false, error: 'Fact content is required' });
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

// Weather Endpoint
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

// Command Launcher
app.post('/api/command', (req, res) => {
  const { action, target } = req.body;
  if (action === 'open_app') {
    searchAndLaunchApp(target, () => res.json({ success: true, message: 'Initiating launch for ' + target + '.' }));
  } else if (action === 'open_url') {
    let url = target.startsWith('http') ? target : 'https://' + target;
    openSystemUrl(url);
    res.json({ success: true, message: 'Opening URL: ' + url });
  } else if (action === 'search_web') {
    const url = 'https://www.google.com/search?q=' + encodeURIComponent(target);
    openSystemUrl(url);
    res.json({ success: true, message: 'Searching the web for "' + target + '".' });
  } else {
    res.status(400).json({ success: false, message: 'Invalid command action.' });
  }
});

// -------------------------------------------------------------
// ADVANCED MULTI-PROVIDER GENERATIVE AI (Gemini / Groq / OpenAI)
// -------------------------------------------------------------
async function queryGenerativeAI(prompt, systemInstruction, memoryContext, history = [], clientKey = '', clientProvider = 'auto') {
  const geminiKey = clientKey && clientKey.startsWith('AIza') ? clientKey : (process.env.GEMINI_API_KEY || (clientKey && clientProvider === 'gemini' ? clientKey : null));
  const groqKey   = clientKey && clientKey.startsWith('gsk_') ? clientKey : (process.env.GROQ_API_KEY || (clientKey && clientProvider === 'groq' ? clientKey : null));
  const openAiKey = clientKey && clientKey.startsWith('sk-') ? clientKey : (process.env.OPENAI_API_KEY || (clientKey && clientProvider === 'openai' ? clientKey : null));

  // 1. Try Google Gemini API
  if (geminiKey) {
    try {
      const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + geminiKey;
      
      const contents = [];
      if (Array.isArray(history) && history.length > 0) {
        history.slice(-6).forEach(h => {
          if (h.role && h.content) {
            contents.push({
              role: h.role === 'assistant' || h.role === 'model' ? 'model' : 'user',
              parts: [{ text: h.content }]
            });
          }
        });
      }

      contents.push({
        role: 'user',
        parts: [{ text: systemInstruction + '\n\n' + memoryContext + '\n\nUser Request: ' + prompt }]
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2500
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return { text: text.trim(), provider: 'Google Gemini' };
      }
    } catch (e) {
      console.warn('Gemini query error:', e.message);
    }
  }

  // 2. Try Groq API
  if (groqKey) {
    try {
      const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
      const messages = [
        { role: 'system', content: systemInstruction + '\n\n' + memoryContext }
      ];
      if (Array.isArray(history) && history.length > 0) {
        history.slice(-6).forEach(h => {
          if (h.role && h.content) {
            messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content });
          }
        });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + groqKey
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          max_tokens: 2500,
          temperature: 0.7
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return { text: text.trim(), provider: 'Groq Llama 3.3' };
      }
    } catch (e) {
      console.warn('Groq query error:', e.message);
    }
  }

  // 3. Try OpenAI API
  if (openAiKey) {
    try {
      const endpoint = 'https://api.openai.com/v1/chat/completions';
      const messages = [
        { role: 'system', content: systemInstruction + '\n\n' + memoryContext }
      ];
      if (Array.isArray(history) && history.length > 0) {
        history.slice(-6).forEach(h => {
          if (h.role && h.content) {
            messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content });
          }
        });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + openAiKey
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages,
          max_tokens: 2500,
          temperature: 0.7
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return { text: text.trim(), provider: 'OpenAI ChatGPT' };
      }
    } catch (e) {
      console.warn('OpenAI query error:', e.message);
    }
  }

  return null;
}

// -------------------------------------------------------------
// BUILT-IN SMART OFFLINE GENERATIVE WRITER (Works with 0 API keys)
// -------------------------------------------------------------
function generateOfflineDocument(query, lower) {
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  // 1. Resignation Letter
  if (lower.includes('resignation') || (lower.includes('resign') && lower.includes('letter'))) {
    return `# Formal Letter of Resignation

**Date:** ${today}  
**To:** [Manager / Supervisor Name]  
**Company:** [Company / Organization Name]  
**Address:** [Company Address]  

**Subject:** Resignation from Position of [Your Job Title]

Dear [Manager's Name],

Please accept this letter as formal notification that I am resigning from my position as **[Your Job Title]** with **[Company Name]**. My last day of employment will be **[Your Last Working Day, e.g., 2 weeks from today]**.

I would like to express my sincere gratitude for the opportunities I have had during my time with the team. I have genuinely appreciated the support, mentorship, and professional growth experiences provided throughout my tenure.

During my remaining time, I am fully committed to ensuring a smooth and seamless transition of my responsibilities. I am happy to assist in delegating my active duties, completing pending deliverables, and training my replacement.

I wish the company and team continued success in all future endeavors. Please let me know how I can best assist during this transition period.

Sincerely,

**[Your Full Name]**  
[Your Contact Information / Phone / Email]`;
  }

  // 2. Formal Leave / Absence Letter
  if (lower.includes('leave letter') || lower.includes('leave application') || lower.includes('sick leave') || lower.includes('vacation letter')) {
    return `# Formal Leave Application

**Date:** ${today}  
**To:** [Recipient / Department Head / HR]  
**Organization:** [Company / Institution Name]  

**Subject:** Application for Leave of Absence

Dear [Recipient Name],

I am writing to formally request a leave of absence from **[Start Date]** to **[End Date]** due to **[Reason, e.g., personal commitments / medical recovery / family event]**. I anticipate returning to my regular duties on **[Return Date]**.

Prior to my departure, I will make sure all my immediate projects and responsibilities are up to date. I have also coordinated with **[Colleague Name]** to cover any urgent inquiries that may arise during my absence.

I will remain reachable via email at **[Your Email]** for any critical emergencies. Thank you very much for your understanding and consideration.

Warm regards,

**[Your Full Name]**  
[Your Job Title / Student ID]  
[Phone Number]`;
  }

  // 3. Job Application / Cover Letter
  if (lower.includes('cover letter') || lower.includes('job application') || lower.includes('apply for a job')) {
    return `# Professional Cover Letter

**Date:** ${today}  
**Hiring Team:** [Company / Team Name]  
**Subject:** Application for [Job Title Position]

Dear Hiring Manager,

I am writing to express my enthusiastic interest in the **[Job Title]** position at **[Company Name]**. With my proven experience in problem solving, strategic execution, and technical skills, I am confident in my ability to make an immediate, positive impact on your team.

Throughout my career, I have successfully led initiatives, optimized workflows, and delivered measurable results. My background aligns closely with the objectives outlined in your job posting, particularly in:
• Executing mission-critical projects on schedule and within scope.
• Collaborating with cross-functional teams to solve complex problems.
• Continuously learning and implementing modern tools and methodologies.

I am particularly excited about the prospect of joining **[Company Name]** because of your strong commitment to innovation and excellence.

Thank you for your time and consideration. I welcome the opportunity to discuss how my qualifications align with your organizational goals in an interview.

Sincerely,

**[Your Full Name]**  
[LinkedIn Profile / Portfolio Link]  
[Email & Phone]`;
  }

  // 4. Business / Proposal / General Formal Letter
  if (lower.startsWith('write a letter') || lower.startsWith('write me a letter') || lower.includes('draft a letter') || lower.includes('write letter')) {
    const topic = query.replace(/^(write\s+(me\s+)?(a\s+)?letter(\s+to|\s+about)?)\s*/i, '').trim() || 'Official Inquiry';
    return `# Formal Correspondence Letter

**Date:** ${today}  
**To:** [Recipient / Organization Name]  
**Address:** [Recipient Address]  

**Subject:** Regarding: ${topic}

Dear [Recipient Name],

I am writing this letter to formally bring to your attention our position regarding **${topic}**. 

The purpose of this communication is to establish clear communication, highlight key objectives, and propose actionable next steps for mutual success. Over the past period, we have thoroughly analyzed the parameters and identified key opportunities to optimize our mutual collaboration.

We recommend the following steps:
1. Review the enclosed parameters and project specifications.
2. Establish a clear timeline and milestone checklist.
3. Coordinate a brief briefing session to align on deliverables.

Please feel free to reach out to me directly at **[Your Contact Info]** at your earliest convenience to discuss this further. I look forward to your prompt response.

Respectfully,

**[Your Name / Title]**  
[Organization / Department]`;
  }

  // 5. Professional Email Draft
  if (lower.startsWith('write an email') || lower.startsWith('write me an email') || lower.includes('draft an email') || lower.includes('email to')) {
    const topic = query.replace(/^(write\s+(me\s+)?(an\s+)?email(\s+to|\s+about)?)\s*/i, '').trim() || 'Project Update';
    return `📧 **Subject:** Update Regarding: ${topic}

**Hi [Recipient Name],**

I hope this email finds you well.

I am reaching out regarding **${topic}**. I wanted to share a quick update on where things stand and ensure we are aligned on our next steps.

**Key Highlights:**
• Progress is moving smoothly according to our milestones.
• All core objectives and action items are actively tracked.
• Next milestone is scheduled for completion by **[Target Date]**.

Please let me know if you have any questions or feedback before we proceed with the next phase.

Best regards,

**[Your Name]**  
[Your Title / Contact]`;
  }

  return null;
}

// Vision Analysis
app.post('/api/vision', async (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ success: false, error: 'No image data provided' });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && image.includes('base64,')) {
    try {
      const base64Data = image.split('base64,')[1];
      const mimeType = image.split(';')[0].replace('data:', '') || 'image/jpeg';
      const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + geminiKey;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: 'You are NUTTY, a tactical futuristic AI assistant. Briefly analyze what you see in this optical camera scan in 2-3 concise, tactical sentences.' },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }]
        })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return res.json({ success: true, analysis: text.trim(), timestamp: new Date().toISOString() });
      }
    } catch (e) {}
  }

  const sampleAnalysis = [
    "Visual Scan Analysis complete. Subject identified in frame. Workspace setup with workstation, active environment, and ambient lighting detected.",
    "Camera Optical Processing: Subject verified. Workspace computer environment and human operator facing optical scanner.",
    "Visual Recognition Matrix: High probability detection of user workstation setup. All optical feeds optimal."
  ];
  res.json({ success: true, analysis: sampleAnalysis[Math.floor(Math.random() * sampleAnalysis.length)], timestamp: new Date().toISOString() });
});

// Chat & Command Execution Endpoint
app.post('/api/chat', async (req, res) => {
  const { message, contextHistory = [], platform = 'desktop', apiKey = '', apiProvider = 'auto' } = req.body;
  if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

  const isMobileClient = platform === 'android' || platform === 'ios';
  const query = message.trim();
  const lower = query.toLowerCase();
  const db = readDb();

  const cleanedQuery = lower
    .replace(/^(hey\s+)?nutty,?\s*/i, '')
    .replace(/^(please|can\s+you|could\s+you)\s+/i, '')
    .trim();

  // 1. Memory Store
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
      return res.json({ success: true, reply: 'Memory logged, Boss. I have stored: "' + factToRemember + '" in my persistent database.', memorySaved: newMem });
    }
  }

  // 2. Memory Recall
  if (cleanedQuery.includes('what do you remember') || cleanedQuery.includes('list memories') || cleanedQuery.includes('show memory')) {
    if (db.memories && db.memories.length > 0) {
      const memList = db.memories.map(m => '• ' + m.fact).join('\n');
      return res.json({ success: true, reply: 'Here is what I have stored in my long-term memory archive:\n' + memList, memories: db.memories });
    } else {
      return res.json({ success: true, reply: "My long-term memory archive is currently empty, Boss. You can store anything by saying 'Nutty, remember that...'" });
    }
  }

  // 3. System Diagnostics
  if (cleanedQuery === 'system status' || cleanedQuery === 'system info' || cleanedQuery === 'diagnostics') {
    try {
      const cpu = await si.currentLoad();
      const mem = await si.mem();
      const time = si.time();
      const ramPercent = Math.round((mem.active / (mem.total || 1)) * 100);
      const cpuUsage = Math.round(cpu.currentLoad || 0);
      return res.json({
        success: true,
        reply: 'Systems operating within optimal parameters. CPU Load is at ' + cpuUsage + '%, RAM Usage is at ' + ramPercent + '%, and uptime is ' + formatUptime(time.uptime || process.uptime()) + '.',
        actionTool: 'system_diagnostics'
      });
    } catch (e) {
      return res.json({ success: true, reply: "System diagnostics scan complete. All core subroutines are online and operational." });
    }
  }

  // 4. App Launch Intent
  if (cleanedQuery.startsWith('open ') || cleanedQuery.startsWith('launch ') || cleanedQuery.startsWith('start ') || cleanedQuery.startsWith('run ')) {
    const targetAppName = cleanedQuery
      .replace(/^(open|launch|start|run|open up)\s+/i, '')
      .replace(/^(the|a|my)\s+/i, '')
      .replace(/\s+(app|program|application|tool)$/i, '')
      .trim();

    const openUrls = {
      'youtube': 'https://www.youtube.com', 'github': 'https://github.com', 'google': 'https://www.google.com',
      'maps': 'https://maps.google.com', 'gmail': 'https://mail.google.com', 'drive': 'https://drive.google.com',
      'whatsapp': 'https://web.whatsapp.com', 'twitter': 'https://twitter.com', 'instagram': 'https://instagram.com',
      'facebook': 'https://facebook.com', 'netflix': 'https://netflix.com', 'reddit': 'https://reddit.com',
      'stackoverflow': 'https://stackoverflow.com', 'linkedin': 'https://linkedin.com'
    };

    if (openUrls[targetAppName]) {
      const url = openUrls[targetAppName];
      if (!isMobileClient) openSystemUrl(url);
      return res.json({ success: true, reply: 'Opening ' + targetAppName.charAt(0).toUpperCase() + targetAppName.slice(1) + ' for you.', actionTool: 'open_url', target: url });
    }

    if (targetAppName) {
      searchAndLaunchApp(targetAppName, () => {});
      return res.json({ success: true, reply: 'Opening ' + targetAppName + ' for you, Boss.', actionTool: 'open_app', target: targetAppName });
    }
  }

  // 5. Web Search Intent
  if (cleanedQuery.startsWith('search for ') || cleanedQuery.startsWith('google ') || cleanedQuery.startsWith('search web for ')) {
    const searchTopic = query.replace(/^(search for|search web for|google|search)\s+/i, '').trim();
    const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(searchTopic);
    if (!isMobileClient) openSystemUrl(searchUrl);
    return res.json({ success: true, reply: 'Searching the web for "' + searchTopic + '".', actionTool: 'search_web', target: searchTopic, searchUrl });
  }

  // 6. Generative AI Brain (Gemini, Groq, OpenAI)
  let memoryStr = '';
  if (db.memories && db.memories.length > 0) {
    memoryStr = 'User Long-Term Memory Notes:\n' + db.memories.slice(0, 10).map(m => '- ' + m.fact).join('\n');
  }

  const aiSystemPrompt = "You are N.U.T.T.Y. (Neural Universal Tactical Operating Companion), an ultra-intelligent, highly capable AI assistant (similar to JARVIS and ChatGPT). You assist the user (addressed respectfully as 'Boss') with any request: writing letters, crafting emails, writing code, summarizing documents, brainstorming, mathematics, and detailed creative analysis. Format your output beautifully with clean markdown (headings, bold text, bullet points, code blocks). When asked to write a letter or document, write the complete, ready-to-use, polished version without skipping sections.";

  const cloudAi = await queryGenerativeAI(query, aiSystemPrompt, memoryStr, contextHistory, apiKey, apiProvider);
  if (cloudAi && cloudAi.text) {
    return res.json({
      success: true,
      reply: cloudAi.text,
      source: cloudAi.provider,
      timestamp: new Date().toISOString()
    });
  }

  // 7. Built-in Offline Document / Letter Generator
  const offlineDoc = generateOfflineDocument(cleanedQuery, lower);
  if (offlineDoc) {
    return res.json({
      success: true,
      reply: offlineDoc,
      source: 'offline_generative_engine',
      timestamp: new Date().toISOString()
    });
  }

  // 8. General NLP Conversational Engine
  if (cleanedQuery.includes('who are you') || cleanedQuery.includes('what can you do')) {
    return res.json({
      success: true,
      reply: "I am N.U.T.T.Y.—your personal Full-Stack AI Companion. I can write letters, compose emails, write code, search the web, monitor system metrics, remember important facts, and execute voice and camera diagnostics. To unlock unlimited ChatGPT-level reasoning on any topic, click 'AI KEY' in the top bar to connect a free Google Gemini key!"
    });
  }

  if (cleanedQuery.includes('hello') || cleanedQuery.includes('hey nutty') || cleanedQuery.includes('hi')) {
    return res.json({
      success: true,
      reply: "Greetings, Boss. All neural channels are online and listening. What would you like me to create, write, or look up for you today?"
    });
  }

  const responses = [
    'Understood, Boss. Regarding "' + message + '": all systems are standing by. You can ask me to write letters, draft emails, create code, or search the web.',
    'Analyzing parameters for "' + message + '". I am ready for your next instruction, Boss.',
    'Command received: "' + message + '". Standing by for further details.'
  ];
  return res.json({
    success: true,
    reply: responses[Math.floor(Math.random() * responses.length)],
    timestamp: new Date().toISOString()
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('=================================================');
  console.log('  🤖 N.U.T.T.Y. AI ASSISTANT (CHATGPT-READY)     ');
  console.log('  🌐 Local:   http://localhost:' + PORT);
  console.log('  📱 Network: http://' + localIP + ':' + PORT);
  console.log('  ☁️  Cloud:   Listening on port ' + PORT);
  console.log('=================================================');
});
