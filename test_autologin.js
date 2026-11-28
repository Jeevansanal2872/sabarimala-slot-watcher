const { app, BrowserWindow, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error('Config file not found at:', configPath);
    app.quit();
    return;
  }
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const pass = cfg.loginPass.startsWith('enc:')
    ? safeStorage.decryptString(Buffer.from(cfg.loginPass.slice(4), 'base64'))
    : cfg.loginPass;

  const t0 = Date.now();
  const log = [];
  const logIt = (m) => log.push((Date.now() - t0) + 'ms: ' + m);

  const win = new BrowserWindow({
    show: false, width: 1366, height: 900,
    webPreferences: { partition: 'persist:sabarimala', backgroundThrottling: false }
  });

  await win.loadURL('https://sabarimalaonline.org/#/login');
  logIt('Login page loaded');
  await new Promise(r => setTimeout(r, 2000));

  const filled = await win.webContents.executeJavaScript(`
    (() => {
      const u = ${JSON.stringify(cfg.loginUser)};
      const p = ${JSON.stringify(pass)};

      function setVal(el, val) {
        el.focus();
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }

      const inputs = [...document.querySelectorAll('input')];
      const userInp = inputs.find(i => /mobile|email|user/i.test(i.placeholder || i.name || i.id || '') || i.type === 'text');
      const passInp = inputs.find(i => i.type === 'password');

      if (!userInp || !passInp) return { ok: false, error: 'inputs not found' };

      setVal(userInp, u);
      setVal(passInp, p);

      const btns = [...document.querySelectorAll('button')];
      const loginBtn = btns.find(b => b.textContent.trim().toLowerCase() === 'login') || document.querySelector('button[type="submit"]');
      if (!loginBtn) return { ok: false, error: 'login button not found' };

      loginBtn.click();
      return { ok: true, userInpVal: userInp.value };
    })()
  `);

  logIt('Filled & clicked: ' + JSON.stringify(filled));
  await new Promise(r => setTimeout(r, 5000));

  const after = await win.webContents.executeJavaScript(`
    (() => {
      const text = document.body ? document.body.innerText.slice(0, 300).replace(/\\n/g, ' ') : '';
      return {
        url: window.location.href,
        hasToken: !!(localStorage.getItem('tof-auth-token') || localStorage.getItem('tof-auth-token8')),
        username: localStorage.getItem('username'),
        text: text
      };
    })()
  `);

  logIt('After login: ' + JSON.stringify(after));
  const resultPath = path.join(__dirname, 'login_test_res.txt');
  fs.writeFileSync(resultPath, log.join('\n'));
  win.destroy();
  app.quit();
});
