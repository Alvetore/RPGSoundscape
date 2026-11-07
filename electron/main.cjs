const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');

// Keep app.getPath('userData') predictable and aligned with run.py
// (%APPDATA%\RPGSoundscape\storage) so both launch methods share data.
app.setName('RPGSoundscape');

let mainWindow = null;
let pythonProcess = null;
let backendLogs = [];
let backendToken = crypto.randomBytes(32).toString('base64url');

function getRootDir() {
  if (app.isPackaged) {
    const resPath = process.resourcesPath;
    if (fs.existsSync(path.join(resPath, 'backend', 'app.py'))) {
      return resPath;
    }
    const exeDir = path.dirname(process.execPath);
    if (fs.existsSync(path.join(exeDir, 'backend', 'app.py'))) {
      return exeDir;
    }
  }
  return path.resolve(__dirname, '..');
}

const ROOT_DIR = getRootDir();
const PORT = 8000;

function getDataDir() {
  return path.join(app.getPath('userData'), 'storage');
}

function readBackendToken() {
  try {
    const tokenPath = path.join(getDataDir(), 'data', '.api_token');
    return fs.readFileSync(tokenPath, 'utf8').trim();
  } catch (e) {
    return '';
  }
}

function appendLog(line) {
  const formatted = `[${new Date().toLocaleTimeString()}] ${line}`;
  backendLogs.push(formatted);
  if (backendLogs.length > 50) backendLogs.shift();
  try {
    const logPath = path.join(path.dirname(process.execPath), 'backend_startup.log');
    fs.appendFileSync(logPath, formatted + '\n');
  } catch (e) {}
  console.log(line);
}

function testPython(candidate) {
  try {
    const pyDir = candidate.includes('\\') ? path.dirname(candidate) : '';
    let env = { ...process.env };
    if (pyDir) {
      env.PATH = `${pyDir};${path.join(pyDir, 'Scripts')};${path.join(pyDir, 'Library', 'bin')};${env.PATH || ''}`;
    }
    const res = execFileSync(candidate, ['-c', 'import fastapi, yt_dlp, uvicorn, multipart; print("OK")'], {
      timeout: 3500,
      encoding: 'utf-8',
      env: env,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return res && res.trim().includes('OK');
  } catch (e) {
    return false;
  }
}

function findPython() {
  const userProfile = process.env.USERPROFILE || '';
  const localAppData = process.env.LOCALAPPDATA || '';

  const candidates = [
    // 1. AppData Programs Python (Clean standard CPython 3.12 / 3.13)
    path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe'),
    // 2. Conda installations
    path.join(userProfile, 'miniconda3', 'python.exe'),
    path.join(userProfile, 'anaconda3', 'python.exe'),
    // 3. Fallback
    'python',
    'py'
  ];

  // First pass: find candidate that has all dependencies installed
  for (const candidate of candidates) {
    if (candidate.includes('\\') && !fs.existsSync(candidate)) continue;
    appendLog(`Testing Python candidate: ${candidate}`);
    if (testPython(candidate)) {
      appendLog(`Verified Python with all dependencies: ${candidate}`);
      return candidate;
    }
  }

  // Second pass: fallback to any existing Python interpreter
  for (const candidate of candidates) {
    if (candidate.includes('\\')) {
      if (fs.existsSync(candidate)) {
        appendLog(`Fallback to existing Python: ${candidate}`);
        return candidate;
      }
    } else {
      return candidate;
    }
  }
  return 'python';
}

function checkServerReady(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve(res.statusCode === 200 && body.includes('RPG Music'));
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.abort();
      resolve(false);
    });
  });
}

async function waitForBackend(port, maxWaitMs = 25000) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const ready = await checkServerReady(port);
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function startBackend() {
  return new Promise(async (resolve) => {
    appendLog('Starting backend initialization...');
    
    // Check if already running (e.g. from a previous instance or terminal)
    const alreadyUp = await checkServerReady(PORT);
    if (alreadyUp) {
      const existingToken = readBackendToken();
      if (existingToken) {
        backendToken = existingToken;
        appendLog(`Backend is already alive on port ${PORT}; reused its API token`);
      } else {
        appendLog(`Backend is already alive on port ${PORT}, but its API token was not found`);
      }
      return resolve(true);
    }

    // Reuse the persisted token so an already paired phone stays authorized
    // after the desktop app restarts.
    const storedToken = readBackendToken();
    if (storedToken) {
      backendToken = storedToken;
      appendLog('Reusing persisted API token');
    } else {
      backendToken = crypto.randomBytes(32).toString('base64url');
    }

    const pyExe = findPython();
    const backendDir = path.join(ROOT_DIR, 'backend');
    const appPy = path.join(backendDir, 'app.py');

    if (!fs.existsSync(appPy)) {
      appendLog(`ERROR: Backend entry script not found: ${appPy}`);
      dialog.showErrorBox(
        'Ошибка: файл сервера не найден',
        `Не найден файл запуска бэкенда:\n${appPy}\n\nROOT_DIR: ${ROOT_DIR}`
      );
      return resolve(false);
    }

    // Set up PATH including Python Scripts and Conda Library/bin if available
    const pyDir = pyExe.includes('\\') ? path.dirname(pyExe) : '';
    let envPath = process.env.PATH || '';
    if (pyDir) {
      const condaBins = [
        pyDir,
        path.join(pyDir, 'Scripts'),
        path.join(pyDir, 'Library', 'bin'),
        path.join(pyDir, 'Library', 'usr', 'bin')
      ];
      envPath = `${condaBins.join(';')};${envPath}`;
    }

    appendLog(`Spawning Python process: "${pyExe}" "${appPy}" in cwd: "${backendDir}"`);
    
    try {
      pythonProcess = spawn(pyExe, [appPy], {
        cwd: backendDir,
        env: {
          ...process.env,
          PORT: String(PORT),
          PATH: envPath,
          PYTHONPATH: backendDir,
          PYTHONUNBUFFERED: '1',
          RPG_DATA_DIR: getDataDir(),
          RPG_API_TOKEN: backendToken
        },
        stdio: 'pipe',
      });
    } catch (spawnErr) {
      appendLog(`Spawn exception: ${spawnErr.message}`);
      dialog.showErrorBox('Ошибка запуска Python', `Не удалось запустить процесс Python:\n${spawnErr.message}`);
      return resolve(false);
    }

    pythonProcess.stdout.on('data', (data) => {
      appendLog(`[Python]: ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      appendLog(`[Python err]: ${data.toString().trim()}`);
    });

    pythonProcess.on('error', (err) => {
      appendLog(`[Python process error]: ${err.message}`);
    });

    pythonProcess.on('exit', (code, signal) => {
      appendLog(`[Python exit]: code=${code}, signal=${signal}`);
      pythonProcess = null;
    });

    const isReady = await waitForBackend(PORT, 25000);
    appendLog(`Backend ready status after wait: ${isReady}`);
    
    if (!isReady) {
      const logDump = backendLogs.slice(-20).join('\n');
      dialog.showErrorBox(
        'Ошибка запуска бэкенда',
        `Не удалось подключиться к локальному аудио-серверу на порту ${PORT} за 25 секунд.\n\n` +
        `Python: ${pyExe}\n` +
        `Скрипт: ${appPy}\n\n` +
        `Журнал вывода:\n${logDump || 'Нет вывода'}`
      );
    }

    resolve(isReady);
  });
}

function getAppIcon() {
  const candidates = [
    path.join(ROOT_DIR, 'icon.ico'),
    path.join(ROOT_DIR, 'frontend', 'dist', 'icon-512.png'),
    path.join(ROOT_DIR, 'frontend', 'public', 'icon-512.png'),
    path.join(__dirname, '..', 'icon.ico')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    title: 'RPG Soundscape Studio',
    backgroundColor: '#0c0e14',
    icon: getAppIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  const tokenQuery = backendToken ? `?token=${encodeURIComponent(backendToken)}` : '';
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/${tokenQuery}`);

  // The application is a single local page. Never navigate the main window
  // to external sites or open untrusted popup windows.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) {
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    appendLog('RPG Soundscape Studio starting up in Electron...');
    await startBackend();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

function cleanup() {
  if (pythonProcess) {
    appendLog('Terminating Python backend process...');
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', pythonProcess.pid, '/f', '/t']);
      } else {
        pythonProcess.kill('SIGINT');
      }
    } catch (e) {
      appendLog(`Error stopping backend: ${e.message}`);
    }
    pythonProcess = null;
  }
}

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  cleanup();
});
