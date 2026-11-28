'use strict';
const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, Notification, nativeImage, powerSaveBlocker, session,
} = require('electron');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const notify = require('./notify');
const { Watcher } = require('./watcher');

const ISLAND_W = 480;
const ISLAND_H = 270;

let cfg;
let watcher;
let islandWin = null;
let settingsWin = null;
let tray = null;
let logFile;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on('second-instance', () => {
  openSettings();
  if (islandWin && !islandWin.isDestroyed()) {
    islandWin.show();
    islandWin.setAlwaysOnTop(true);
  }
});

// Resource & Memory optimization switches for minimal CPU and RAM footprint
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');

// Look like a normal Chrome to the site (no "Electron/x.y" token in the user agent).
(function patchUserAgent() {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  app.userAgentFallback = app.userAgentFallback
    .replace(/\sElectron\/\S+/, '')
    .replace(new RegExp('\\s' + esc(app.name) + '\\/\\S+'), '');
})();

function fileLog(msg) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) { /* ignore */ }
}

function publicState() {
  const s = watcher.state;
  return {
    status: s.status, message: s.message, lastCheck: s.lastCheck, nextCheck: s.nextCheck, checks: s.checks,
    hits: s.hits, paused: s.paused, log: s.log,
    dates: cfg.dates, minSlots: cfg.minSlots, intervalSec: cfg.intervalSec, retrySec: cfg.retrySec,
    channels: notify.configured(cfg),
  };
}

function pushState() {
  if (islandWin && !islandWin.isDestroyed()) islandWin.webContents.send('state', publicState());
}

/* ------------------------------ windows ------------------------------ */

function islandBounds() {
  const d = screen.getPrimaryDisplay();
  let x = d.bounds.x + Math.round((d.bounds.width - ISLAND_W) / 2);
  if (cfg.islandPos === 'left') x = d.bounds.x + 24;
  if (cfg.islandPos === 'right') x = d.bounds.x + d.bounds.width - ISLAND_W - 24;
  return { x, y: d.bounds.y, width: ISLAND_W, height: ISLAND_H };
}

function createIsland() {
  islandWin = new BrowserWindow({
    ...islandBounds(),
    frame: false, transparent: true, resizable: false, movable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: true },
  });
  if (process.platform === 'darwin') {
    islandWin.setAlwaysOnTop(true, 'screen-saver');
  } else {
    islandWin.setAlwaysOnTop(true);
  }
  islandWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  islandWin.setIgnoreMouseEvents(true, { forward: true }); // click-through until the pointer is over the pill
  islandWin.loadFile(path.join(__dirname, '..', 'renderer', 'island.html'));
  islandWin.once('ready-to-show', () => { islandWin.show(); pushState(); });
  islandWin.on('closed', () => { islandWin = null; });
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  const opts = {
    width: 600, height: 780, title: 'Virtual Q Detector - Settings', minWidth: 520, minHeight: 520,
    backgroundColor: '#0e111a',
    show: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  };
  if (process.platform === 'darwin') Object.assign(opts, { vibrancy: 'under-window', backgroundColor: '#00000000', titleBarStyle: 'hiddenInset' });
  settingsWin = new BrowserWindow(opts);
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  settingsWin.once('ready-to-show', () => {
    settingsWin.show();
    settingsWin.focus();
  });
  settingsWin.on('closed', () => { settingsWin = null; });
}

function createTray() {
  try {
    let img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'tray.png'));
    if (!img.isEmpty()) img = img.resize({ width: 18, height: 18 });
    tray = new Tray(img);
    tray.setToolTip('Virtual Q Detector');
    const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Check now', click: () => watcher.check() },
      { label: watcher.state.paused ? 'Resume' : 'Pause', click: () => { watcher.togglePause(); rebuild(); } },
      { label: 'Log in to Sabarimala Online', click: () => watcher.openLogin() },
      { label: 'Settings', click: openSettings },
      { label: 'Save debug dump (what the site returned)', click: dumpAndOpen },
      { type: 'separator' },
      { label: 'Quit Virtual Q Detector', click: () => { app.isQuitting = true; app.quit(); } },
    ]));
    rebuild();
    tray.on('click', openSettings);
  } catch (err) {
    console.warn('Tray creation skipped:', err.message);
  }
}

/* ------------------------------ alerts ------------------------------ */

function desktopAlert(title, body, url) {
  if (!cfg.desktop || !Notification.isSupported()) return;
  const n = new Notification({ title, body, urgency: 'critical' });
  if (url) n.on('click', () => shell.openExternal(url));
  n.show();
}

function sirens() {
  if (!cfg.desktop) return;
  for (let i = 0; i < 4; i += 1) setTimeout(() => shell.beep(), i * 700);
}

async function fanOut(title, body, urgent) {
  const results = await notify.sendAll(cfg, { title, body, url: cfg.url, urgent });
  for (const r of results) watcher.log(`${r.channel}: ${r.ok ? 'sent' : 'FAILED - ' + r.detail}`);
  if (!results.length) watcher.log('No phone/email channel set up - desktop alert only');
}

function wireWatcher() {
  watcher.on('state', pushState);
  watcher.on('log', (e) => fileLog(e.msg));
  watcher.on('hits', async (hits) => {
    const lines = hits.slice(0, 6).map((h) => '- ' + h.text).join('\n');
    const title = 'Sabarimala slots available!';
    const body = `Possible slots for ${cfg.minSlots}+ people:\n${lines}\n\nBook NOW: ${cfg.url}`;
    desktopAlert(title, lines, cfg.url);
    sirens();
    await fanOut(title, body, true);
  });
  watcher.on('loggedout', async () => {
    const title = 'Virtual Q Detector: please log in again';
    const body = 'Your Sabarimala session has expired. Please open Virtual Q Detector and tap Log in to resume monitoring.';
    desktopAlert(title, body);
    await fanOut(title, body, false);
  });
  watcher.on('trouble', async (msg) => {
    desktopAlert('Virtual Q Detector needs attention', msg);
    await fanOut('Virtual Q Detector needs attention', msg, false);
  });
}

/* ------------------------------ IPC ------------------------------ */

function applyConfig(next) {
  cfg = config.sanitize(next);
  config.save(cfg);
  app.setLoginItemSettings({ openAtLogin: cfg.openAtLogin });
  if (islandWin && !islandWin.isDestroyed()) islandWin.setBounds(islandBounds());
  watcher.restart();
  pushState();
  return cfg;
}

function dumpAndOpen() {
  const dir = path.join(app.getPath('userData'), 'dump');
  fs.mkdirSync(dir, { recursive: true });
  const cap = watcher.lastCapture;
  if (!cap) { watcher.log('Nothing captured yet - run a check first'); return; }
  cap.bodies.forEach((b, i) => {
    fs.writeFileSync(path.join(dir, `${String(i).padStart(2, '0')}.json`), JSON.stringify({ url: b.url, status: b.status, data: b.json }, null, 2));
  });
  fs.writeFileSync(path.join(dir, 'page_text.txt'), cap.text.slice(0, 5000));
  watcher.log(`Saved ${cap.bodies.length} responses to the dump folder`);
  shell.openPath(dir);
}

function setupIpc() {
  ipcMain.handle('state:get', () => publicState());
  ipcMain.handle('cfg:get', () => cfg);
  ipcMain.handle('cfg:save', (_e, next) => applyConfig(next));
  ipcMain.handle('test', async (_e, channel, formCfg) => {
    const c = config.sanitize({ ...cfg, ...formCfg });
    if (channel === 'desktop') {
      if (!Notification.isSupported()) return { ok: false, detail: 'notifications not supported here' };
      new Notification({ title: 'Virtual Q Detector - Test', body: 'Desktop alerts work.' }).show();
      shell.beep();
      return { ok: true, detail: 'desktop notification shown' };
    }
    return notify.test(channel, c);
  });

  // Report whether the user has an active Sabarimala session.
  ipcMain.handle('login:status', async () => {
    try {
      if (watcher && watcher.lastKnownUser) {
        return {
          loggedIn: true,
          note: `Session active  -  Logged in as ${watcher.lastKnownUser}`,
        };
      }

      // Check partition localStorage by probing the origin
      const probeWin = new BrowserWindow({
        show: false, width: 600, height: 400,
        webPreferences: { partition: 'persist:sabarimala', sandbox: true, contextIsolation: false },
      });

      let loggedIn = false;
      let username = '';
      try {
        await probeWin.loadURL('https://sabarimalaonline.org/#/home');
        const r = await probeWin.webContents.executeJavaScript(`
          (() => {
            const u = localStorage.getItem('username');
            const t = localStorage.getItem('tof-auth-token') || localStorage.getItem('tof-auth-token8');
            return { u, hasToken: !!t };
          })()
        `).catch(() => ({}));

        if (r && (r.u || r.hasToken)) {
          loggedIn = true;
          username = r.u || 'Active User';
          if (watcher) watcher.lastKnownUser = username;
        }
      } finally {
        if (!probeWin.isDestroyed()) probeWin.destroy();
      }

      if (loggedIn) {
        return {
          loggedIn: true,
          note: `Session active  -  Logged in as ${username}`,
        };
      }

      if (cfg.loginUser && cfg.loginPass) {
        return {
          loggedIn: true,
          note: `Auto-login ready for ${cfg.loginUser} (will log in on next check)`,
        };
      }

      return {
        loggedIn: false,
        note: 'Not logged in  -  click the button above to log in',
      };
    } catch (err) {
      return { loggedIn: false, note: 'Could not check session: ' + err.message };
    }
  });

  ipcMain.on('island:ignore', (_e, ignore) => {
    if (!islandWin || islandWin.isDestroyed()) return;
    if (ignore) {
      islandWin.setIgnoreMouseEvents(true, { forward: true });
      try { islandWin.webContents.setFrameRate(15); } catch (_) {}
    } else {
      islandWin.setIgnoreMouseEvents(false);
      try { islandWin.webContents.setFrameRate(60); } catch (_) {}
    }
  });
  ipcMain.on('act', (_e, name) => {
    switch (name) {
      case 'check': watcher.check(); break;
      case 'pause': watcher.togglePause(); break;
      case 'login': watcher.openLogin(); break;
      case 'settings': openSettings(); break;
      case 'site': shell.openExternal(cfg.url); break;
      case 'dump': dumpAndOpen(); break;
      case 'quit': app.isQuitting = true; app.quit(); break;
      default: break;
    }
  });
}

/* ------------------------------ boot ------------------------------ */

app.whenReady().then(() => {
  try { session.defaultSession.setSpellCheckerEnabled(false); } catch (_) {}
  if (process.platform === 'darwin' && app.dock) app.dock.hide(); // menu-bar style app
  logFile = path.join(app.getPath('userData'), 'virtual-q-detector.log');
  try { if (fs.statSync(logFile).size > 1e6) fs.unlinkSync(logFile); } catch (_) { /* none yet */ }

  cfg = config.load();
  watcher = new Watcher(() => cfg);
  wireWatcher();
  setupIpc();
  powerSaveBlocker.start('prevent-app-suspension'); // keep checking while the screen is off
  createTray();
  createIsland();
  screen.on('display-metrics-changed', () => { if (islandWin && !islandWin.isDestroyed()) islandWin.setBounds(islandBounds()); });
  watcher.start();
  watcher.log('Virtual Q Detector started');

  const firstRun = !fs.existsSync(path.join(app.getPath('userData'), 'config.json'));
  if (firstRun) config.save(cfg);
  openSettings(); // Show the Settings window so the user sees the app running
});

app.on('window-all-closed', (e) => { if (!app.isQuitting) e.preventDefault(); }); // stay alive in the tray

