'use strict';
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const SECRET_KEYS = ['tgToken', 'twToken', 'smtpPass', 'loginPass'];

const DEFAULTS = {
  url: 'https://sabarimalaonline.org/#/darshan',
  loginUser: '',
  loginPass: '',
  dates: ['2026-12-20', '2026-12-21', '2026-12-22'],
  minSlots: 6,
  intervalSec: 60,
  retrySec: 15,
  realertMin: 30,
  fullText: '',

  desktop: true,
  ntfyServer: 'https://ntfy.sh',
  ntfyTopic: '',
  tgToken: '',
  tgChat: '',
  twSid: '',
  twToken: '',
  twFrom: 'whatsapp:+14155238886',
  twTo: '',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpUser: '',
  smtpPass: '',
  mailTo: '',

  islandPos: 'center',
  openAtLogin: false,
};

function file() {
  return path.join(app.getPath('userData'), 'config.json');
}

function enc(v) {
  if (!v) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(v).toString('base64');
  } catch (_) { /* fall through to plain */ }
  return v;
}

function dec(v) {
  if (typeof v !== 'string' || !v.startsWith('enc:')) return v || '';
  try {
    return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'));
  } catch (_) {
    return '';
  }
}

function load() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch (_) { /* first run */ }
  const cfg = { ...DEFAULTS, ...raw };
  for (const k of SECRET_KEYS) cfg[k] = dec(cfg[k]);
  return sanitize(cfg);
}

function save(cfg) {
  const out = { ...cfg };
  for (const k of SECRET_KEYS) out[k] = enc(out[k]);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(out, null, 2));
}

function num(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitize(input) {
  const c = { ...DEFAULTS, ...input };
  let dates = c.dates;
  if (typeof dates === 'string') dates = dates.split(/[,\s]+/);
  c.dates = (Array.isArray(dates) ? dates : [])
    .map((d) => String(d).trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!c.dates.length) c.dates = DEFAULTS.dates.slice();
  c.minSlots = num(c.minSlots, 1, 50, DEFAULTS.minSlots);
  c.intervalSec = num(c.intervalSec, 5, 3600, DEFAULTS.intervalSec);
  c.retrySec = num(c.retrySec, 3, 3600, DEFAULTS.retrySec);
  c.realertMin = num(c.realertMin, 1, 1440, DEFAULTS.realertMin);
  c.smtpPort = num(c.smtpPort, 1, 65535, DEFAULTS.smtpPort);
  c.url = String(c.url || DEFAULTS.url).trim();
  if (!/^https:\/\//i.test(c.url)) c.url = DEFAULTS.url;
  c.loginUser = String(c.loginUser || '').trim();
  c.loginPass = String(c.loginPass || '');
  c.desktop = !!c.desktop;
  c.openAtLogin = !!c.openAtLogin;
  if (!['left', 'center', 'right'].includes(c.islandPos)) c.islandPos = 'center';
  c.ntfyTopic = String(c.ntfyTopic || '').trim().replace(/[^A-Za-z0-9_-]/g, '');
  return c;
}

module.exports = { load, save, sanitize, DEFAULTS };
