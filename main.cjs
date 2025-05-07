// Contents copied from main.js, now as CommonJS
require('dotenv').config();
const { app, BrowserWindow } = require('electron');
const path = require('path');

// Debug logs for startup
console.log('=== Electron Main Process Startup ===');
console.log('process.argv:', process.argv);

let deeplinkingUrl = null;

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

// Lockdown mode: configurable via environment variable
const isLockdown = process.env.LOCKDOWN_MODE === 'true';
console.log('LOCKDOWN_MODE:', isLockdown);

function extractTokenFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('token');
  } catch (e) {
    return null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    kiosk: isLockdown,
    fullscreen: isLockdown,
    resizable: !isLockdown,
    minimizable: !isLockdown,
    maximizable: !isLockdown,
    closable: !isLockdown,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // preload: path.join(__dirname, 'preload.js'), // Removed to fix error
    },
  });

  win.loadURL(
    process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, 'dist', 'index.html')}`
  );

  console.log('createWindow called. deeplinkingUrl:', deeplinkingUrl);

  // Send token to renderer if present
  if (deeplinkingUrl) {
    const token = extractTokenFromUrl(deeplinkingUrl);
    console.log('Token extracted:', token);
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('exam-token', token);
      // Also inject token as global for renderer fallback
      win.webContents.executeJavaScript(
        `window.INITIAL_DATA = window.INITIAL_DATA || {}; window.INITIAL_DATA.token = ${JSON.stringify(token)};`
      );
      console.log('Injected token into window.INITIAL_DATA');
    });
  }

  // Lockdown: Block certain shortcuts (F12, Ctrl+Shift+I, etc.)
  if (isLockdown) {
    win.webContents.on('before-input-event', (event, input) => {
      // Block devtools and reload shortcuts
      if (
        (input.key === 'F12') ||
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.control && input.key.toLowerCase() === 'r') ||
        (input.meta && input.key.toLowerCase() === 'r')
      ) {
        event.preventDefault();
      }
    });
    // Optionally, disable context menu
    win.webContents.on('context-menu', (e) => e.preventDefault());
  }

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
