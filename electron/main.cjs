const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let pythonProcess = null;
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = 8000;

function findPython() {
  const userProfile = process.env.USERPROFILE || '';
  const localAppData = process.env.LOCALAPPDATA || '';

  const candidates = [
    'python',
    'py',
    path.join(userProfile, 'miniconda3', 'python.exe'),
    path.join(userProfile, 'anaconda3', 'python.exe'),
  ];

  // Also check AppData python
  if (localAppData) {
    const pyDir = path.join(localAppData, 'Programs', 'Python');
    if (fs.existsSync(pyDir)) {
      try {
        const dirs = fs.readdirSync(pyDir);
        for (const d of dirs) {
          const exe = path.join(pyDir, d, 'python.exe');
          if (fs.existsSync(exe)) candidates.push(exe);
        }
      } catch (e) {}
    }
  }

  for (const candidate of candidates) {
    if (candidate.includes('\\') && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'python'; // fallback to PATH
}

function checkServerReady(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.abort();
      resolve(false);
    });
  });
}

async function waitForBackend(port, maxWaitMs = 12000) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const ready = await checkServerReady(port);
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function startBackend() {
  return new Promise(async (resolve) => {
    // If already running
    const alreadyUp = await checkServerReady(PORT);
    if (alreadyUp) {
      console.log(`Backend is already running on port ${PORT}`);
      return resolve(true);
    }

    const pyExe = findPython();
    const appPy = path.join(ROOT_DIR, 'backend', 'app.py');

    console.log(`Starting Python backend with: ${pyExe}`);
    pythonProcess = spawn(pyExe, [appPy], {
      cwd: ROOT_DIR,
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe',
    });

    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Python]: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Python err]: ${data}`);
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to spawn Python process:', err);
    });

    pythonProcess.on('exit', (code) => {
      console.log(`Python process exited with code ${code}`);
      pythonProcess = null;
    });

    const isReady = await waitForBackend(PORT);
    resolve(isReady);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    title: 'RPG Soundscape Studio',
    backgroundColor: '#0c0e14',
    icon: path.join(ROOT_DIR, 'frontend', 'public', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // allow loading local assets
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  console.log('RPG Soundscape Studio starting in Electron...');
  const ready = await startBackend();
  if (!ready) {
    dialog.showErrorBox(
      'Ошибка запуска бэкенда',
      'Не удалось запустить локальный аудио-сервер Python на порту 8000.\n' +
      'Убедитесь, что установлены зависимости из backend\\requirements.txt.'
    );
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function cleanup() {
  if (pythonProcess) {
    console.log('Killing Python backend process...');
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', pythonProcess.pid, '/f', '/t']);
      } else {
        pythonProcess.kill('SIGINT');
      }
    } catch (e) {
      console.error('Error stopping backend:', e);
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
