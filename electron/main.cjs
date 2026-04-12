const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const LOCAL_DB_FILE = 'salesdirector-localdb.enc.json';
const LOCAL_DB_VERSION = 1;
const LOCAL_DB_ITERATIONS = 250000;
const CI_SMOKE_TEST_FLAG = '--ci-smoke-test';

const getLocalDbPath = () => path.join(app.getPath('userData'), LOCAL_DB_FILE);
const isCiSmokeTest = process.argv.includes(CI_SMOKE_TEST_FLAG);

const deriveKey = (passphrase, salt, iterations = LOCAL_DB_ITERATIONS) => {
  return crypto.pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');
};

const clampInt = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  return Math.min(max, Math.max(min, rounded));
};

const parseImapConnection = (payload = {}) => {
  const host = String(payload.host || '').trim();
  const user = String(payload.user || '').trim();
  const password = String(payload.password || '');
  const secure = payload.secure !== false;
  const port = clampInt(payload.port, 1, 65535, secure ? 993 : 143);
  const folder = String(payload.folder || 'INBOX').trim() || 'INBOX';
  const archiveFolder = String(payload.archiveFolder || 'Archive').trim() || 'Archive';

  if (!host) throw new Error('IMAP host is required.');
  if (!user) throw new Error('IMAP username is required.');
  if (!password) throw new Error('IMAP password or app password is required.');

  return { host, user, password, secure, port, folder, archiveFolder };
};

const formatCompanyFromEmail = (email = '') => {
  const domain = String(email).split('@')[1] || '';
  const root = domain.split('.')[0] || '';
  if (!root) return 'Unknown';
  return root
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const sanitizeBodyPreview = (text = '', limit = 1600) => {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return 'No preview available.';
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
};

const normalizeImapEmail = (parsedMessage, uid, flags, internalDate) => {
  const fromEntry = parsedMessage?.from?.value?.[0] || {};
  const fromEmail = String(fromEntry.address || '').trim().toLowerCase();
  const fromName = String(fromEntry.name || fromEmail || 'Unknown Sender').trim();
  const subject = String(parsedMessage?.subject || 'No subject').trim();
  const dateValue = parsedMessage?.date || internalDate || new Date();
  const dateObj = new Date(dateValue);
  const dateIso = Number.isNaN(dateObj.getTime()) ? new Date().toISOString() : dateObj.toISOString();
  const hasSeenFlag = flags instanceof Set ? flags.has('\\Seen') : false;
  const hasAnsweredFlag = flags instanceof Set ? flags.has('\\Answered') : false;

  return {
    id: `imap-${uid}`,
    source: 'imap',
    sourceId: String(uid),
    uid,
    messageId: String(parsedMessage?.messageId || '').trim(),
    fromName,
    fromEmail,
    company: formatCompanyFromEmail(fromEmail),
    subject,
    body: sanitizeBodyPreview(parsedMessage?.text || parsedMessage?.html || ''),
    dateRaw: dateIso,
    date: new Date(dateIso).toLocaleDateString(),
    isRead: hasSeenFlag,
    needsResponse: !hasSeenFlag && !hasAnsweredFlag,
    isArchived: false,
    aiScore: null,
    aiSummary: ''
  };
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
  ipcMain.handle('app:info', async () => {
    return {
      productName: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node
    };
  });

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

  ipcMain.handle('imap:syncInbox', async (_event, payload = {}) => {
    const {
      host,
      user,
      password,
      secure,
      port,
      folder
    } = parseImapConnection(payload);
    const lookbackDays = clampInt(payload.lookbackDays, 1, 365, 14);
    const limit = clampInt(payload.limit, 1, 200, 50);
    const unreadOnly = Boolean(payload.unreadOnly);

    const client = new ImapFlow({
      host,
      port,
      secure,
      auth: { user, pass: password },
      logger: false
    });

    let mailboxLock;
    try {
      await client.connect();
      mailboxLock = await client.getMailboxLock(folder);

      const sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      const searchQuery = unreadOnly
        ? ['UNSEEN', ['SINCE', sinceDate]]
        : ['SINCE', sinceDate];

      const rawSearchResult = await client.search(searchQuery);
      const matchedUids = Array.isArray(rawSearchResult)
        ? rawSearchResult
        : (Array.isArray(rawSearchResult?.all) ? rawSearchResult.all : []);
      const selectedUids = matchedUids
        .map((uid) => Number(uid))
        .filter((uid) => Number.isInteger(uid) && uid > 0)
        .slice(-limit)
        .reverse();

      const emails = [];
      for (const uid of selectedUids) {
        const fetched = await client.fetchOne(uid, {
          uid: true,
          flags: true,
          internalDate: true,
          source: true
        });

        if (!fetched?.source) continue;

        try {
          const parsedMessage = await simpleParser(fetched.source);
          emails.push(normalizeImapEmail(parsedMessage, fetched.uid || uid, fetched.flags, fetched.internalDate));
          emails[emails.length - 1].folder = folder;
        } catch {
          // Skip malformed MIME payloads while still returning other messages.
        }
      }

      return {
        ok: true,
        folder,
        lookbackDays,
        limit,
        matchedCount: matchedUids.length,
        fetchedCount: emails.length,
        fetchedAt: new Date().toISOString(),
        emails
      };
    } finally {
      if (mailboxLock) {
        mailboxLock.release();
      }
      await client.logout().catch(() => {});
    }
  });

  ipcMain.handle('imap:updateMessageState', async (_event, payload = {}) => {
    const {
      host,
      user,
      password,
      secure,
      port,
      folder,
      archiveFolder
    } = parseImapConnection(payload);

    const action = String(payload.action || '').trim();
    const uid = clampInt(payload.uid, 1, Number.MAX_SAFE_INTEGER, 0);
    if (!uid) {
      throw new Error('A valid IMAP message UID is required.');
    }

    const value = Boolean(payload.value);
    const currentFolder = String(payload.currentFolder || folder).trim() || folder;

    const client = new ImapFlow({
      host,
      port,
      secure,
      auth: { user, pass: password },
      logger: false
    });

    let lock;
    try {
      await client.connect();

      if (action === 'setRead') {
        lock = await client.getMailboxLock(currentFolder);
        if (value) {
          await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        } else {
          await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
        }
        return { ok: true, action, uid, folder: currentFolder, value };
      }

      if (action === 'setFlagged') {
        lock = await client.getMailboxLock(currentFolder);
        if (value) {
          await client.messageFlagsAdd(uid, ['\\Flagged'], { uid: true });
        } else {
          await client.messageFlagsRemove(uid, ['\\Flagged'], { uid: true });
        }
        return { ok: true, action, uid, folder: currentFolder, value };
      }

      if (action === 'setArchived') {
        const destinationFolder = value ? archiveFolder : folder;
        const sourceFolder = value ? currentFolder : (currentFolder || archiveFolder);
        lock = await client.getMailboxLock(sourceFolder);
        await client.messageMove(uid, destinationFolder, { uid: true });
        return { ok: true, action, uid, folder: destinationFolder, value };
      }

      throw new Error(`Unsupported IMAP message action: ${action}`);
    } finally {
      if (lock) {
        lock.release();
      }
      await client.logout().catch(() => {});
    }
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

            const getBridgeStatus = async () => {
              const desktopApi = window.salesDirectorDesktop;
              if (
                !desktopApi ||
                typeof desktopApi.getAppInfo !== 'function' ||
                typeof desktopApi.localDb?.status !== 'function'
              ) {
                return { ok: false };
              }

              try {
                const [appInfo, localDbStatus] = await Promise.all([
                  desktopApi.getAppInfo(),
                  desktopApi.localDb.status()
                ]);

                return {
                  ok: Boolean(appInfo?.version) && localDbStatus?.backend === 'electron-encrypted-file'
                };
              } catch {
                return { ok: false };
              }
            };

            const check = async () => {
              const root = document.getElementById('root');
              const text = root?.innerText?.trim() || '';
              const childCount = root?.children?.length || 0;
              const bridgeStatus = await getBridgeStatus();

              if ((text.length > 0 || childCount > 0) && hasExpectedAboutText() && bridgeStatus.ok) {
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

              requestAnimationFrame(() => {
                check();
              });
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
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
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
