'use strict';
/**
 * Alert channels. CallMeBot is gone - these are the replacements:
 *   ntfy.sh   : free push notifications to your phone (no account) - recommended
 *   Telegram  : free bot messages
 *   WhatsApp  : via Twilio (sandbox is free to try, needs a Twilio account)
 *   Email     : any SMTP server (Gmail needs an App Password)
 * Desktop notification + sound is handled in main.js.
 */

const TIMEOUT = 20000;

function ascii(s) {
  return String(s).replace(/[^\x20-\x7e]/g, '').slice(0, 120);
}

async function ntfy(cfg, { title, body, url, urgent }) {
  if (!cfg.ntfyTopic) throw new Error('ntfy topic is empty');
  const server = (cfg.ntfyServer || 'https://ntfy.sh').replace(/\/+$/, '');
  const headers = { Title: ascii(title), Priority: urgent ? 'urgent' : 'default', Tags: urgent ? 'rotating_light' : 'bell' };
  if (url) headers.Click = url;
  const res = await fetch(`${server}/${encodeURIComponent(cfg.ntfyTopic)}`, {
    method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
  return 'sent to ntfy topic ' + cfg.ntfyTopic;
}

async function telegram(cfg, { title, body }) {
  if (!cfg.tgToken || !cfg.tgChat) throw new Error('bot token or chat id is empty');
  const res = await fetch(`https://api.telegram.org/bot${cfg.tgToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.tgChat, text: `${title}\n\n${body}`, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) throw new Error(`Telegram: ${j.description || 'HTTP ' + res.status}`);
  return 'sent via Telegram';
}

async function twilio(cfg, { title, body }) {
  if (!cfg.twSid || !cfg.twToken || !cfg.twTo) throw new Error('Twilio SID, token or destination number is empty');
  const wa = (n) => (String(n).startsWith('whatsapp:') ? String(n) : 'whatsapp:' + String(n).replace(/\s+/g, ''));
  const form = new URLSearchParams({ From: wa(cfg.twFrom || 'whatsapp:+14155238886'), To: wa(cfg.twTo), Body: `${title}\n\n${body}` });
  const auth = Buffer.from(`${cfg.twSid}:${cfg.twToken}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.twSid)}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio: ${j.message || 'HTTP ' + res.status}`);
  return 'sent via WhatsApp (Twilio)';
}

async function email(cfg, { title, body }) {
  if (!cfg.smtpUser || !cfg.smtpPass) throw new Error('SMTP user or password is empty');
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (_) {
    throw new Error('nodemailer is not installed (run npm install)');
  }
  const port = Number(cfg.smtpPort) || 465;
  const transport = nodemailer.createTransport({
    host: cfg.smtpHost, port, secure: port === 465,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    connectionTimeout: TIMEOUT, socketTimeout: TIMEOUT,
  });
  await transport.sendMail({ from: cfg.smtpUser, to: cfg.mailTo || cfg.smtpUser, subject: title, text: body });
  return 'email sent to ' + (cfg.mailTo || cfg.smtpUser);
}

const CHANNELS = { ntfy, telegram, twilio, email };

function configured(cfg) {
  const out = [];
  if (cfg.ntfyTopic) out.push('ntfy');
  if (cfg.tgToken && cfg.tgChat) out.push('telegram');
  if (cfg.twSid && cfg.twToken && cfg.twTo) out.push('twilio');
  if (cfg.smtpUser && cfg.smtpPass) out.push('email');
  return out;
}

/** Send through every configured channel; never throws. */
async function sendAll(cfg, msg) {
  const names = configured(cfg);
  const results = await Promise.all(names.map(async (name) => {
    try {
      return { channel: name, ok: true, detail: await CHANNELS[name](cfg, msg) };
    } catch (e) {
      return { channel: name, ok: false, detail: e.message || String(e) };
    }
  }));
  return results;
}

/** Send a test through one channel using the (possibly unsaved) settings. */
async function test(channel, cfg) {
  const fn = CHANNELS[channel];
  if (!fn) return { ok: false, detail: 'unknown channel' };
  try {
    const detail = await fn(cfg, {
      title: 'Virtual Q Detector - Test',
      body: 'Alerts are working correctly on this channel.',
      url: cfg.url,
      urgent: false,
    });
    return { ok: true, detail };
  } catch (e) {
    return { ok: false, detail: e.message || String(e) };
  }
}

module.exports = { sendAll, test, configured };

