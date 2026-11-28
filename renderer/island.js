'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const island = $('#island');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let state = null;
  let prevStatus = null;
  let ignoring = true;      // main starts the window click-through
  let hovering = false;
  let leaveTimer = null;
  let pinnedUntil = 0;
  let pinTimer = null;

  /* ---------- open / close + click-through hit testing ---------- */
  const setOpen = (open) => island.classList.toggle('open', open);

  function setIgnore(v) {
    if (v === ignoring) return;
    ignoring = v;
    window.api.setIgnoreMouse(v);
  }

  function inside(x, y) {
    const r = island.getBoundingClientRect();
    const m = 10;
    return x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;
  }

  function onMove(e) {
    if (inside(e.clientX, e.clientY)) {
      clearTimeout(leaveTimer); leaveTimer = null;
      hovering = true;
      setIgnore(false);
      setOpen(true);
    } else if (hovering && !leaveTimer) {
      leaveTimer = setTimeout(() => {
        leaveTimer = null; hovering = false;
        if (Date.now() >= pinnedUntil) setOpen(false);
        setIgnore(true);
      }, 300);
    }
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseleave', () => onMove({ clientX: -999, clientY: -999 }));

  island.addEventListener('mouseenter', () => {
    clearTimeout(leaveTimer); leaveTimer = null;
    hovering = true;
    setIgnore(false);
    setOpen(true);
  });
  island.addEventListener('mouseleave', () => {
    if (!leaveTimer) {
      leaveTimer = setTimeout(() => {
        leaveTimer = null; hovering = false;
        if (Date.now() >= pinnedUntil) setOpen(false);
        setIgnore(true);
      }, 300);
    }
  });
  island.addEventListener('click', () => {
    setIgnore(false);
    setOpen(true);
  });

  // Pop open by itself for a few seconds when slots appear, then fold back.
  function pin(ms) {
    pinnedUntil = Date.now() + ms;
    setOpen(true);
    clearTimeout(pinTimer);
    pinTimer = setTimeout(() => { if (!hovering) setOpen(false); }, ms + 50);
  }

  /* ---------- rendering ---------- */
  const two = (n) => String(n).padStart(2, '0');
  const clock = (ts) => { const d = new Date(ts); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
  const prettyDate = (iso) => { const [, m, d] = iso.split('-'); return `${MONTHS[+m - 1]} ${+d}`; };

  const VISUAL = {
    watching: 'watching',
    checking: 'checking',
    found: 'found',
    loggedout: 'warn',
    error: 'warn',
    paused: 'paused',
    idle: 'watching',
  };

  const STATUS_LABELS = {
    watching: 'Watching',
    checking: 'Checking',
    found: 'Slots Found!',
    loggedout: 'Log in',
    error: 'Attention',
    paused: 'Paused',
    idle: 'Starting',
  };

  const COLLAPSED_LABELS = {
    watching: 'Watching',
    checking: 'Checking',
    found: 'Slots Found!',
    loggedout: 'Log in again',
    error: 'Attention',
    paused: 'Paused',
    idle: 'Starting',
  };

  function renderChips(s) {
    const box = $('#chips');
    if (!box) return;
    box.textContent = '';
    for (const iso of s.dates) {
      const hit = (s.hits || []).find((h) => h.date === iso);
      const chip = document.createElement('div');
      chip.className = 'chip' + (hit ? ' hit' : '');
      const dot = document.createElement('span'); dot.className = 'dot';
      const d = document.createElement('span'); d.className = 'd'; d.textContent = prettyDate(iso);
      const st = document.createElement('span'); st.className = 's';
      st.textContent = hit ? (hit.count ? `${hit.count} open` : 'open') : 'none yet';
      chip.append(dot, d, st);
      box.append(chip);
    }
  }

  function render() {
    if (!state) return;
    const s = state;
    const visualStatus = VISUAL[s.status] || 'watching';
    island.dataset.status = visualStatus;

    // Header badge
    const statusLbl = $('#statusLbl') || $('#pill');
    if (statusLbl) statusLbl.textContent = STATUS_LABELS[s.status] || 'Watching';

    // Collapsed bar
    const cTitle = $('#collapsedTitle');
    if (cTitle) cTitle.textContent = COLLAPSED_LABELS[s.status] || 'Watching';

    // Subtitle & messages
    const subEl = $('#sub');
    if (subEl) {
      const dateRange = s.dates.length > 1
        ? `${prettyDate(s.dates[0])}–${prettyDate(s.dates[s.dates.length - 1])}`
        : (s.dates.length === 1 ? prettyDate(s.dates[0]) : 'No dates');
      subEl.textContent = `Watching ${dateRange} · ${s.minSlots}+ slots`;
    }

    const msgEl = $('#msg');
    if (msgEl) msgEl.textContent = s.message || 'Monitoring for available slots...';

    // Telemetry stats
    const lastEl = $('#last');
    if (lastEl) lastEl.textContent = s.lastCheck ? clock(s.lastCheck) : '--:--';

    const checksEl = $('#checks');
    if (checksEl) checksEl.textContent = String(s.checks);

    const chanEl = $('#chan');
    if (chanEl) chanEl.textContent = String((s.channels ? s.channels.length : 0) + 1); // +1 = desktop

    // Pause button state
    const pauseLbl = $('#pauseLbl');
    if (pauseLbl) pauseLbl.textContent = s.paused ? 'Resume' : 'Pause';

    const pauseIcon = $('#pauseIcon');
    if (pauseIcon) {
      pauseIcon.innerHTML = s.paused
        ? '<path d="M8 5v14l11-7z"/>'
        : '<path d="M9 6v12M15 6v12"/>';
    }

    renderChips(s);
    tick();

    if (s.status === 'found' && prevStatus !== 'found') pin(14000);
    if (s.status === 'loggedout' && prevStatus !== 'loggedout') pin(6000);
    prevStatus = s.status;
  }

  function tick() {
    if (!state) return;
    const el = $('#next');
    const cTime = $('#collapsedTime');

    let t = '--:--';
    if (state.status === 'checking') {
      t = '...';
    } else if (state.status === 'found') {
      t = 'OPEN';
    } else if (state.status === 'loggedout') {
      t = '!';
    } else if (state.status === 'paused') {
      t = 'paused';
    } else if (state.nextCheck) {
      const sec = Math.max(0, Math.round((state.nextCheck - Date.now()) / 1000));
      t = `${Math.floor(sec / 60)}:${two(sec % 60)}`;
    }

    if (el && el.textContent !== t) el.textContent = t;
    if (cTime && cTime.textContent !== t) cTime.textContent = t;
  }
  setInterval(tick, 1000);

  /* ---------- wiring ---------- */
  if (!window.api) {
    window.api = {
      setIgnoreMouse: () => {},
      action: (act) => console.log('Action:', act),
      onState: (cb) => { window._pushState = cb; },
      getState: () => Promise.resolve({
        status: 'watching',
        message: 'No slots available yet · 6 responses checked',
        lastCheck: Date.now() - 45000,
        nextCheck: Date.now() + 75000,
        checks: 37,
        dates: ['2026-12-20', '2026-12-21', '2026-12-22'],
        minSlots: 6,
        paused: false,
        channels: ['ntfy', 'telegram'],
        hits: [],
      }),
    };
  }

  document.querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('click', () => window.api.action(b.dataset.act));
  });
  window.api.onState((s) => { state = s; render(); });
  window.api.getState().then((s) => { state = s; render(); });
})();
