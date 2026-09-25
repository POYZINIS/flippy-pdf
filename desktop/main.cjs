const { app, BrowserWindow, ipcMain, Menu, protocol, net } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { pdfArgument, Documents } = require('./documents.cjs');

app.setName('PDFthing');
protocol.registerSchemesAsPrivileged([{ scheme: 'pdfthing', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window;
const smoke = process.argv.includes('--smoke-test');
const profile = app.commandLine.getSwitchValue('user-data-dir');
if (profile) app.setPath('userData', path.resolve(profile));
const hidden = process.argv.includes('--hidden') || smoke;
const documents = new Documents();
let pendingFile = pdfArgument(process.argv.slice(app.isPackaged ? 1 : 2), process.cwd());
let readerReady = false;
let openVersion = 0;

function focusWindow() {
  if (!window || window.isDestroyed() || hidden) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

async function deliverFile() {
  if (!readerReady || !pendingFile || !window || window.isDestroyed()) return;
  const filename = pendingFile;
  pendingFile = null;
  const version = ++openVersion;
  try {
    const file = await documents.add(filename);
    if (version !== openVersion || window.isDestroyed()) { documents.release(file.id); return; }
    window.webContents.send('pdf:open', file);
  } catch {
    if (version === openVersion && !window.isDestroyed()) window.webContents.send('pdf:open', { error: `Couldn’t open ${path.basename(filename)}. Check that the file is available.` });
  }
}

// Windows supplies the file in argv; subsequent launches forward it to the
// existing reader. Register before ready so early open events are not lost.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
app.on('second-instance', (_event, argv, cwd) => {
  const filename = pdfArgument(argv.slice(app.isPackaged ? 1 : 2), cwd);
  if (filename) { pendingFile = filename; void deliverFile(); }
  focusWindow();
});
app.on('open-file', (event, filename) => {
  event.preventDefault();
  pendingFile = filename;
  void deliverFile();
  focusWindow();
});

// Blurred/transparent window backdrops (acrylic) need Windows 11 22H2+.
const [osMajor, , osBuild] = os.release().split('.').map(Number);
const backdropSupported = process.platform === 'win32' && osMajor === 10 && osBuild >= 22621;

function state() {
  return { pinned: window.isAlwaysOnTop(), maximized: window.isMaximized(), fullscreen: window.isFullScreen(), backdropSupported };
}
function sendState() { if (window && !window.isDestroyed()) window.webContents.send('window:state', state()); }
function trusted(event) { return event.sender === window?.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url.startsWith('pdfthing://app/'); }

app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '../dist');
  protocol.handle('pdfthing', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response('Forbidden', { status: 403 });
    const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(root, `.${requested}`);
    if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    width: 1120, height: 820, minWidth: 380, minHeight: 320,
    frame: false, show: false,
    icon: path.join(__dirname, 'assets/icon.png'),
    // Use the DWM backdrop material instead of a layered transparent window:
    // layered windows lose Windows 11's rounded corners, shadow, snap
    // layouts and edge resizing. CSS decides how much acrylic shows through.
    backgroundColor: '#00000000',
    ...(backdropSupported ? { backgroundMaterial: 'acrylic' } : {}),
    autoHideMenuBar: true, title: 'PDFthing',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('did-start-loading', () => { readerReady = false; });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'"] } });
  });
  ipcMain.handle('window:get-state', event => { if (trusted(event)) return state(); });
  ipcMain.handle('pdf:ready', event => { if (trusted(event)) { readerReady = true; void deliverFile(); } });
  ipcMain.handle('pdf:read', (event, id, begin, end) => {
    if (!trusted(event)) throw new Error('Untrusted PDF request.');
    return documents.read(id, begin, end);
  });
  ipcMain.handle('pdf:release', (event, id) => { if (trusted(event)) documents.release(id); });
  ipcMain.handle('window:appearance', (event, appearance) => {
    if (!trusted(event)) return state();
    const { glass, theme } = appearance || {};
    if (backdropSupported) {
      window.setBackgroundMaterial(glass ? 'acrylic' : 'none');
      window.setBackgroundColor(glass ? '#00000000' : theme === 'dark' ? '#202322' : '#e9ece9');
    } else {
      window.setBackgroundColor(theme === 'dark' ? '#202322' : '#e9ece9');
    }
    sendState();
    return state();
  });
  ipcMain.handle('window:command', (event, command) => {
    if (!trusted(event)) return;
    switch (command) {
      case 'minimize': window.minimize(); break;
      case 'maximize': window.isMaximized() ? window.unmaximize() : window.maximize(); break;
      case 'pin': window.setAlwaysOnTop(!window.isAlwaysOnTop()); break;
      case 'fullscreen': window.setFullScreen(!window.isFullScreen()); break;
      case 'close': window.close(); return;
      default: return;
    }
    sendState();
    return state();
  });
  for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'always-on-top-changed']) window.on(event, sendState);
  await window.loadURL('pdfthing://app/');
  if (!smoke && !process.argv.includes('--hidden')) window.show();
  if (smoke) {
    try {
      const result = await window.webContents.executeJavaScript(`({ ready: !!document.querySelector('.drop-zone'), controls: !!window.desktop, title: document.title })`);
      if (!result.ready || !result.controls) throw new Error('Renderer or preload failed');
      window.setAlwaysOnTop(true);
      if (!window.isAlwaysOnTop()) throw new Error('Pin failed');
      window.setAlwaysOnTop(false);
      console.log('DESKTOP_SMOKE_OK', JSON.stringify(result));
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  }
});

app.on('window-all-closed', () => app.quit());
}
