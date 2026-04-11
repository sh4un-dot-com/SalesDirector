const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const LOCAL_DB_FILE = 'salesdirector-localdb.enc.json';
const LOCAL_DB_VERSION = 1;
const LOCAL_DB_ITERATIONS = 250000;
const CI_SMOKE_TEST_FLAG = '--ci-smoke-test';

const getLocalDbPath = () => path.join(app.getPath('userData'), LOCAL_DB_FILE);
const isCiSmokeTest = process.argv.includes(CI_SMOKE_TEST_FLAG);

const deriveKey = (passphrase, salt, iterations = LOCAL_DB_ITERATIONS) => {
  return crypto.pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');
};

const encryptPayload = (payload, passphrase) => {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt, LOCAL_DB_ITERATIONS);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: LOCAL_DB_VERSION,
    i: LOCAL_DB_ITERATIONS,
    s: salt.toString('base64'),
    iv: iv.toString('base64'),
    t: tag.toString('base64'),
    d: encrypted.toString('base64'),
    updatedAt: new Date().toISOString()
  };
};

const decryptPayload = (encryptedPayload, passphrase) => {
  if (!encryptedPayload || typeof encryptedPayload !== 'object') {
    throw new Error('Encrypted database payload is invalid.');
  }

  const iterations = Number(encryptedPayload.i) || LOCAL_DB_ITERATIONS;
  const salt = Buffer.from(encryptedPayload.s || '', 'base64');
  const iv = Buffer.from(encryptedPayload.iv || '', 'base64');
  const tag = Buffer.from(encryptedPayload.t || '', 'base64');
  const data = Buffer.from(encryptedPayload.d || '', 'base64');
  const key = deriveKey(passphrase, salt, iterations);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
};

const registerLocalDbIpcHandlers = () => {
  ipcMain.handle('localdb:status', async () => {
    const dbPath = getLocalDbPath();
    try {
      await fs.access(dbPath);
      return { exists: true, backend: 'electron-encrypted-file' };
    } catch {
      return { exists: false, backend: 'electron-encrypted-file' };
    }
  });

  ipcMain.handle('localdb:save', async (_event, payload = {}) => {
    const passphrase = String(payload.passphrase || '').trim();
    if (passphrase.length < 8) {
      throw new Error('Passphrase must be at least 8 characters.');
    }

    const dbPath = getLocalDbPath();
    const encrypted = encryptPayload(payload.data || {}, passphrase);
    await fs.writeFile(dbPath, JSON.stringify(encrypted), { encoding: 'utf8', mode: 0o600 });
    return { ok: true, backend: 'electron-encrypted-file' };
  });

  ipcMain.handle('localdb:load', async (_event, payload = {}) => {
    const passphrase = String(payload.passphrase || '').trim();
    if (passphrase.length < 8) {
      throw new Error('Passphrase must be at least 8 characters.');
    }

    const dbPath = getLocalDbPath();
    const raw = await fs.readFile(dbPath, 'utf8');
    const parsed = JSON.parse(raw);
    const data = decryptPayload(parsed, passphrase);
    return { ok: true, data, backend: 'electron-encrypted-file' };
  });

  ipcMain.handle('localdb:reset', async () => {
    const dbPath = getLocalDbPath();
    try {
      await fs.unlink(dbPath);
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        throw err;
      }
    }
    return { ok: true, backend: 'electron-encrypted-file' };
  });
};

const attachSmokeTestHandlers = (window) => {
  if (!isCiSmokeTest) {
    return;
  }

  const finish = (exitCode, message) => {
    if (message) {
      if (exitCode === 0) {
        console.log(message);
      } else {
        console.error(message);
      }
    }

    if (!window.isDestroyed()) {
      window.destroy();
    }
    app.exit(exitCode);
  };

  const smokeTimeout = setTimeout(() => {
    finish(1, 'CI smoke test timed out before renderer content became available.');
  }, 30000);

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      clearTimeout(smokeTimeout);
      finish(1, `Main window failed to load (${errorCode}): ${errorDescription} [${validatedURL}]`);
    }
  });

  window.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const result = await window.webContents.executeJavaScript(
          `new Promise((resolve) => {
            const deadline = Date.now() + 10000;
            const expectedAboutText = ['Akita Engineering', 'support@akitaengineering.com', 'Made in Niagara Falls, Canada'];

            const clickAboutTab = () => {
              const aboutButton = Array.from(document.querySelectorAll('button')).find((button) => {
                return (button.textContent || '').trim() === 'About';
              });

              if (!aboutButton) {
                return false;
              }

              aboutButton.click();
              return true;
            };

            const hasExpectedAboutText = () => {
              const pageText = document.body?.innerText || '';
              return expectedAboutText.every((value) => pageText.includes(value));
            };

            const check = () => {
              const root = document.getElementById('root');
              const text = root?.innerText?.trim() || '';
              const childCount = root?.children?.length || 0;

              if ((text.length > 0 || childCount > 0) && hasExpectedAboutText()) {
                resolve({ ok: true, textLength: text.length, childCount, title: document.title });
                return;
              }

              if (text.length > 0 || childCount > 0) {
                clickAboutTab();
              }

              if (Date.now() >= deadline) {
                resolve({ ok: false, textLength: text.length, childCount, title: document.title });
                return;
              }

              requestAnimationFrame(check);
            };

            check();
          });`,
          true
        );

        clearTimeout(smokeTimeout);

        if (!result?.ok) {
          finish(1, 'CI smoke test failed: renderer root stayed empty after load.');
          return;
        }

        finish(
          0,
          `CI smoke test passed: title="${result.title}" textLength=${result.textLength} childCount=${result.childCount}`
        );
      } catch (err) {
        clearTimeout(smokeTimeout);
        finish(1, `CI smoke test failed while inspecting renderer: ${err?.message || err}`);
      }
    }, 1000);
  });
};

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    title: 'SalesDirector',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  attachSmokeTestHandlers(window);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    window.loadURL(devServerUrl);
    if (!isCiSmokeTest) {
      window.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
};

app.whenReady().then(() => {
  registerLocalDbIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
