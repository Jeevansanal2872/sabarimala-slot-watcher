'use strict';
(() => {
  const form = document.getElementById('form');
  const fields = {}; // key -> input element

  // Declarative form: sections of rows. type: text | password | number | toggle | select | button
  const SECTIONS = [
    {
      title: 'Sabarimala Account & Login',
      badge: 'Step 1',
      hint: 'Log in using the button below, OR enter your credentials so Virtual Q Detector can automatically log back in whenever the website session times out. Passwords are saved with Windows DPAPI encryption.',
      rows: [
        { type: 'button', label: '🔑 Open Sabarimala Login Window', action: 'login' },
        { type: 'loginstatus' },
        { two: [
          { key: 'loginUser', label: 'Mobile / Email (for auto-relogin)', type: 'text', placeholder: 'e.g. 9848xxxxxx' },
          { key: 'loginPass', label: 'Password (encrypted)', type: 'password', placeholder: '••••••••' },
        ] },
      ],
    },
    {
      title: 'What to watch',
      hint: 'Enter the darshan dates you want to monitor (YYYY-MM-DD, comma-separated). The app opens the booking calendar, checks each date, and alerts you the moment a date becomes available (green). Adjust check intervals below.',
      rows: [
        { key: 'url', label: 'Booking page URL', type: 'text' },
        { key: 'dates', label: 'Dates', type: 'text', placeholder: '2026-12-20, 2026-12-21, 2026-12-22' },
        { two: [
          { key: 'minSlots', label: 'Slots needed', type: 'number' },
          { key: 'intervalSec', label: 'Recheck every (seconds)', type: 'number', placeholder: 'e.g. 30' },
        ] },
        { two: [
          { key: 'retrySec', label: 'Retry on error (seconds)', type: 'number', placeholder: 'e.g. 10' },
          { key: 'realertMin', label: 'Repeat alert (minutes)', type: 'number', placeholder: 'e.g. 30' },
        ] },
        { key: 'fullText', label: 'Extra signal', hintSmall: 'optional', type: 'text',
          placeholder: 'Text the page shows while full, e.g. "No slots available"' },
      ],
    },
    {
      title: 'This computer',
      rows: [
        { key: 'desktop', label: 'Desktop notification + sound', sub: 'Pops up and beeps when slots appear', type: 'toggle', test: 'desktop' },
      ],
    },
    {
      title: 'Phone push (ntfy)', badge: 'recommended',
      hint: 'Free, no account. Install the ntfy app (iOS / Android), subscribe to a long random topic name, and type the same name here.',
      rows: [
        { two: [
          { key: 'ntfyTopic', label: 'Topic', type: 'text', placeholder: 'sabarimala-your-topic-here' },
          { key: 'ntfyServer', label: 'Server', type: 'text' },
        ] },
      ],
      test: 'ntfy',
    },
    {
      title: 'Telegram',
      hint: 'Create a bot with @BotFather, send it any message, then put its token and your chat id here.',
      rows: [
        { two: [
          { key: 'tgToken', label: 'Bot token', type: 'password' },
          { key: 'tgChat', label: 'Chat id', type: 'text' },
        ] },
      ],
      test: 'telegram',
    },
    {
      title: 'WhatsApp (via Twilio)',
      hint: 'Replaces CallMeBot. Create a free Twilio account, open the WhatsApp sandbox and join it from your phone, then fill these in.',
      rows: [
        { two: [
          { key: 'twSid', label: 'Account SID', type: 'text' },
          { key: 'twToken', label: 'Auth token', type: 'password' },
        ] },
        { two: [
          { key: 'twFrom', label: 'From', type: 'text' },
          { key: 'twTo', label: 'Your WhatsApp number', type: 'text', placeholder: '+91XXXXXXXXXX' },
        ] },
      ],
      test: 'twilio',
    },
    {
      title: 'Email',
      hint: 'For Gmail use smtp.gmail.com, port 465 and an App Password (not your normal password).',
      rows: [
        { two: [
          { key: 'smtpHost', label: 'SMTP host', type: 'text' },
          { key: 'smtpPort', label: 'Port', type: 'number' },
        ] },
        { two: [
          { key: 'smtpUser', label: 'Your email', type: 'text' },
          { key: 'smtpPass', label: 'App password', type: 'password' },
        ] },
        { key: 'mailTo', label: 'Send alerts to', hintSmall: 'blank = same address', type: 'text' },
      ],
      test: 'email',
    },
    {
      title: 'Overlay Widget',
      rows: [
        { key: 'islandPos', label: 'Pill position on screen', type: 'select', options: [['center', 'Top centre'], ['left', 'Top left'], ['right', 'Top right']] },
        { key: 'openAtLogin', label: 'Start when Windows/Mac starts', sub: 'Runs automatically in the background after a system restart', type: 'toggle' },
      ],
    },
  ];

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  function field(def) {
    const wrap = el('div');
    if (def.type === 'button') {
      const btn = el('button', 'login-launch-btn', def.label);
      btn.type = 'button';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.api.action(def.action);
      });
      wrap.append(btn);
      return wrap;
    }
    if (def.type === 'loginstatus') {
      const div = el('div', 'login-status checking', '⏳ Checking session…');
      div.id = 'loginStatus';
      return div;
    }
    if (def.type === 'toggle') {
      const row = el('div', 'toggle');
      const t = el('div', 't', def.label);
      if (def.sub) t.append(el('small', '', def.sub));
      const sw = el('label', 'switch');
      const input = el('input'); input.type = 'checkbox';
      sw.append(input, el('span'));
      row.append(t, sw);
      fields[def.key] = input;
      return row;
    }
    const label = el('label', '', def.label);
    if (def.hintSmall) label.append(el('small', '', def.hintSmall));
    let input;
    if (def.type === 'select') {
      input = el('select');
      for (const [v, name] of def.options) { const o = el('option', '', name); o.value = v; input.append(o); }
    } else {
      input = el('input'); input.type = def.type;
      if (def.placeholder) input.placeholder = def.placeholder;
      if (def.type === 'password') input.autocomplete = 'off';
    }
    fields[def.key] = input;
    wrap.append(label, input);
    return wrap;
  }

  function testRow(channel) {
    const row = el('div', 'testrow');
    const btn = el('button', 'test', channel === 'desktop' ? 'Test notification' : 'Send test message');
    const res = el('span', 'result');
    btn.addEventListener('click', async () => {
      res.className = 'result'; res.textContent = 'Sending...';
      const r = await window.api.testChannel(channel, collect());
      res.className = 'result ' + (r.ok ? 'ok' : 'bad');
      res.textContent = (r.ok ? 'OK - ' : 'Failed - ') + r.detail;
    });
    row.append(btn, res);
    return row;
  }

  function build() {
    for (const s of SECTIONS) {
      const sec = el('section');
      const h = el('h2', '', s.title);
      if (s.badge) h.append(el('span', 'badge', s.badge));
      sec.append(h);
      if (s.hint) sec.append(el('p', 'hint', s.hint));
      for (const r of s.rows) {
        if (r.two) {
          const row = el('div', 'row two');
          r.two.forEach((d) => row.append(field(d)));
          sec.append(row);
        } else if (r.type === 'toggle') {
          sec.append(field(r));
          if (r.test) sec.append(testRow(r.test));
        } else if (r.type === 'button' || r.type === 'loginstatus') {
          // No extra wrapper — append directly
          sec.append(field(r));
        } else {
          const row = el('div', 'row');
          row.append(field(r));
          sec.append(row);
        }
      }
      if (s.test) sec.append(testRow(s.test));
      form.append(sec);
    }
  }

  function collect() {
    const out = {};
    for (const [k, input] of Object.entries(fields)) {
      if (input.type === 'checkbox') out[k] = input.checked;
      else if (input.type === 'number') out[k] = Number(input.value);
      else out[k] = input.value;
    }
    return out;
  }

  function fill(cfg) {
    for (const [k, input] of Object.entries(fields)) {
      const v = cfg[k];
      if (input.type === 'checkbox') input.checked = !!v;
      else if (k === 'dates') input.value = (v || []).join(', ');
      else input.value = v === undefined || v === null ? '' : v;
    }
  }

  if (!window.api) {
    window.api = {
      getConfig: () => Promise.resolve({
        url: 'https://sabarimalaonline.org/#/darshan',
        dates: ['2026-12-20', '2026-12-21', '2026-12-22'],
        minSlots: 6,
        intervalSec: 60,
        retrySec: 15,
        realertMin: 30,
        fullText: '',
        desktop: true,
        ntfyTopic: 'sabarimala-demo-7f3k9q',
        ntfyServer: 'https://ntfy.sh',
        tgToken: '',
        tgChat: '',
        twSid: '',
        twToken: '',
        twFrom: '',
        twTo: '',
        smtpHost: '',
        smtpPort: 465,
        smtpUser: '',
        smtpPass: '',
        mailTo: '',
        islandPos: 'center',
        openAtLogin: true,
      }),
      saveConfig: (cfg) => Promise.resolve(cfg),
      testChannel: (ch, _cfg) => Promise.resolve({ ok: true, detail: 'Test alert sent successfully' }),
      action: (name) => console.log('Action:', name),
      getLoginStatus: () => Promise.resolve({ loggedIn: false, cookieCount: 0, note: 'Not logged in — click the button above to log in' }),
      platform: 'win32',
    };
  }

  build();
  window.api.getConfig().then(fill);

  // Load login status
  async function refreshLoginStatus() {
    const div = document.getElementById('loginStatus');
    if (!div) return;
    if (!window.api.getLoginStatus) return;
    try {
      const r = await window.api.getLoginStatus();
      div.className = 'login-status ' + (r.loggedIn ? 'ok' : 'bad');
      div.textContent = r.loggedIn ? '✅ ' + r.note : '❌ ' + r.note;
    } catch (_) {
      div.className = 'login-status bad';
      div.textContent = '❌ Could not read session status';
    }
  }
  refreshLoginStatus();

  const saved = document.getElementById('saved');
  document.getElementById('save').addEventListener('click', async () => {
    const next = await window.api.saveConfig(collect());
    fill(next);
    saved.textContent = 'Saved';
    saved.classList.add('show');
    setTimeout(() => saved.classList.remove('show'), 1800);
  });
})();
