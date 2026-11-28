'use strict';
const { BrowserWindow, session } = require('electron');
const EventEmitter = require('events');
const { findSlots } = require('./detect');

const PARTITION = 'persist:sabarimala';

function timeout(ms) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
}

function withDeadline(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Capture slot information from the booking page.
 * Hard 25-second deadline ensures this NEVER hangs the app.
 */
async function capture(url, targetDates, credentials = {}) {
  return withDeadline(doCapture(url, targetDates, credentials), 25000, 'Capture');
}

/**
 * Fast, accurate calendar verification with proper month navigation and RGB color inspection.
 */
async function doCapture(url, targetDates, credentials = {}) {
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      partition: PARTITION,
      backgroundThrottling: true,
      sandbox: true,
      contextIsolation: false,
      nodeIntegration: false,
    },
  });

  const wc = win.webContents;
  try { wc.setAudioMuted(true); } catch (_) {}
  let reLogged = false;

  try {
    // 1. Check if logged in by loading home/darshan
    await withDeadline(wc.loadURL(url), 10000, 'Page load');
    await new Promise((r) => setTimeout(r, 2000)); // wait for Angular render

    let pageState = await wc.executeJavaScript(`
      (() => {
        const u = localStorage.getItem('username') || '';
        const t = localStorage.getItem('tof-auth-token') || localStorage.getItem('tof-auth-token8') || '';
        const curUrl = window.location.href;
        const text = document.body ? document.body.innerText.slice(0, 1000).replace(/\\s+/g, ' ') : '';
        const onLogin = curUrl.includes('#/login') || /user\\s*login/i.test(text);
        return { user: u, hasToken: !!t, url: curUrl, text, onLogin };
      })()
    `).catch(() => ({ onLogin: true }));

    // 2. Auto-login if session expired and credentials exist
    if (pageState.onLogin && credentials.loginUser && credentials.loginPass) {
      const ok = await performAutoLogin(wc, credentials.loginUser, credentials.loginPass);
      if (ok) {
        reLogged = true;
        await new Promise((r) => setTimeout(r, 1500));
        pageState = await wc.executeJavaScript(`
          (() => {
            const u = localStorage.getItem('username') || '';
            const t = localStorage.getItem('tof-auth-token') || localStorage.getItem('tof-auth-token8') || '';
            const curUrl = window.location.href;
            const text = document.body ? document.body.innerText.slice(0, 1000).replace(/\\s+/g, ' ') : '';
            return { user: u, hasToken: !!t, url: curUrl, text, onLogin: curUrl.includes('#/login') };
          })()
        `).catch(() => ({ onLogin: true }));
      }
    }

    if (pageState.onLogin) {
      return {
        bodies: [],
        text: pageState.text || '',
        authFail: true,
        calendarResults: [],
        reLogged: false,
        user: '',
      };
    }

    // 3. Inspect calendar with accurate month navigation and RGB verification
    const calendarResults = [];
    if (targetDates && targetDates.length) {
      const domResults = await wc.executeJavaScript(`
        (async () => {
          const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

          // Open calendar
          const calToggle = document.querySelector('button[aria-label="Open calendar"]');
          if (calToggle) calToggle.click();
          await new Promise(r => setTimeout(r, 600));

          function getHeader() {
            const btn = document.querySelector('.mat-calendar-period-button');
            return btn ? btn.textContent.trim().toUpperCase() : '';
          }

          function clickNext() {
            const next = document.querySelector('button.mat-calendar-next-button');
            if (next) { next.click(); return true; }
            return false;
          }

          function clickPrev() {
            const prev = document.querySelector('button.mat-calendar-previous-button');
            if (prev) { prev.click(); return true; }
            return false;
          }

          async function navigateToMonth(targetYear, targetMonthNum) {
            const targetMonStr = MONTH_NAMES[targetMonthNum - 1];
            for (let i = 0; i < 15; i++) {
              const hdr = getHeader();
              if (hdr.includes(targetMonStr) && hdr.includes(String(targetYear))) return true;
              clickNext();
              await new Promise(r => setTimeout(r, 350));
            }
            return false;
          }

          function parseRgb(str) {
            const m = (str || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
            return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
          }

          function isGreen(rgb) {
            if (!rgb) return false;
            // Green background indicating open slot (green channel is clearly dominant)
            return rgb.g > 90 && rgb.g > rgb.r * 1.2 && rgb.g > rgb.b * 1.1;
          }

          function isRed(rgb) {
            if (!rgb) return false;
            // Red background indicating booked slot (red channel is dominant)
            return rgb.r > 140 && rgb.r > rgb.g * 1.3 && rgb.r > rgb.b * 1.3;
          }

          const out = [];
          const testList = ${JSON.stringify(targetDates)};

          for (const iso of testList) {
            const [y, m, d] = iso.split('-').map(Number);
            const navOk = await navigateToMonth(y, m);
            if (!navOk) {
              out.push({ date: iso, found: false, booked: true, isAvailable: false, reason: 'month navigation failed' });
              continue;
            }

            // Find cell matching day number within current month view
            const cells = [...document.querySelectorAll('.mat-calendar-body-cell')];
            const cell = cells.find(c => {
              const inner = c.querySelector('.mat-calendar-body-cell-content') || c;
              return inner.textContent.trim() === String(d);
            });

            if (!cell) {
              out.push({ date: iso, found: false, booked: true, isAvailable: false, reason: 'day cell not found' });
              continue;
            }

            const inner = cell.querySelector('.mat-calendar-body-cell-content') || cell;
            const bg1 = parseRgb(window.getComputedStyle(cell).backgroundColor);
            const bg2 = parseRgb(window.getComputedStyle(inner).backgroundColor);
            const bg = (bg2 && (bg2.r || bg2.g || bg2.b)) ? bg2 : bg1;

            const green = isGreen(bg);
            const red = isRed(bg);
            const booked = red || (!green); // ONLY green cells are available!

            out.push({
              date: iso,
              monthHeader: getHeader(),
              day: d,
              found: true,
              booked: booked,
              isAvailable: green,
              reason: green ? 'GREEN (Slot Available!)' : (red ? 'RED (Booked)' : 'Plain/Disabled (Not Released)')
            });
          }

          return out;
        })()
      `).catch(() => []);

      calendarResults.push(...(Array.isArray(domResults) ? domResults : []));
    }

    return {
      bodies: [],
      text: pageState.text || '',
      authFail: false,
      calendarResults,
      reLogged,
      user: pageState.user || '',
    };
  } finally {
    if (!win.isDestroyed()) win.destroy();
    try { session.fromPartition(PARTITION).clearCache(); } catch (_) {}
  }
}

/**
 * Automatically log in when the session expires
 */
async function performAutoLogin(wc, username, password) {
  if (!username || !password) return false;
  try {
    await withDeadline(wc.loadURL('https://sabarimalaonline.org/#/login'), 8000, 'Login page');
    await new Promise((r) => setTimeout(r, 1500));

    const submitResult = await wc.executeJavaScript(`
      (() => {
        const u = ${JSON.stringify(username)};
        const p = ${JSON.stringify(password)};

        function setField(input, val) {
          input.focus();
          input.value = val;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
        }

        const inputs = [...document.querySelectorAll('input')];
        const userInp = inputs.find(i => /mobile|email|user/i.test(i.placeholder || i.name || i.id || '') || i.type === 'text');
        const passInp = inputs.find(i => i.type === 'password');

        if (!userInp || !passInp) return { ok: false, error: 'inputs not found' };

        setField(userInp, u);
        setField(passInp, p);

        const btns = [...document.querySelectorAll('button')];
        const loginBtn = btns.find(b => b.textContent.trim().toLowerCase() === 'login') || document.querySelector('button[type="submit"]');
        if (!loginBtn) return { ok: false, error: 'login button not found' };

        loginBtn.click();
        return { ok: true };
      })()
    `).catch(() => ({ ok: false }));

    if (!submitResult || !submitResult.ok) return false;

    // Wait 3s for authentication to complete
    await new Promise((r) => setTimeout(r, 3000));

    // Redirect to darshan page
    await withDeadline(wc.loadURL('https://sabarimalaonline.org/#/darshan'), 8000, 'Darshan redirect');
    await new Promise((r) => setTimeout(r, 1500));
    return true;
  } catch (_) {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */

class Watcher extends EventEmitter {
  constructor(getCfg) {
    super();
    this.getCfg = getCfg;
    this.timer = null;
    this.running = false;
    this.loginWin = null;
    this.lastKey = '';
    this.lastHitAlert = 0;
    this.lastLoggedOutAlert = 0;
    this.fullTextSeen = false;
    this.errorStreak = 0;
    this.lastCapture = null;
    this.lastKnownUser = '';
    this.state = {
      status: 'idle',
      message: 'Starting watcher...',
      lastCheck: null,
      nextCheck: null,
      checks: 0,
      hits: [],
      paused: false,
      log: [],
    };
  }

  log(msg) {
    const e = { t: Date.now(), msg };
    this.state.log = [e, ...this.state.log].slice(0, 10);
    this.emit('log', e);
    this.emit('state', this.state);
  }

  set(patch) {
    Object.assign(this.state, patch);
    this.emit('state', this.state);
  }

  start() {
    this.schedule(1500);
  }

  schedule(ms) {
    clearTimeout(this.timer);
    if (this.state.paused) {
      this.set({ nextCheck: null });
      return;
    }
    const nextTime = Date.now() + ms;
    this.set({ nextCheck: nextTime });
    this.timer = setTimeout(() => this.check(), ms);
  }

  nextDelay() {
    const cfg = this.getCfg();
    const sec = Math.max(5, Number(cfg.intervalSec) || 60);
    const jitter = Math.min(1000, Math.floor(sec * 50));
    return (sec * 1000) + Math.floor(Math.random() * jitter);
  }

  retryDelay() {
    const cfg = this.getCfg();
    const sec = Math.max(3, Number(cfg.retrySec) || 15);
    return sec * 1000;
  }

  togglePause() {
    const paused = !this.state.paused;
    clearTimeout(this.timer);
    if (paused) {
      this.set({ paused: true, status: 'paused', message: 'Watcher is paused', nextCheck: null });
      this.log('Watcher paused');
    } else {
      this.set({ paused: false, status: 'watching', message: 'Resuming watcher...' });
      this.log('Watcher resumed');
      this.schedule(1000);
    }
  }

  restart() {
    if (!this.state.paused) this.schedule(1000);
  }

  async check() {
    if (this.running) {
      this.log('Previous check still in flight, skipping');
      return;
    }
    this.running = true;
    clearTimeout(this.timer);

    this.set({
      status: 'checking',
      message: 'Checking Sabarimala slot availability...',
      nextCheck: null,
    });

    const cfg = this.getCfg();
    const startTime = Date.now();
    let isError = false;

    try {
      const cap = await capture(cfg.url, cfg.dates || [], {
        loginUser: cfg.loginUser,
        loginPass: cfg.loginPass,
      });
      this.lastCapture = cap;
      this.errorStreak = 0;
      if (cap.user) this.lastKnownUser = cap.user;
      if (cap.reLogged) {
        this.log(' Session refreshed: auto-logged in successfully!');
      }
      this.evaluate(cap, cfg);
    } catch (e) {
      isError = true;
      this.errorStreak += 1;
      const duration = Math.round((Date.now() - startTime) / 1000);
      const msg = `Check failed after ${duration}s: ${e.message || e}`;
      this.set({
        status: 'error',
        message: msg,
        lastCheck: Date.now(),
        checks: this.state.checks + 1,
      });
      this.log(msg);
      if (this.errorStreak === 5) {
        this.emit('trouble', 'Virtual Q Detector has had 5 failed checks in a row: ' + (e.message || e));
      }
    } finally {
      this.running = false;
      const delay = isError ? this.retryDelay() : this.nextDelay();
      this.schedule(delay);
    }
  }

  evaluate(cap, cfg) {
    const now = Date.now();
    const checksCount = this.state.checks + 1;
    const base = { lastCheck: now, checks: checksCount };

    if (cap.authFail) {
      const hasCreds = !!(cfg.loginUser && cfg.loginPass);
      const msg = hasCreds
        ? 'Login session expired  -  auto-login failed. Click Log in to sign in.'
        : 'Session expired  -  click Log in to sign in';
      this.set({
        ...base,
        status: 'loggedout',
        message: msg,
        hits: [],
      });
      this.log('Session looks logged out');
      if (now - this.lastLoggedOutAlert > 6 * 3600 * 1000) {
        this.lastLoggedOutAlert = now;
        this.emit('loggedout');
      }
      return;
    }

    const seen = new Set();
    const hits = [];

    // Calendar DOM hits  -  ONLY genuine green cells are available!
    if (cap.calendarResults && cap.calendarResults.length) {
      for (const r of cap.calendarResults) {
        if (r.found && r.isAvailable) {
          const hitText = `${r.date}: ${r.reason}`;
          if (!seen.has(hitText)) {
            seen.add(hitText);
            hits.push({ date: r.date, key: 'calendar', count: null, text: hitText });
          }
        }
      }
    }

    if (hits.length) {
      const key = hits.map((h) => h.text).sort().join('|');
      this.set({
        ...base,
        status: 'found',
        message: ` OPEN: ${hits.length} slot option(s) available!`,
        hits,
      });
      const due = key !== this.lastKey || now - this.lastHitAlert > cfg.realertMin * 60000;
      if (due) {
        this.lastKey = key;
        this.lastHitAlert = now;
        this.log('[!] SLOTS FOUND: ' + hits[0].text);
        this.emit('hits', hits);
      }
    } else {
      this.lastKey = '';
      const cal = cap.calendarResults || [];
      const redCount = cal.filter((r) => r.found && r.booked).length;
      const statusNote = redCount > 0
        ? `Checked #${checksCount}  *  all ${redCount} target date(s) currently full (red)`
        : `Checked #${checksCount}  *  no open slots detected yet`;

      this.set({
        ...base,
        status: 'watching',
        message: statusNote,
        hits: [],
      });
      this.log(`Check #${checksCount} complete: all dates full (red)`);
    }
  }

  openLogin() {
    const cfg = this.getCfg();
    if (this.loginWin && !this.loginWin.isDestroyed()) {
      this.loginWin.focus();
      return;
    }
    this.loginWin = new BrowserWindow({
      width: 1200,
      height: 860,
      title: 'Log in to Sabarimala Online  -  close this window when done',
      webPreferences: {
        partition: PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.loginWin.setMenuBarVisibility(false);
    const loginUrl = cfg.url.replace(/#.*$/, '') + '#/login';
    this.loginWin.loadURL(loginUrl);
    this.loginWin.on('closed', () => {
      this.loginWin = null;
      this.log('Login window closed  -  running slot check immediately');
      this.fullTextSeen = false;
      this.check();
    });
  }
}

module.exports = { Watcher, PARTITION };
