const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

// Logging utility: write to Electron userData directory (always writable)
function logToFile(msg) {
  try {
    const logPath = app.getPath('userData') ? path.join(app.getPath('userData'), 'main-log.txt') : path.join(require('os').tmpdir(), 'main-log.txt');
    fs.writeFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`, { flag: 'a' });
  } catch (e) {
    // Ignore logging errors
  }
}

// Robust .env loading for dev and production
const dotenvPathDev = path.join(__dirname, '.env');
const dotenvPathProd = path.join(process.resourcesPath, '.env');
if (fs.existsSync(dotenvPathDev)) {
  require('dotenv').config({ path: dotenvPathDev });
  logToFile('Loaded .env from ' + dotenvPathDev);
} else if (fs.existsSync(dotenvPathProd)) {
  require('dotenv').config({ path: dotenvPathProd });
  logToFile('Loaded .env from ' + dotenvPathProd);
} else {
  logToFile('No .env file found!');
}


// Debug logs for startup
console.log('=== Electron Main Process Startup ===');
console.log('process.argv:', process.argv);




let deeplinkingUrl = null;

// Handle app-quit IPC from renderer
if (ipcMain) {
  ipcMain.on('app-quit', () => {
    logToFile('Received app-quit from renderer');
    app.quit();
  });
}


// Windows: handle protocol when app is launched
if (process.platform === 'win32') {
  deeplinkingUrl = process.argv.find(arg => arg.startsWith('passport://'));
  console.log('deeplinkingUrl (win32) set from argv:', deeplinkingUrl);
}

// Register protocol handler
if (!app.isDefaultProtocolClient('passport')) {
  app.setAsDefaultProtocolClient('passport');
}

// macOS: handle protocol when app is running
app.on('open-url', (event, url) => {
  event.preventDefault();
  deeplinkingUrl = url;
  console.log('Protocol handler triggered (macOS):', url);
});

console.log('deeplinkingUrl before app.whenReady:', deeplinkingUrl);



function extractTokenFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('token');
  } catch (e) {
    return null;
  }
}

// Consolidated createWindow: handles lockdown, deeplinking, and injection
function createWindow() {
  // Always get the latest value from environment
  const isLockdown = process.env.LOCKDOWN_MODE === 'true';
  logToFile('LOCKDOWN_MODE at window creation: ' + isLockdown);
  console.log('LOCKDOWN_MODE at window creation:', isLockdown);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    kiosk: isLockdown,
    fullscreen: isLockdown,
    resizable: !isLockdown,
    minimizable: !isLockdown,
    maximizable: !isLockdown,
    closable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // preload: path.join(__dirname, 'preload.js'), // Uncomment if needed
    },
  });

  win.loadURL(
    process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, 'dist', 'index.html')}`
  );

  // Inject token if deeplinkingUrl is present
  if (typeof deeplinkingUrl === 'string' && deeplinkingUrl.startsWith('passport://')) {
    const token = extractTokenFromUrl(deeplinkingUrl);
    if (token) {
      win.webContents.once('did-finish-load', () => {
        win.webContents.send('exam-token', token);
        win.webContents.executeJavaScript(
          `window.INITIAL_DATA = window.INITIAL_DATA || {}; window.INITIAL_DATA.token = ${JSON.stringify(token)};`
        );
      });
    }
  }

  // Remove menu and block shortcuts in lockdown mode
  if (isLockdown) {
    const { Menu } = require('electron');
    Menu.setApplicationMenu(null);
    win.webContents.on('before-input-event', (event, input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.control && input.key.toLowerCase() === 'r') ||
        (input.meta && input.key.toLowerCase() === 'r') ||
        (input.control && input.key.toLowerCase() === 'c') || // Block copy
        (input.control && input.key.toLowerCase() === 'v')    // Block paste
      ) {
        event.preventDefault();
      }
    });
    win.webContents.on('context-menu', (e) => e.preventDefault());
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools();
    });
  }

  // Ensure app quits when window is closed (except macOS)
  win.on('closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  // If there was a protocol URL at launch (Windows), handle it now
  if (deeplinkingUrl) {
    console.log('Protocol handler triggered (startup):', deeplinkingUrl);
    // TODO: Pass deeplinkingUrl to renderer process if needed
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
