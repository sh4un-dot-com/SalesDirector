const { app, BrowserWindow, shell, ipcMain, screen } = require('electron');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const msal = require('@azure/msal-node');
const nodemailer = require('nodemailer');

const LOCAL_DB_FILE = 'salesdirector-localdb.enc.json';
const LOCAL_DB_VERSION = 1;
const LOCAL_DB_ITERATIONS = 250000;
const CI_SMOKE_TEST_FLAG = '--ci-smoke-test';
const SESSION_DATA_DIR = path.join(app.getPath('userData'), 'session-data');

app.setPath('sessionData', SESSION_DATA_DIR);

if (!app.isPackaged) {
  app.commandLine.appendSwitch('disable-http-cache');
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
}

// --- OAuth2 (Microsoft Office 365 / Google) ---
const OAUTH2_REDIRECT_URI = 'http://localhost';
const MS_OAUTH2_SCOPES = {
  imap: [
    'https://outlook.office365.com/IMAP.AccessAsUser.All',
    'https://outlook.office365.com/SMTP.Send',
    'offline_access',
    'openid',
    'profile',
    'email'
  ],
  graph: [
    'Mail.Read',
    'Mail.ReadWrite',
    'Mail.Send',
    'offline_access',
    'openid',
    'profile',
    'email'
  ]
};
const GOOGLE_OAUTH2_SCOPES = [
  'https://mail.google.com/',
  'openid',
  'email',
  'profile'
];
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-4o-mini';
const OPENAI_COMPATIBLE_DEFAULT_BASE_URL = 'http://127.0.0.1:11434/v1';
const AI_PROVIDER_CONFIG = {
  gemini: {
    label: 'Gemini',
    model: 'gemini-2.5-flash',
    requiresApiKey: true
  },
  openai: {
    label: 'OpenAI',
    model: 'gpt-4.1-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true
  },
  anthropic: {
    label: 'Anthropic',
    model: 'claude-3-5-sonnet-latest',
    requiresApiKey: true
  },
  xai: {
    label: 'xAI',
    model: 'grok-2-latest',
    defaultBaseUrl: 'https://api.x.ai/v1',
    requiresApiKey: true
  },
  openrouter: {
    label: 'OpenRouter',
    model: OPENROUTER_DEFAULT_MODEL,
    defaultBaseUrl: OPENROUTER_DEFAULT_BASE_URL,
    requiresApiKey: true
  },
  openai_compatible: {
    label: 'Local / OpenAI-compatible',
    model: '',
    defaultBaseUrl: OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
    requiresApiKey: false
  },
  meta: {
    label: 'Meta',
    model: '',
    requiresApiKey: true
  }
};

const normalizeOpenAiCompatibleBaseUrl = (value = '', fallback = '') => {
  let url = String(value || '').trim().replace(/\/+$/, '');
  if (!url) {
    url = String(fallback || '').trim().replace(/\/+$/, '');
  }
  if (!url) return '';

  try {
    const parsed = new URL(url);
    if (!parsed.pathname || parsed.pathname === '/') {
      return `${parsed.origin}/v1`;
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return url;
  }
};

const buildOpenAiCompatibleChatCompletionsUrl = (baseUrl = '', fallback = '') => {
  const normalized = normalizeOpenAiCompatibleBaseUrl(baseUrl, fallback);
  if (!normalized) return '';
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  return `${normalized}/chat/completions`;
};
const AI_GENERATION_PROFILE_DEFAULTS = Object.freeze({
  temperature: 0.7,
  topP: 0.9,
  maxOutputTokens: 8192
});
const AI_MAX_OUTPUT_TOKENS_LIMIT = 8192;
const AI_CONTINUATION_MAX_REQUESTS = 3;
const AI_CONTINUATION_CONTEXT_CHARS = 4000;

// In-memory token cache keyed by `${provider}|${clientId}|${user}`
const oauth2TokenCache = new Map();
const msalClientCache = new Map();
const desktopAiRequestControllers = new Map();

const getMsalClient = (clientId, tenantId) => {
  const key = `${clientId}|${tenantId}`;
  if (msalClientCache.has(key)) return msalClientCache.get(key);
  const config = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId || 'common'}`,
    }
  };
  const pca = new msal.PublicClientApplication(config);
  msalClientCache.set(key, pca);
  return pca;
};

const buildOAuth2CacheKey = (provider, clientId, user) => `${provider}|${clientId}|${user.toLowerCase()}`;

const normalizeOAuthProvider = (value = '') => {
  const provider = String(value || 'microsoft').trim().toLowerCase();
  return provider === 'google' ? 'google' : 'microsoft';
};

const normalizeMailAuthMethod = (value = '') => {
  const method = String(value || 'basic').trim().toLowerCase();
  return method === 'oauth2' ? 'oauth2' : 'basic';
};

const normalizeSmtpSecureMode = (value = '') => {
  const mode = String(value || 'tls').trim().toLowerCase();
  if (mode === 'none' || mode === 'ssl') {
    return mode;
  }
  return 'tls';
};

const normalizeScopeSet = (value = '') => {
  const scopeSet = String(value || 'imap').trim().toLowerCase();
  return scopeSet === 'graph' ? 'graph' : 'imap';
};

// --- Microsoft OAuth2 ---
const acquireMsOAuth2Interactive = async (clientId, tenantId, loginHint, scopeSet = 'imap') => {
  const pca = getMsalClient(clientId, tenantId);
  const scopes = MS_OAUTH2_SCOPES[scopeSet] || MS_OAUTH2_SCOPES.imap;

  const authCodeUrl = await pca.getAuthCodeUrl({
    scopes,
    redirectUri: OAUTH2_REDIRECT_URI,
    loginHint: loginHint || undefined
  });

  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 520,
      height: 700,
      show: true,
      autoHideMenuBar: true,
      title: 'Sign in with Microsoft',
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    let settled = false;
    authWindow.loadURL(authCodeUrl);

    const handleRedirect = async (url) => {
      if (settled) return;
      try {
        const parsed = new URL(url);
        if (!parsed.href.startsWith(OAUTH2_REDIRECT_URI)) return;

        const code = parsed.searchParams.get('code');
        const error = parsed.searchParams.get('error');
        const errorDescription = parsed.searchParams.get('error_description');

        if (error) {
          settled = true;
          if (!authWindow.isDestroyed()) authWindow.destroy();
          reject(new Error(`Microsoft login error: ${error} — ${errorDescription || 'No details.'}`));
          return;
        }
        if (!code) return;

        settled = true;
        const tokenResponse = await pca.acquireTokenByCode({ code, scopes, redirectUri: OAUTH2_REDIRECT_URI });
        if (!authWindow.isDestroyed()) authWindow.destroy();

        const account = tokenResponse.account;
        const cacheKey = buildOAuth2CacheKey('microsoft', clientId, account?.username || loginHint || '');
        oauth2TokenCache.set(cacheKey, {
          provider: 'microsoft',
          accessToken: tokenResponse.accessToken,
          expiresOn: tokenResponse.expiresOn,
          account,
          idTokenClaims: tokenResponse.idTokenClaims,
          scopeSet
        });

        resolve({
          ok: true,
          provider: 'microsoft',
          accessToken: tokenResponse.accessToken,
          expiresOn: tokenResponse.expiresOn?.toISOString(),
          user: account?.username || loginHint || '',
          name: account?.name || ''
        });
      } catch (err) {
        if (!settled) {
          settled = true;
          if (!authWindow.isDestroyed()) authWindow.destroy();
          reject(err);
        }
      }
    };

    authWindow.webContents.on('will-redirect', (_event, url) => handleRedirect(url));
    authWindow.webContents.on('will-navigate', (_event, url) => handleRedirect(url));
    authWindow.on('closed', () => {
      if (!settled) {
        settled = true;
        reject(new Error('Microsoft login window was closed before authentication completed.'));
      }
    });
  });
};

const acquireMsOAuth2Silent = async (clientId, tenantId, user, scopeSet = 'imap') => {
  const pca = getMsalClient(clientId, tenantId);
  const cacheKey = buildOAuth2CacheKey('microsoft', clientId, user);
  const cached = oauth2TokenCache.get(cacheKey);
  if (!cached?.account) return null;

  if (cached.accessToken && cached.expiresOn && new Date(cached.expiresOn) > new Date(Date.now() + 120000)) {
    return cached.accessToken;
  }

  try {
    const scopes = MS_OAUTH2_SCOPES[scopeSet] || MS_OAUTH2_SCOPES.imap;
    const result = await pca.acquireTokenSilent({ account: cached.account, scopes });
    oauth2TokenCache.set(cacheKey, {
      provider: 'microsoft',
      accessToken: result.accessToken,
      expiresOn: result.expiresOn,
      account: result.account || cached.account,
      idTokenClaims: result.idTokenClaims || cached.idTokenClaims,
      scopeSet
    });
    return result.accessToken;
  } catch {
    return null;
  }
};

const getMsAccessToken = async (clientId, tenantId, user, scopeSet = 'imap') => {
  const silent = await acquireMsOAuth2Silent(clientId, tenantId, user, scopeSet);
  if (silent) return silent;
  const interactive = await acquireMsOAuth2Interactive(clientId, tenantId, user, scopeSet);
  return interactive.accessToken;
};

// --- Google OAuth2 ---
const googleTokenStore = new Map(); // keyed by `google|${clientId}|${user}`

const createGoogleLoopbackServer = async (expectedState) => {
  let settled = false;
  let closed = false;
  let resolveCallback;
  let rejectCallback;

  const callbackPromise = new Promise((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const settle = (fn, value) => {
    if (settled) return;
    settled = true;
    fn(value);
  };

  const server = http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      if (requestUrl.pathname !== '/oauth2/google/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const code = requestUrl.searchParams.get('code');
      const error = requestUrl.searchParams.get('error');
      const errorDescription = requestUrl.searchParams.get('error_description');
      const returnedState = requestUrl.searchParams.get('state');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h2>Google sign-in failed</h2><p>You can close this tab and return to SalesDirector.</p></body></html>');
        settle(rejectCallback, new Error(`Google login error: ${errorDescription || error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h2>Missing authorization code</h2><p>You can close this tab and try signing in again from SalesDirector.</p></body></html>');
        settle(rejectCallback, new Error('Google login did not return an authorization code.'));
        return;
      }

      if (!returnedState || returnedState !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h2>State mismatch</h2><p>You can close this tab and try signing in again from SalesDirector.</p></body></html>');
        settle(rejectCallback, new Error('Google login state mismatch. Please try signing in again.'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h2>Google sign-in complete</h2><p>You can close this tab and return to SalesDirector.</p></body></html>');
      settle(resolveCallback, { code });
    } catch (error) {
      settle(rejectCallback, error);
    }
  });

  const closeServer = () => new Promise((resolve) => {
    if (closed) {
      resolve();
      return;
    }
    closed = true;
    server.close(() => resolve());
  });

  await new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolve();
    };
    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(0, '127.0.0.1');
  });

  const address = server.address();
  if (!address || typeof address !== 'object') {
    await closeServer();
    throw new Error('Failed to reserve a local callback port for Google sign-in.');
  }

  const timeoutId = setTimeout(() => {
    settle(rejectCallback, new Error('Google sign-in timed out. Finish the browser sign-in and try again.'));
  }, 180000);

  return {
    redirectUri: `http://127.0.0.1:${address.port}/oauth2/google/callback`,
    waitForCallback: async () => {
      try {
        return await callbackPromise;
      } finally {
        clearTimeout(timeoutId);
        await closeServer();
      }
    }
  };
};

const acquireGoogleOAuth2Interactive = async (clientId, clientSecret, loginHint) => {
  const state = crypto.randomBytes(16).toString('hex');
  const loopback = await createGoogleLoopbackServer(state);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: loopback.redirectUri,
    response_type: 'code',
    scope: GOOGLE_OAUTH2_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
    login_hint: loginHint || ''
  });
  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

  await shell.openExternal(authUrl);

  const { code } = await loopback.waitForCallback();
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: loopback.redirectUri,
      grant_type: 'authorization_code'
    }).toString()
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    throw new Error(`Google token error: ${tokenData.error} — ${tokenData.error_description || ''}`);
  }

  let email = loginHint || '';
  if (tokenData.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString());
      email = payload.email || email;
    } catch {
      // Ignore ID token decode errors and keep the login hint as the cache key fallback.
    }
  }

  const expiresOn = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);
  const cacheKey = buildOAuth2CacheKey('google', clientId, email);
  const tokenEntry = {
    provider: 'google',
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresOn,
    user: email,
    clientId,
    clientSecret
  };
  oauth2TokenCache.set(cacheKey, tokenEntry);
  googleTokenStore.set(cacheKey, tokenEntry);

  return {
    ok: true,
    provider: 'google',
    accessToken: tokenData.access_token,
    expiresOn: expiresOn.toISOString(),
    user: email,
    name: ''
  };
};

const refreshGoogleToken = async (cacheKey) => {
  const stored = googleTokenStore.get(cacheKey);
  if (!stored?.refreshToken) return null;

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: stored.refreshToken,
        client_id: stored.clientId,
        client_secret: stored.clientSecret,
        grant_type: 'refresh_token'
      }).toString()
    });
    const data = await res.json();
    if (data.error) return null;

    const expiresOn = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    const updated = { ...stored, accessToken: data.access_token, expiresOn };
    if (data.refresh_token) updated.refreshToken = data.refresh_token;
    oauth2TokenCache.set(cacheKey, updated);
    googleTokenStore.set(cacheKey, updated);
    return data.access_token;
  } catch {
    return null;
  }
};

const getGoogleAccessToken = async (clientId, clientSecret, user) => {
  const cacheKey = buildOAuth2CacheKey('google', clientId, user);
  const cached = oauth2TokenCache.get(cacheKey);

  if (cached?.accessToken && cached.expiresOn && new Date(cached.expiresOn) > new Date(Date.now() + 120000)) {
    return cached.accessToken;
  }

  // Try refresh
  const refreshed = await refreshGoogleToken(cacheKey);
  if (refreshed) return refreshed;

  // Fall back to interactive
  const interactive = await acquireGoogleOAuth2Interactive(clientId, clientSecret, user);
  return interactive.accessToken;
};

// --- Unified OAuth2 accessor ---
const getOAuth2AccessToken = async (provider, clientId, opts = {}) => {
  const normalizedProvider = normalizeOAuthProvider(provider);
  if (normalizedProvider === 'google') {
    return getGoogleAccessToken(clientId, opts.clientSecret || '', opts.user || '');
  }
  // Default: microsoft
  return getMsAccessToken(clientId, opts.tenantId || '', opts.user || '', normalizeScopeSet(opts.scopeSet));
};

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
  const authMethod = normalizeMailAuthMethod(payload.authMethod);
  const oauth2Provider = normalizeOAuthProvider(payload.oauth2Provider);
  const oauth2ClientId = String(payload.oauth2ClientId || '').trim();
  const oauth2TenantId = String(payload.oauth2TenantId || '').trim();
  const oauth2ClientSecret = String(payload.oauth2ClientSecret || '').trim();

  if (!host) throw new Error('IMAP host is required.');
  if (!user) throw new Error('IMAP username is required.');

  if (authMethod === 'oauth2') {
    if (!oauth2ClientId) throw new Error('OAuth2 Client ID is required.');
    if (oauth2Provider === 'google' && !oauth2ClientSecret) throw new Error('Google OAuth2 Client Secret is required.');
  } else {
    if (!password) throw new Error('IMAP password or app password is required.');
  }

  return { host, user, password, secure, port, folder, archiveFolder, authMethod, oauth2Provider, oauth2ClientId, oauth2TenantId, oauth2ClientSecret };
};

const buildImapClient = async (connParams) => {
  const { host, port, secure, user, password, authMethod, oauth2Provider, oauth2ClientId, oauth2TenantId, oauth2ClientSecret } = connParams;

  if (authMethod === 'oauth2') {
    const token = await getOAuth2AccessToken(oauth2Provider, oauth2ClientId, {
      tenantId: oauth2TenantId,
      clientSecret: oauth2ClientSecret,
      user,
      scopeSet: 'imap'
    });
    if (!token) throw new Error('Failed to obtain OAuth2 access token. Please sign in again.');

    return new ImapFlow({
      host,
      port,
      secure,
      auth: { user, accessToken: token },
      logger: false
    });
  }

  return new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass: password },
    logger: false
  });
};

// --- SMTP Sending ---
const parseSmtpConnection = (payload = {}) => {
  const host = String(payload.smtpHost || '').trim();
  const user = String(payload.smtpUser || '').trim();
  const password = String(payload.smtpPass || '');
  const portRaw = clampInt(payload.smtpPort, 1, 65535, 587);
  const secureMode = normalizeSmtpSecureMode(payload.smtpSecure);
  const authMethod = normalizeMailAuthMethod(payload.smtpAuthMethod);
  const oauth2Provider = normalizeOAuthProvider(payload.oauth2Provider);
  const oauth2ClientId = String(payload.oauth2ClientId || '').trim();
  const oauth2TenantId = String(payload.oauth2TenantId || '').trim();
  const oauth2ClientSecret = String(payload.oauth2ClientSecret || '').trim();

  if (!host) throw new Error('SMTP host is required.');
  if (!user) throw new Error('SMTP username is required.');

  if (authMethod === 'oauth2') {
    if (!oauth2ClientId) throw new Error('OAuth2 Client ID is required for SMTP.');
    if (oauth2Provider === 'google' && !oauth2ClientSecret) throw new Error('Google OAuth2 Client Secret is required.');
  } else {
    if (!password) throw new Error('SMTP password is required.');
  }

  return { host, user, password, port: portRaw, secureMode, authMethod, oauth2Provider, oauth2ClientId, oauth2TenantId, oauth2ClientSecret };
};

const buildSmtpTransport = async (connParams) => {
  const { host, port, secureMode, user, password, authMethod, oauth2Provider, oauth2ClientId, oauth2TenantId, oauth2ClientSecret } = connParams;
  const useSsl = secureMode === 'ssl';
  const useStartTls = secureMode === 'tls';

  const transportConfig = {
    host,
    port,
    secure: useSsl,
    requireTLS: useStartTls,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000
  };

  if (authMethod === 'oauth2') {
    const token = await getOAuth2AccessToken(oauth2Provider, oauth2ClientId, {
      tenantId: oauth2TenantId,
      clientSecret: oauth2ClientSecret,
      user,
      scopeSet: 'imap' // Microsoft uses same token for SMTP.Send
    });
    if (!token) throw new Error('Failed to obtain OAuth2 access token for SMTP.');
    transportConfig.auth = { type: 'OAuth2', user, accessToken: token };
  } else {
    transportConfig.auth = { user, pass: password };
  }

  return nodemailer.createTransport(transportConfig);
};

// --- Microsoft Graph API ---
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const graphFetch = async (accessToken, endpoint, options = {}) => {
  const url = endpoint.startsWith('http') ? endpoint : `${GRAPH_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph API ${res.status}: ${body.slice(0, 500)}`);
  }
  if (res.status === 204) return null;
  return res.json();
};

const normalizeGraphEmail = (msg) => {
  const from = msg.from?.emailAddress || {};
  const fromEmail = String(from.address || '').trim().toLowerCase();
  const fromName = String(from.name || fromEmail || 'Unknown Sender').trim();
  const dateIso = msg.receivedDateTime || new Date().toISOString();

  return {
    id: `graph-${msg.id}`,
    source: 'graph',
    sourceId: msg.id,
    uid: null,
    graphId: msg.id,
    messageId: String(msg.internetMessageId || '').trim(),
    fromName,
    fromEmail,
    company: formatCompanyFromEmail(fromEmail),
    subject: String(msg.subject || 'No subject').trim(),
    body: sanitizeBodyPreview(msg.bodyPreview || msg.body?.content || ''),
    dateRaw: dateIso,
    date: new Date(dateIso).toLocaleDateString(),
    isRead: Boolean(msg.isRead),
    needsResponse: !msg.isRead && !msg.isDraft,
    isArchived: false,
    aiScore: null,
    aiSummary: ''
  };
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

const normalizeAiProvider = (value) => {
  const provider = String(value || 'gemini').trim().toLowerCase();
  return AI_PROVIDER_CONFIG[provider] ? provider : 'gemini';
};

const clampAiSetting = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const buildAiGenerationProfile = (input = {}) => ({
  temperature: clampAiSetting(input.temperature ?? input.aiTemperature, 0, 1.5, AI_GENERATION_PROFILE_DEFAULTS.temperature),
  topP: clampAiSetting(input.topP ?? input.aiTopP, 0, 1, AI_GENERATION_PROFILE_DEFAULTS.topP),
  maxOutputTokens: Math.round(clampAiSetting(input.maxOutputTokens ?? input.aiMaxOutputTokens, 256, AI_MAX_OUTPUT_TOKENS_LIMIT, AI_GENERATION_PROFILE_DEFAULTS.maxOutputTokens))
});

const buildGeminiGenerationConfig = (profile) => ({
  temperature: profile.temperature,
  topP: profile.topP,
  maxOutputTokens: profile.maxOutputTokens
});

const buildAnthropicGenerationConfig = (profile) => ({
  temperature: profile.temperature,
  top_p: profile.topP,
  max_tokens: profile.maxOutputTokens
});

const buildOpenAiCompatibleGenerationConfig = (profile) => ({
  temperature: profile.temperature,
  top_p: profile.topP,
  max_tokens: profile.maxOutputTokens
});

const getAiSystemInstructionText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value?.text === 'string') return value.text.trim();
  if (Array.isArray(value?.parts)) {
    return value.parts
      .map((part) => String(part?.text || '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
};

const getProviderErrorMessage = async (response, fallbackMessage) => {
  const rawBody = await response.text().catch(() => '');
  if (!rawBody) {
    return `${fallbackMessage} (${response.status}).`;
  }

  try {
    const parsed = JSON.parse(rawBody);
    const firstAnthropicMessage = Array.isArray(parsed?.error?.details)
      ? parsed.error.details.find((detail) => detail?.message)?.message
      : '';
    return String(
      parsed?.error?.message
      || parsed?.error?.details?.message
      || parsed?.message
      || firstAnthropicMessage
      || rawBody
    ).trim() || `${fallbackMessage} (${response.status}).`;
  } catch {
    return rawBody.trim() || `${fallbackMessage} (${response.status}).`;
  }
};

const flattenProviderText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => flattenProviderText(item))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.output_text === 'string') return value.output_text;
    if (typeof value.content === 'string') return value.content;
    if (Array.isArray(value.content)) return flattenProviderText(value.content);
  }
  return '';
};

const hasLengthLimitedAiResponse = (provider, finishReason) => {
  const normalizedProvider = normalizeAiProvider(provider);
  const normalizedReason = String(finishReason || '').trim().toLowerCase();
  if (!normalizedReason) return false;
  if (normalizedProvider === 'gemini' || normalizedProvider === 'anthropic') {
    return normalizedReason === 'max_tokens';
  }
  return normalizedReason === 'length' || normalizedReason === 'max_tokens';
};

const buildAiContinuationPrompt = (originalPromptText, accumulatedText) => {
  const prompt = String(originalPromptText || '').trim();
  const continuationTail = String(accumulatedText || '').trim().slice(-AI_CONTINUATION_CONTEXT_CHARS);
  return [
    prompt,
    'Continue the same response exactly where you stopped because the previous answer hit the output token limit.',
    'Rules:',
    '- Do not repeat or restart prior text.',
    '- Do not add commentary about continuing.',
    '- Output only the remaining continuation.',
    'Recent tail of the previous response for context:',
    continuationTail
  ].filter(Boolean).join('\n\n').trim();
};

const stitchAiContinuationText = (existingText, nextText) => {
  const base = String(existingText || '').trimEnd();
  const addition = String(nextText || '').trim();
  if (!base) return addition;
  if (!addition) return base;
  if (base.endsWith(addition)) return base;

  const maxOverlap = Math.min(800, base.length, addition.length);
  for (let overlap = maxOverlap; overlap >= 80; overlap -= 1) {
    if (base.slice(-overlap) === addition.slice(0, overlap)) {
      return `${base}${addition.slice(overlap)}`.trim();
    }
  }

  return `${base}\n${addition}`.trim();
};

const requestDesktopAiText = async ({
  provider,
  apiKey,
  promptText,
  systemInstruction,
  generationProfile,
  signal,
  model,
  baseUrl
}) => {
  const normalizedProvider = normalizeAiProvider(provider);
  const providerConfig = AI_PROVIDER_CONFIG[normalizedProvider] || AI_PROVIDER_CONFIG.gemini;
  const systemText = getAiSystemInstructionText(systemInstruction);
  const sharedGenerationProfile = buildAiGenerationProfile(generationProfile);
  const resolvedModel = String(model || providerConfig.model || '').trim();
  const resolvedBaseUrl = normalizeOpenAiCompatibleBaseUrl(
    baseUrl,
    providerConfig.defaultBaseUrl || ''
  );

  if (!promptText) {
    throw new Error('AI prompt text is required.');
  }

  if (normalizedProvider === 'meta') {
    throw new Error('Meta direct routing is not available yet. Use Gemini, OpenAI, Anthropic, xAI, OpenRouter, a local OpenAI-compatible server, or proxy mode.');
  }

  if (providerConfig.requiresApiKey !== false && !apiKey) {
    throw new Error(`${providerConfig.label} API key is required.`);
  }

  if ((normalizedProvider === 'openrouter' || normalizedProvider === 'openai_compatible' || normalizedProvider === 'openai' || normalizedProvider === 'xai') && !resolvedModel) {
    throw new Error(`${providerConfig.label} model id is required.`);
  }

  const requestSingleText = async (requestPromptText) => {
    if (normalizedProvider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${providerConfig.model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: requestPromptText }] }],
          systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
          generationConfig: buildGeminiGenerationConfig(sharedGenerationProfile)
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(await getProviderErrorMessage(response, `${providerConfig.label} request failed`));
      }

      const data = await response.json();
      const text = flattenProviderText(data?.candidates?.map((candidate) => candidate?.content?.parts || []));
      if (!text.trim()) {
        const finishReason = String(data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || '').trim();
        throw new Error(finishReason ? `${providerConfig.label} returned no usable text (${finishReason}).` : `${providerConfig.label} returned no usable text.`);
      }

      return {
        text: text.trim(),
        shouldContinue: hasLengthLimitedAiResponse(normalizedProvider, data?.candidates?.[0]?.finishReason)
      };
    }

    if (normalizedProvider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: resolvedModel || providerConfig.model,
          ...buildAnthropicGenerationConfig(sharedGenerationProfile),
          system: systemText || undefined,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: requestPromptText }]
            }
          ]
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(await getProviderErrorMessage(response, `${providerConfig.label} request failed`));
      }

      const data = await response.json();
      const text = flattenProviderText(data?.content || []);
      if (!text.trim()) {
        throw new Error(`${providerConfig.label} returned no usable text.`);
      }

      return {
        text: text.trim(),
        shouldContinue: hasLengthLimitedAiResponse(normalizedProvider, data?.stop_reason)
      };
    }

    const openAiCompatibleUrl = buildOpenAiCompatibleChatCompletionsUrl(
      resolvedBaseUrl,
      providerConfig.defaultBaseUrl || (normalizedProvider === 'xai' ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1')
    );
    if (!openAiCompatibleUrl) {
      throw new Error(`${providerConfig.label} base URL is missing.`);
    }

    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    if (normalizedProvider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://www.akitaengineering.com';
      headers['X-Title'] = 'SalesDirector';
    }

    const response = await fetch(openAiCompatibleUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: resolvedModel,
        ...buildOpenAiCompatibleGenerationConfig(sharedGenerationProfile),
        messages: [
          ...(systemText ? [{ role: 'system', content: systemText }] : []),
          { role: 'user', content: requestPromptText }
        ]
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(await getProviderErrorMessage(response, `${providerConfig.label} request failed`));
    }

    const data = await response.json();
    const text = flattenProviderText(data?.choices?.[0]?.message?.content);
    if (!text.trim()) {
      throw new Error(`${providerConfig.label} returned no usable text.`);
    }

    return {
      text: text.trim(),
      shouldContinue: hasLengthLimitedAiResponse(normalizedProvider, data?.choices?.[0]?.finish_reason)
    };
  };

  let accumulatedText = '';
  let currentPromptText = promptText;

  for (let continuationIndex = 0; continuationIndex <= AI_CONTINUATION_MAX_REQUESTS; continuationIndex += 1) {
    const nextResult = await requestSingleText(currentPromptText);
    const stitchedText = stitchAiContinuationText(accumulatedText, nextResult.text);

    if (stitchedText === accumulatedText && accumulatedText) {
      break;
    }

    accumulatedText = stitchedText;
    if (!nextResult.shouldContinue || continuationIndex === AI_CONTINUATION_MAX_REQUESTS) {
      break;
    }

    currentPromptText = buildAiContinuationPrompt(promptText, accumulatedText);
  }

  if (!accumulatedText.trim()) {
    throw new Error(`${providerConfig.label} returned no usable text.`);
  }

  return accumulatedText.trim();
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

  ipcMain.handle('ai:generateText', async (_event, payload = {}) => {
    const requestId = String(payload.requestId || crypto.randomUUID()).trim();
    const controller = new AbortController();
    desktopAiRequestControllers.set(requestId, controller);

    try {
      const provider = normalizeAiProvider(payload.provider);
      const promptText = String(payload.promptText || '').trim();
      const apiKey = String(payload.apiKey || '').trim();
      const model = String(payload.model || '').trim();
      const baseUrl = String(payload.baseUrl || '').trim();
      const systemInstruction = payload.systemInstruction || '';
      const generationProfile = buildAiGenerationProfile(payload.generationProfile || {});
      const text = await requestDesktopAiText({
        provider,
        apiKey,
        model,
        baseUrl,
        promptText,
        systemInstruction,
        generationProfile,
        signal: controller.signal
      });

      return { ok: true, provider, text };
    } finally {
      desktopAiRequestControllers.delete(requestId);
    }
  });

  ipcMain.on('ai:cancelRequest', (_event, requestId = '') => {
    const normalizedId = String(requestId || '').trim();
    if (!normalizedId) return;
    desktopAiRequestControllers.get(normalizedId)?.abort();
  });

  ipcMain.handle('imap:syncInbox', async (_event, payload = {}) => {
    const connParams = parseImapConnection(payload);
    const { folder } = connParams;
    const lookbackDays = clampInt(payload.lookbackDays, 1, 365, 14);
    const limit = clampInt(payload.limit, 1, 200, 50);
    const unreadOnly = Boolean(payload.unreadOnly);

    const client = await buildImapClient(connParams);

    let mailboxLock;
    try {
      await client.connect();
      mailboxLock = await client.getMailboxLock(folder);

      const toUidList = (result) => {
        const list = Array.isArray(result)
          ? result
          : (Array.isArray(result?.all) ? result.all : []);
        return list
          .map((uid) => Number(uid))
          .filter((uid) => Number.isInteger(uid) && uid > 0);
      };

      const sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      const searchQuery = unreadOnly
        ? { seen: false, since: sinceDate }
        : { since: sinceDate };

      let matchedUids = toUidList(await client.search(searchQuery, { uid: true }));
      if (matchedUids.length === 0) {
        const fallbackQuery = unreadOnly ? { seen: false } : { all: true };
        matchedUids = toUidList(await client.search(fallbackQuery, { uid: true }));
      }

      const selectedUids = matchedUids
        .map((uid) => Number(uid))
        .filter((uid) => Number.isInteger(uid) && uid > 0)
        .slice(-limit)
        .reverse();

      const emails = [];
      for (const uid of selectedUids) {
        const fetched = await client.fetchOne(
          uid,
          {
            uid: true,
            flags: true,
            internalDate: true,
            source: true
          },
          { uid: true }
        );

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
    const connParams = parseImapConnection(payload);
    const { folder, archiveFolder } = connParams;

    const action = String(payload.action || '').trim();
    const uid = clampInt(payload.uid, 1, Number.MAX_SAFE_INTEGER, 0);
    if (!uid) {
      throw new Error('A valid IMAP message UID is required.');
    }

    const value = Boolean(payload.value);
    const currentFolder = String(payload.currentFolder || folder).trim() || folder;

    const client = await buildImapClient(connParams);

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

  // --- OAuth2 IPC handlers ---
  ipcMain.handle('imap:oauth2Login', async (_event, payload = {}) => {
    const provider = normalizeOAuthProvider(payload.provider);
    const clientId = String(payload.clientId || '').trim();
    const tenantId = String(payload.tenantId || '').trim();
    const clientSecret = String(payload.clientSecret || '').trim();
    const loginHint = String(payload.loginHint || '').trim();
    const scopeSet = normalizeScopeSet(payload.scopeSet);

    if (!clientId) throw new Error('OAuth2 Client ID (Application ID) is required.');

    if (provider === 'google') {
      if (!clientSecret) throw new Error('Google OAuth2 Client Secret is required.');
      return acquireGoogleOAuth2Interactive(clientId, clientSecret, loginHint);
    }
    return acquireMsOAuth2Interactive(clientId, tenantId, loginHint, scopeSet);
  });

  ipcMain.handle('imap:oauth2Status', async (_event, payload = {}) => {
    const provider = normalizeOAuthProvider(payload.provider);
    const clientId = String(payload.clientId || '').trim();
    const user = String(payload.user || '').trim();

    if (!clientId || !user) return { authenticated: false };

    const cacheKey = buildOAuth2CacheKey(provider, clientId, user);
    const cached = oauth2TokenCache.get(cacheKey);

    if (!cached?.accessToken) return { authenticated: false };

    const expired = cached.expiresOn && new Date(cached.expiresOn) <= new Date();
    return {
      authenticated: true,
      provider,
      user: cached.user || cached.account?.username || user,
      name: cached.account?.name || '',
      expired: Boolean(expired),
      expiresOn: cached.expiresOn ? new Date(cached.expiresOn).toISOString() : null
    };
  });

  ipcMain.handle('imap:oauth2Logout', async (_event, payload = {}) => {
    const provider = normalizeOAuthProvider(payload.provider);
    const clientId = String(payload.clientId || '').trim();
    const user = String(payload.user || '').trim();

    if (clientId && user) {
      const cacheKey = buildOAuth2CacheKey(provider, clientId, user);
      oauth2TokenCache.delete(cacheKey);
      googleTokenStore.delete(cacheKey);
    }
    return { ok: true };
  });

  // --- Connection Test handlers ---
  ipcMain.handle('imap:testConnection', async (_event, payload = {}) => {
    const connParams = parseImapConnection(payload);
    const client = await buildImapClient(connParams);
    try {
      await client.connect();
      const mailbox = await client.status(connParams.folder, { messages: true, unseen: true });
      return {
        ok: true,
        folder: connParams.folder,
        totalMessages: mailbox?.messages ?? null,
        unseenMessages: mailbox?.unseen ?? null
      };
    } finally {
      await client.logout().catch(() => {});
    }
  });

  ipcMain.handle('smtp:testConnection', async (_event, payload = {}) => {
    const connParams = parseSmtpConnection(payload);
    const transport = await buildSmtpTransport(connParams);
    try {
      await transport.verify();
      return { ok: true };
    } finally {
      transport.close();
    }
  });

  // --- SMTP Sending ---
  ipcMain.handle('smtp:sendEmail', async (_event, payload = {}) => {
    const connParams = parseSmtpConnection(payload);
    const to = String(payload.to || '').trim();
    const subject = String(payload.subject || '').trim();
    const text = String(payload.text || '');
    const html = String(payload.html || '');
    const from = String(payload.from || connParams.user).trim();
    const replyTo = String(payload.replyTo || '').trim() || undefined;
    const bcc = String(payload.bcc || '').trim() || undefined;
    const inReplyTo = String(payload.inReplyTo || '').trim() || undefined;
    const references = String(payload.references || '').trim() || undefined;

    if (!to) throw new Error('Recipient email (to) is required.');
    if (!subject && !text && !html) throw new Error('Email must have a subject or body.');

    const transport = await buildSmtpTransport(connParams);
    try {
      const info = await transport.sendMail({
        from,
        to,
        subject,
        text: text || undefined,
        html: html || undefined,
        replyTo,
        bcc,
        inReplyTo,
        references
      });
      return {
        ok: true,
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected
      };
    } finally {
      transport.close();
    }
  });

  // --- Microsoft Graph API handlers ---
  ipcMain.handle('graph:syncInbox', async (_event, payload = {}) => {
    const clientId = String(payload.oauth2ClientId || '').trim();
    const tenantId = String(payload.oauth2TenantId || '').trim();
    const user = String(payload.user || '').trim();
    const lookbackDays = clampInt(payload.lookbackDays, 1, 365, 14);
    const limit = clampInt(payload.limit, 1, 200, 50);
    const unreadOnly = Boolean(payload.unreadOnly);

    if (!clientId) throw new Error('OAuth2 Client ID is required for Graph API.');
    if (!user) throw new Error('User email is required for Graph API.');

    const token = await getOAuth2AccessToken('microsoft', clientId, { tenantId, user, scopeSet: 'graph' });
    if (!token) throw new Error('Failed to obtain Graph API access token.');

    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    let filter = `receivedDateTime ge ${since}`;
    if (unreadOnly) filter += ' and isRead eq false';

    const result = await graphFetch(token, `/me/messages?$filter=${encodeURIComponent(filter)}&$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,from,receivedDateTime,isRead,isDraft,internetMessageId,flag,body`);

    const emails = (result?.value || []).map(normalizeGraphEmail);
    return {
      ok: true,
      folder: 'Inbox',
      lookbackDays,
      limit,
      matchedCount: result?.['@odata.count'] || emails.length,
      fetchedCount: emails.length,
      fetchedAt: new Date().toISOString(),
      emails
    };
  });

  ipcMain.handle('graph:sendEmail', async (_event, payload = {}) => {
    const clientId = String(payload.oauth2ClientId || '').trim();
    const tenantId = String(payload.oauth2TenantId || '').trim();
    const user = String(payload.user || '').trim();
    const to = String(payload.to || '').trim();
    const subject = String(payload.subject || '').trim();
    const body = String(payload.body || '');
    const contentType = String(payload.contentType || 'Text').trim();
    const replyTo = String(payload.replyTo || '').trim();
    const bcc = String(payload.bcc || '').trim();

    if (!clientId) throw new Error('OAuth2 Client ID is required.');
    if (!to) throw new Error('Recipient email is required.');

    const token = await getOAuth2AccessToken('microsoft', clientId, { tenantId, user, scopeSet: 'graph' });
    if (!token) throw new Error('Failed to obtain Graph API access token.');

    const message = {
      subject,
      body: { contentType, content: body },
      toRecipients: to.split(',').map((addr) => ({ emailAddress: { address: addr.trim() } }))
    };
    if (replyTo) message.replyTo = [{ emailAddress: { address: replyTo } }];
    if (bcc) message.bccRecipients = bcc.split(',').map((addr) => ({ emailAddress: { address: addr.trim() } }));

    await graphFetch(token, '/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({ message, saveToSentItems: true })
    });

    return { ok: true };
  });

  ipcMain.handle('graph:updateMessageState', async (_event, payload = {}) => {
    const clientId = String(payload.oauth2ClientId || '').trim();
    const tenantId = String(payload.oauth2TenantId || '').trim();
    const user = String(payload.user || '').trim();
    const graphId = String(payload.graphId || '').trim();
    const action = String(payload.action || '').trim();
    const value = Boolean(payload.value);

    if (!graphId) throw new Error('Graph message ID is required.');

    const token = await getOAuth2AccessToken('microsoft', clientId, { tenantId, user, scopeSet: 'graph' });
    if (!token) throw new Error('Failed to obtain Graph API access token.');

    if (action === 'setRead') {
      await graphFetch(token, `/me/messages/${graphId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: value })
      });
      return { ok: true, action, graphId, value };
    }

    if (action === 'setFlagged') {
      await graphFetch(token, `/me/messages/${graphId}`, {
        method: 'PATCH',
        body: JSON.stringify({ flag: { flagStatus: value ? 'flagged' : 'notFlagged' } })
      });
      return { ok: true, action, graphId, value };
    }

    if (action === 'setArchived') {
      const archiveFolder = String(payload.archiveFolder || 'archive').trim();
      const destFolder = value ? archiveFolder : 'inbox';
      // Resolve well-known folder name or use folder ID
      await graphFetch(token, `/me/messages/${graphId}/move`, {
        method: 'POST',
        body: JSON.stringify({ destinationId: destFolder })
      });
      return { ok: true, action, graphId, value };
    }

    throw new Error(`Unsupported Graph message action: ${action}`);
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
  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize;
  const minWidth = Math.min(960, workAreaWidth);
  const minHeight = Math.min(640, workAreaHeight);
  const width = Math.max(minWidth, Math.min(1440, workAreaWidth - 48));
  const height = Math.max(minHeight, Math.min(900, workAreaHeight - 48));

  const window = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
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
