const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const LOCAL_DB_FILE = 'salesdirector-localdb.enc.json';
const LOCAL_DB_VERSION = 1;
const LOCAL_DB_ITERATIONS = 250000;

const getLocalDbPath = () => path.join(app.getPath('userData'), LOCAL_DB_FILE);

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

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: 'detach' });
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
