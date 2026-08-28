const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

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
  'file explorer': 'explorer'
};

function searchAndLaunchApp(query, callback) {
  const clean = query.toLowerCase().trim();
  const alias = APP_ALIASES[clean];
  
  if (alias) {
    if (alias.startsWith('start ')) {
      exec(alias, callback);
    } else {
      exec(`start "" "${alias}"`, (err) => {
        if (!err) return callback(null, alias);
        fallbackSearchAndLaunch(clean, callback);
      });
    }
    return;
  }

  exec(`start "" "${clean}"`, (err) => {
    if (!err) return callback(null, clean);
    fallbackSearchAndLaunch(clean, callback);
  });
}

function fallbackSearchAndLaunch(target, callback) {
  const searchDirs = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs')
  ];

  let foundPath = null;

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          scanDir(fullPath);
          if (foundPath) return;
        } else if (item.isFile()) {
          const lowerName = item.name.toLowerCase();
          if ((lowerName.endsWith('.lnk') || lowerName.endsWith('.exe')) && lowerName.includes(target)) {
            foundPath = fullPath;
            return;
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  for (const dir of searchDirs) {
    scanDir(dir);
    if (foundPath) break;
  }

  if (foundPath) {
    console.log('Found Start Menu shortcut:', foundPath);
    exec(`start "" "${foundPath}"`, callback);
  } else {
    console.log('Attempting generic start for:', target);
    exec(`start "" "${target}"`, callback);
  }
}

// Test with calc
searchAndLaunchApp('calc', (err, res) => console.log('Test calc result:', err || res || 'Success'));
