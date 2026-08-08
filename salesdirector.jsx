import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Mail, Users, Settings, Activity, Send, 
  RefreshCw, CheckCircle, AlertCircle, Wand2, 
  FileText, MessageSquare, Database, Server, Key,
  ChevronRight, Search, Inbox, Edit3, Globe,
  Lock, User, Shield, SlidersHorizontal, Sparkles, UploadCloud, ListChecks,
  Briefcase, TrendingUp, Save, Calendar, ShieldAlert, Layers,
  Phone, Moon, Sun, Clock, X, PenTool, Type, Plus, Trash2, Linkedin,
  CheckSquare, CalendarDays, MoreVertical, Play, Check,
  Archive, Eye, EyeOff, Filter, Zap, Target, Star, PhoneCall, RotateCcw, Menu
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  normalizeEmail,
  isValidEmail,
  splitCsvRows,
  parseCsvLine,
  toContactFromRow,
  applyTaskPrioritization,
  parseInboxScoreSummary
} from './utils/dataParsers.mjs';
import {
  buildOutreachPlayContext,
  canReplyToInboxEmail,
  createComposerResetState,
  buildComposerStateFromInboxEmail,
  buildHandledInboxEmailUpdate,
  createSequenceTasksFromSteps,
  DEFAULT_SEQUENCE_CADENCE_ID,
  DEFAULT_SEQUENCE_STEP_COUNT,
  getInboxReplyMetadata,
  getRecommendedOutreachStrategy,
  getSequenceCadenceById,
  OUTREACH_PLAYBOOKS,
  SEQUENCE_CADENCE_OPTIONS,
  formatCompanyFromEmail,
  buildHeuristicInboxInsight,
  parseSequenceSteps,
  createFollowUpTaskFromInboxEmail,
  selectUrgentInboxEmails,
  selectLowPriorityInboxEmails
} from './utils/inboxWorkflow.mjs';
import {
  CONTACT_STAGE_OPTIONS,
  CONTACT_SOURCE_OPTIONS,
  CONTACT_TEMPERATURE_OPTIONS,
  TASK_TEMPLATE_DEFINITIONS,
  createEmptyContact,
  createEmptyTask,
  normalizeContactRecord,
  normalizeContacts,
  normalizeTaskRecord,
  normalizeTasks,
  buildUpcomingMeetingQueue,
  buildPipelineOverview,
  buildCrmOverview,
  buildContactActionPlan,
  buildSalesPerformanceSnapshot,
  getContactAttentionSummary,
  buildTaskSummary,
  buildCalendarMonth,
  buildTaskConflictMap,
  buildTaskScheduleIssueMap,
  sortTasksForPlanner,
  getTasksForDate,
  getTaskBucket,
  getTaskCalendarDate,
  getTaskScheduledStart,
  getTaskScheduledEnd,
  formatDateKey,
  formatDateKeyInTimeZone,
  formatDateTimeInTimeZone,
  dateKeyToDate,
  formatMonthKey,
  normalizePlanningTimeZone,
  parseTimeToMinutes,
  TIMEZONE_PRESET_OPTIONS,
  TASK_TYPE_OPTIONS,
  TASK_STATUS_OPTIONS,
  TASK_FOCUS_OPTIONS,
  materializeTaskTemplate,
  createMeetingPrepPack,
  parseAiContactPlan,
  parseAiIdeaOrganizer,
  createTaskFromContactPlan,
  applyAiFocusDayPlan,
  buildHeuristicTimelineSummary
} from './utils/crmWorkflow.mjs';

// Firebase Initialization
const parseRuntimeJson = (value, fallback = {}) => {
  try {
    if (!value) return fallback;
    if (typeof value === 'string') return JSON.parse(value);
    if (typeof value === 'object') return value;
  } catch {
    // Ignore malformed runtime JSON and use fallback.
  }
  return fallback;
};

const firebaseConfig = typeof __firebase_config !== 'undefined' ? parseRuntimeJson(__firebase_config, {}) : {};

let app = null;
let auth = null;
let db = null;
let firebaseReady = false;

if (firebaseConfig && typeof firebaseConfig === 'object' && firebaseConfig.apiKey) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    firebaseReady = true;
  } catch (err) {
    console.warn('Running in local dev mode (Firebase init failed):', err?.message || err);
  }
} else {
  console.warn('Running in local dev mode (Firebase config missing).');
}

const IS_LOCAL_DEV_MODE = !firebaseReady;
const LOCAL_DEV_USER = { uid: 'local-dev-user', isLocalDev: true };
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const CONFIG_STORAGE_KEY = 'salesdirector.config.v1';
const THEME_STORAGE_KEY = 'salesdirector.theme.v1';
const LOCAL_DB_STORAGE_KEY = 'salesdirector.localdb.enc.v1';
const OUTREACH_CONTEXT_WIDTH_STORAGE_KEY = 'salesdirector.outreach.contextWidth.v1';
const LOCAL_DB_ENCRYPTION_VERSION = 1;
const LOCAL_DB_PBKDF2_ITERATIONS = 250000;
const OUTREACH_CONTEXT_MIN_WIDTH = 320;
const OUTREACH_CONTEXT_DEFAULT_WIDTH = 420;
const OUTREACH_DRAFT_MIN_WIDTH = 480;
const OUTREACH_SPLIT_HANDLE_WIDTH = 12;
const AKITA_CREDITS = {
  companyName: 'Akita Engineering',
  supportEmail: 'support@akitaengineering.com',
  website: 'https://www.akitaengineering.com',
  websiteLabel: 'www.akitaengineering.com',
  origin: 'Made in Niagara Falls, Canada'
};

const getDesktopLocalDbApi = () => {
  if (typeof window === 'undefined') return null;
  const localDbApi = window.salesDirectorDesktop?.localDb;
  if (
    localDbApi &&
    typeof localDbApi.status === 'function' &&
    typeof localDbApi.save === 'function' &&
    typeof localDbApi.load === 'function' &&
    typeof localDbApi.reset === 'function'
  ) {
    return localDbApi;
  }
  return null;
};

const getDesktopImapApi = () => {
  if (typeof window === 'undefined') return null;
  const imapApi = window.salesDirectorDesktop?.imap;
  if (imapApi && typeof imapApi.syncInbox === 'function') {
    return imapApi;
  }
  return null;
};

const getDesktopAiApi = () => {
  if (typeof window === 'undefined') return null;
  const aiApi = window.salesDirectorDesktop?.ai;
  if (
    aiApi &&
    typeof aiApi.generateText === 'function' &&
    typeof aiApi.cancelRequest === 'function'
  ) {
    return aiApi;
  }
  return null;
};

const DEFAULT_TASKS = [];

const DEFAULT_INBOX_EMAILS = [];
const SYSTEM_TIMEZONE_LABEL = typeof Intl !== 'undefined'
  ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local system time')
  : 'Local system time';
const SYSTEM_TIMEZONE_VALUE = 'system';
const DAY_MS = 24 * 60 * 60 * 1000;

const getPlanningTimeZoneLabel = (value = SYSTEM_TIMEZONE_VALUE) => {
  if (value === SYSTEM_TIMEZONE_VALUE) {
    return `System (${SYSTEM_TIMEZONE_LABEL})`;
  }
  return TIMEZONE_PRESET_OPTIONS.find((option) => option.value === value)?.label || value;
};

const formatFuturePlanningDateKey = (offsetDays = 0, timeZone = SYSTEM_TIMEZONE_VALUE) => (
  formatDateKeyInTimeZone(new Date(Date.now() + (offsetDays * DAY_MS)), timeZone)
);

const normalizeInboxDate = (value) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date();
    return { raw: fallback.toISOString(), label: fallback.toLocaleDateString() };
  }
  return { raw: date.toISOString(), label: date.toLocaleDateString() };
};

const getInboxSourceBadgeClasses = (source = '') => {
  if (source === 'imap') {
    return 'bg-emerald-100 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300';
  }

  if (source === 'hubspot') {
    return 'bg-blue-100 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300';
  }

  return 'bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300';
};

const inboxFingerprint = (email = {}) => {
  const messageId = String(email.messageId || '').trim().toLowerCase();
  if (messageId) return `msg:${messageId}`;

  const source = String(email.source || '').trim().toLowerCase();
  const sourceId = String(email.sourceId || '').trim().toLowerCase();
  if (source && sourceId) return `${source}:${sourceId}`;

  const from = String(email.fromEmail || '').trim().toLowerCase();
  const subject = String(email.subject || '').trim().toLowerCase();
  const date = String(email.dateRaw || email.date || '').trim();
  return `fallback:${source}|${from}|${subject}|${date}`;
};

const mergeInboxEmails = (current = [], incoming = []) => {
  const merged = new Map();

  current.forEach((email) => {
    merged.set(inboxFingerprint(email), { ...email });
  });

  incoming.forEach((email, index) => {
    const fingerprint = inboxFingerprint(email);
    const existing = merged.get(fingerprint);
    const normalizedDate = normalizeInboxDate(email.dateRaw || email.date);
    const fallbackId = `email-${Date.now()}-${index}`;

    merged.set(fingerprint, {
      ...(existing || {}),
      ...email,
      id: existing?.id || email.id || fallbackId,
      source: email.source || existing?.source || 'manual',
      sourceId: email.sourceId || existing?.sourceId || '',
      fromName: email.fromName || existing?.fromName || email.fromEmail || 'Unknown Sender',
      fromEmail: normalizeEmail(email.fromEmail || existing?.fromEmail || ''),
      company: email.company || existing?.company || formatCompanyFromEmail(email.fromEmail || existing?.fromEmail || ''),
      subject: email.subject || existing?.subject || 'No subject',
      body: email.body || existing?.body || 'No preview available.',
      dateRaw: email.dateRaw || existing?.dateRaw || normalizedDate.raw,
      date: email.date || existing?.date || normalizedDate.label,
      isRead: typeof existing?.isRead === 'boolean' ? existing.isRead : Boolean(email.isRead),
      needsResponse: typeof existing?.needsResponse === 'boolean'
        ? existing.needsResponse
        : (typeof email.needsResponse === 'boolean' ? email.needsResponse : !Boolean(email.isRead)),
      isArchived: typeof existing?.isArchived === 'boolean' ? existing.isArchived : Boolean(email.isArchived),
      aiScore: existing?.aiScore ?? email.aiScore ?? null,
      aiSummary: existing?.aiSummary || email.aiSummary || ''
    });
  });

  return Array.from(merged.values()).sort((a, b) => {
    const aTime = new Date(a.dateRaw || a.date || 0).getTime();
    const bTime = new Date(b.dateRaw || b.date || 0).getTime();
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
};

const formatCurrencyCompact = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
    notation: amount >= 1000 ? 'compact' : 'standard'
  }).format(amount);
};

const formatFriendlyDate = (value, fallback = 'Not scheduled') => {
  const date = dateKeyToDate(value);
  if (!date || Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const shiftMonthKey = (monthKey, delta) => {
  const safeKey = typeof monthKey === 'string' && /^\d{4}-\d{2}$/.test(monthKey)
    ? `${monthKey}-01`
    : `${formatMonthKey(new Date())}-01`;
  const date = new Date(`${safeKey}T00:00:00`);
  return formatMonthKey(new Date(date.getFullYear(), date.getMonth() + delta, 1));
};

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const deriveEncryptionKey = async (passphrase, salt, iterations = LOCAL_DB_PBKDF2_ITERATIONS) => {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const encryptLocalPayload = async (payload, passphrase) => {
  if (!window?.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable.');
  }

  const encoder = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(passphrase, salt);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    v: LOCAL_DB_ENCRYPTION_VERSION,
    i: LOCAL_DB_PBKDF2_ITERATIONS,
    s: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    d: bytesToBase64(new Uint8Array(encrypted))
  };
};

const decryptLocalPayload = async (encryptedPayload, passphrase) => {
  if (!window?.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable.');
  }

  if (!encryptedPayload || typeof encryptedPayload !== 'object') {
    throw new Error('Encrypted payload is invalid.');
  }

  const iterations = Number(encryptedPayload.i) || LOCAL_DB_PBKDF2_ITERATIONS;
  const salt = base64ToBytes(encryptedPayload.s || '');
  const iv = base64ToBytes(encryptedPayload.iv || '');
  const cipher = base64ToBytes(encryptedPayload.d || '');
  const key = await deriveEncryptionKey(passphrase, salt, iterations);
  const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  const decoded = new TextDecoder().decode(decrypted);
  return parseRuntimeJson(decoded, {});
};

const PERSISTED_CONFIG_KEYS = [
  'apiBaseUrl',
  'proxySecret',
  'companyUrl',
  'hubspotToken',
  'geminiKey',
  'openaiKey',
  'anthropicKey',
  'xaiKey',
  'metaKey',
  'openrouterKey',
  'openrouterModel',
  'openaiCompatibleKey',
  'openaiCompatibleBaseUrl',
  'openaiCompatibleModel',
  'senderName',
  'replyTo',
  'autoBcc',
  'signature',
  'smtpHost',
  'smtpPort',
  'smtpSecure',
  'smtpUser',
  'smtpPass',
  'smtpAuthMethod',
  'imapHost',
  'imapPort',
  'imapUser',
  'imapPass',
  'imapFolder',
  'imapArchiveFolder',
  'imapLookbackDays',
  'imapSyncLimit',
  'imapUnreadOnly',
  'imapAutoSyncEnabled',
  'imapSyncOnStartup',
  'imapAutoSyncMinutes',
  'imapSyncFlagChanges',
  'imapAuthMethod',
  'imapOAuth2ClientId',
  'imapOAuth2TenantId',
  'oauth2Provider',
  'googleOAuth2ClientId',
  'googleOAuth2ClientSecret',
  'useGraphApi',
  'maxDailyEmails',
  'sendDelay',
  'activeHoursStart',
  'activeHoursEnd',
  'scheduleBufferMinutes',
  'timezone',
  'defaultTone',
  'defaultLength',
  'aiTemperature',
  'aiTopP',
  'aiMaxOutputTokens',
  'selectedAI'
];

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-4o-mini';
const OPENAI_COMPATIBLE_DEFAULT_BASE_URL = 'http://127.0.0.1:11434/v1';
const OPENAI_COMPATIBLE_PRESETS = [
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://127.0.0.1:11434/v1', modelHint: 'llama3.2' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', modelHint: 'local-model' },
  { id: 'custom', label: 'Custom OpenAI-compatible', baseUrl: 'http://127.0.0.1:8000/v1', modelHint: 'your-model-id' }
];

const AI_PROVIDER_OPTIONS = [
  { value: 'gemini', label: 'Gemini', keyName: 'geminiKey', model: 'gemini-2.5-flash', apiStyle: 'gemini', requiresApiKey: true, allowsCustomModel: false, allowsCustomBaseUrl: false },
  { value: 'openai', label: 'OpenAI', keyName: 'openaiKey', model: 'gpt-4.1-mini', apiStyle: 'openai', requiresApiKey: true, allowsCustomModel: false, allowsCustomBaseUrl: false, defaultBaseUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', keyName: 'anthropicKey', model: 'claude-3-5-sonnet-latest', apiStyle: 'anthropic', requiresApiKey: true, allowsCustomModel: false, allowsCustomBaseUrl: false },
  { value: 'xai', label: 'xAI', keyName: 'xaiKey', model: 'grok-2-latest', apiStyle: 'openai', requiresApiKey: true, allowsCustomModel: false, allowsCustomBaseUrl: false, defaultBaseUrl: 'https://api.x.ai/v1' },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    keyName: 'openrouterKey',
    modelKey: 'openrouterModel',
    model: OPENROUTER_DEFAULT_MODEL,
    apiStyle: 'openai',
    requiresApiKey: true,
    allowsCustomModel: true,
    allowsCustomBaseUrl: false,
    defaultBaseUrl: OPENROUTER_DEFAULT_BASE_URL
  },
  {
    value: 'openai_compatible',
    label: 'Local / OpenAI-compatible',
    keyName: 'openaiCompatibleKey',
    modelKey: 'openaiCompatibleModel',
    baseUrlKey: 'openaiCompatibleBaseUrl',
    model: '',
    apiStyle: 'openai',
    requiresApiKey: false,
    allowsCustomModel: true,
    allowsCustomBaseUrl: true,
    defaultBaseUrl: OPENAI_COMPATIBLE_DEFAULT_BASE_URL
  }
];

const AI_PROVIDER_CONFIG = AI_PROVIDER_OPTIONS.reduce((accumulator, option) => {
  accumulator[option.value] = option;
  return accumulator;
}, {});

const isLocalAiBaseUrl = (value = '') => {
  try {
    const host = new URL(String(value || '').trim()).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === '[::1]';
  } catch {
    return /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/i.test(String(value || ''));
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
const LEGACY_AI_MAX_OUTPUT_TOKENS_DEFAULTS = new Set([1200, 4096]);
const AI_CONTINUATION_MAX_REQUESTS = 3;
const AI_CONTINUATION_CONTEXT_CHARS = 4000;
const AI_PROVIDER_HEALTHCHECK_PREFIX = 'SALESDIRECTOR_AI_OK';
const AI_PROVIDER_HEALTHCHECK_SYSTEM_TEXT = 'You are an AI transport health-check harness. Return only the exact verification token requested by the user. Do not add punctuation, markdown, labels, or explanation.';

const clampAiSetting = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const normalizeAiProvider = (value = '') => {
  const provider = String(value || 'gemini').trim().toLowerCase();
  return AI_PROVIDER_CONFIG[provider] ? provider : 'gemini';
};

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

const sanitizePersistedConfig = (config = {}) => {
  if (!config || typeof config !== 'object') {
    return {};
  }

  const nextConfig = { ...config };
  if (Object.prototype.hasOwnProperty.call(nextConfig, 'oauth2Provider')) {
    nextConfig.oauth2Provider = normalizeOAuthProvider(nextConfig.oauth2Provider);
  }
  if (Object.prototype.hasOwnProperty.call(nextConfig, 'imapAuthMethod')) {
    nextConfig.imapAuthMethod = normalizeMailAuthMethod(nextConfig.imapAuthMethod);
  }
  if (Object.prototype.hasOwnProperty.call(nextConfig, 'smtpAuthMethod')) {
    nextConfig.smtpAuthMethod = normalizeMailAuthMethod(nextConfig.smtpAuthMethod);
  }
  if (Object.prototype.hasOwnProperty.call(nextConfig, 'smtpSecure')) {
    nextConfig.smtpSecure = normalizeSmtpSecureMode(nextConfig.smtpSecure);
  }
  if (Object.prototype.hasOwnProperty.call(nextConfig, 'useGraphApi')) {
    nextConfig.useGraphApi = String(nextConfig.useGraphApi || '').trim().toLowerCase() === 'true' ? 'true' : 'false';
  }
  if (Object.prototype.hasOwnProperty.call(nextConfig, 'timezone')) {
    nextConfig.timezone = normalizePlanningTimeZone(nextConfig.timezone);
  }
  if (Object.prototype.hasOwnProperty.call(nextConfig, 'aiMaxOutputTokens')) {
    const parsed = Number(nextConfig.aiMaxOutputTokens);
    if (Number.isInteger(parsed) && LEGACY_AI_MAX_OUTPUT_TOKENS_DEFAULTS.has(parsed)) {
      nextConfig.aiMaxOutputTokens = String(AI_GENERATION_PROFILE_DEFAULTS.maxOutputTokens);
    }
  }
  return nextConfig;
};

const buildAiGenerationProfile = (input = {}) => ({
  temperature: clampAiSetting(input.aiTemperature ?? input.temperature, 0, 1.5, AI_GENERATION_PROFILE_DEFAULTS.temperature),
  topP: clampAiSetting(input.aiTopP ?? input.topP, 0, 1, AI_GENERATION_PROFILE_DEFAULTS.topP),
  maxOutputTokens: Math.round(clampAiSetting(input.aiMaxOutputTokens ?? input.maxOutputTokens, 256, AI_MAX_OUTPUT_TOKENS_LIMIT, AI_GENERATION_PROFILE_DEFAULTS.maxOutputTokens))
});

const formatAiGenerationProfileSummary = (profile = AI_GENERATION_PROFILE_DEFAULTS) => (
  `Temp ${Number(profile.temperature).toFixed(2)} | Top-p ${Number(profile.topP).toFixed(2)} | Max ${profile.maxOutputTokens} tokens`
);

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

const parseProviderErrorMessage = async (response, fallbackMessage) => {
  const rawBody = await response.text().catch(() => '');
  if (!rawBody) {
    return `${fallbackMessage} (${response.status}).`;
  }

  try {
    const parsed = JSON.parse(rawBody);
    const detailMessage = Array.isArray(parsed?.error?.details)
      ? parsed.error.details.find((detail) => detail?.message)?.message
      : '';
    return String(
      parsed?.error?.message
      || parsed?.error?.details?.message
      || parsed?.message
      || detailMessage
      || rawBody
    ).trim() || `${fallbackMessage} (${response.status}).`;
  } catch {
    return rawBody.trim() || `${fallbackMessage} (${response.status}).`;
  }
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

const getAiProviderRuntimeInfo = ({
  provider,
  apiBaseUrl,
  hasDesktopAiApi,
  hasApiKey,
  model = '',
  providerBaseUrl = ''
}) => {
  const normalizedProvider = normalizeAiProvider(provider);
  const providerConfig = AI_PROVIDER_CONFIG[normalizedProvider] || AI_PROVIDER_CONFIG.gemini;
  const usingProxy = Boolean(String(apiBaseUrl || '').trim());
  const resolvedBaseUrl = normalizeOpenAiCompatibleBaseUrl(
    providerBaseUrl,
    providerConfig.defaultBaseUrl || ''
  );
  const resolvedModel = String(model || providerConfig.model || '').trim();
  const requiresApiKey = providerConfig.requiresApiKey !== false;
  const allowsCustomModel = Boolean(providerConfig.allowsCustomModel);
  const allowsCustomBaseUrl = Boolean(providerConfig.allowsCustomBaseUrl);
  const isLocalEndpoint = allowsCustomBaseUrl && isLocalAiBaseUrl(resolvedBaseUrl);
  const requiresDesktop = isLocalEndpoint && !usingProxy;
  const supported = usingProxy
    || (normalizedProvider !== 'meta' && (!requiresDesktop || hasDesktopAiApi));

  const routeLabel = usingProxy
    ? `${providerConfig.label} via proxy`
    : (hasDesktopAiApi
      ? `${providerConfig.label} via desktop runtime`
      : `${providerConfig.label} direct from the app`);

  let supportDetail = '';
  if (!supported) {
    if (requiresDesktop && !hasDesktopAiApi) {
      supportDetail = `${providerConfig.label} points at a local endpoint. Launch the desktop app (or use proxy mode) so localhost requests are not blocked by browser CORS.`;
    } else {
      supportDetail = `${providerConfig.label} direct routing is not available yet.`;
    }
  } else if (usingProxy) {
    supportDetail = 'Proxy mode will validate this provider against the server configuration.';
  } else if (allowsCustomBaseUrl && !resolvedBaseUrl) {
    supportDetail = 'Set an OpenAI-compatible base URL (for example Ollama or LM Studio).';
  } else if (allowsCustomModel && !resolvedModel) {
    supportDetail = `Enter a model id for ${providerConfig.label}.`;
  } else if (requiresApiKey && !hasApiKey) {
    supportDetail = `${providerConfig.label} key is missing.`;
  } else if (hasDesktopAiApi) {
    supportDetail = 'Ready via the desktop runtime.';
  } else {
    supportDetail = 'Ready for direct browser calls.';
  }

  const configReady = usingProxy || (
    (!allowsCustomBaseUrl || Boolean(resolvedBaseUrl))
    && (!allowsCustomModel || Boolean(resolvedModel))
    && (!requiresApiKey || Boolean(hasApiKey))
  );

  return {
    provider: normalizedProvider,
    keyName: providerConfig.keyName,
    label: providerConfig.label,
    model: resolvedModel,
    baseUrl: resolvedBaseUrl,
    usingProxy,
    requiresDesktop,
    requiresApiKey,
    allowsCustomModel,
    allowsCustomBaseUrl,
    supported,
    hasApiKey: Boolean(hasApiKey),
    ready: supported && configReady,
    routeLabel,
    supportDetail
  };
};

const buildAiProviderHealthcheckToken = (provider) => `${AI_PROVIDER_HEALTHCHECK_PREFIX}::${normalizeAiProvider(provider)}`;

const truncateAiPreview = (value = '', maxLength = 96) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
};

const normalizeAiHealthcheckResponse = (value = '') => String(value || '')
  .trim()
  .replace(/[`"'“”‘’]+/g, '')
  .replace(/[.!?]+$/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const humanizeActionLabel = (value = 'AI action') => {
  const normalized = String(value || 'AI action')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return 'AI action';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

// Main Application Component
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('outreach');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'dark') return true;
      if (savedTheme === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches || false;
    } catch {
      return false;
    }
  });
  
  // CRM Modals
  const [selectedContact, setSelectedContact] = useState(null);
  const [selectedInboxEmail, setSelectedInboxEmail] = useState(null);
  const [urgentInboxQueueIds, setUrgentInboxQueueIds] = useState([]);
  const [archiveSelectedInboxAfterSend, setArchiveSelectedInboxAfterSend] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactToDelete, setContactToDelete] = useState(null);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [crmWorkspaceInsight, setCrmWorkspaceInsight] = useState('');
  const [dashboardPartnerInsight, setDashboardPartnerInsight] = useState('');
  const [salesPatternInsight, setSalesPatternInsight] = useState('');
  const [ideaCaptureInput, setIdeaCaptureInput] = useState('');
  const [draggedPipelineContactEmail, setDraggedPipelineContactEmail] = useState('');
  const [timelineSummaryRefreshingEmail, setTimelineSummaryRefreshingEmail] = useState('');

  // Task Modals
  const [editingTask, setEditingTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('active');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => formatDateKeyInTimeZone(new Date(), SYSTEM_TIMEZONE_VALUE));
  const [activeCalendarMonth, setActiveCalendarMonth] = useState(() => formatDateKeyInTimeZone(new Date(), SYSTEM_TIMEZONE_VALUE).slice(0, 7));
  const [taskPlannerInsight, setTaskPlannerInsight] = useState('');

  // Inbox Filters
  const [inboxFilter, setInboxFilter] = useState('all');
  const [inboxSearch, setInboxSearch] = useState('');

  // Contact Filters
  const [contactStageFilter, setContactStageFilter] = useState('all');

  // Global Search
  const [globalSearch, setGlobalSearch] = useState('');

  // App State
  const [contacts, setContacts] = useState([]);
  const [threads, setThreads] = useState({});
  const [tasks, setTasks] = useState(() => DEFAULT_TASKS.map((task) => ({ ...task })));
  const [newTaskInput, setNewTaskInput] = useState('');
  const [clockTick, setClockTick] = useState(() => Date.now());

  const [inboxEmails, setInboxEmails] = useState(() => DEFAULT_INBOX_EMAILS.map((email) => ({ ...email })));
  const [inboxSyncStatus, setInboxSyncStatus] = useState({
    imap: { lastRunAt: null, fetchedCount: 0, error: '' },
    hubspot: { lastRunAt: null, fetchedCount: 0, error: '' }
  });
  const [inboxSyncBusy, setInboxSyncBusy] = useState({
    imap: false,
    hubspot: false
  });
  
  const [config, setConfig] = useState({
    apiBaseUrl: '',
    proxySecret: '',
    companyUrl: '',
    hubspotToken: '',
    senderName: '',
    replyTo: '',
    autoBcc: '',
    signature: 'Best regards,\n\nJohn Doe\nSales Director | Akita Engineering\nwww.akitaengineering.com',
    smtpHost: '',
    smtpPort: '587',
    smtpSecure: 'tls',
    smtpUser: '',
    smtpPass: '',
    smtpAuthMethod: 'basic',
    imapHost: '',
    imapPort: '993',
    imapUser: '',
    imapPass: '',
    imapFolder: 'INBOX',
    imapArchiveFolder: 'Archive',
    imapLookbackDays: '14',
    imapSyncLimit: '50',
    imapUnreadOnly: 'false',
    imapAutoSyncEnabled: 'false',
    imapSyncOnStartup: 'true',
    imapAutoSyncMinutes: '10',
    imapSyncFlagChanges: 'true',
    imapAuthMethod: 'basic',
    imapOAuth2ClientId: '',
    imapOAuth2TenantId: '',
    oauth2Provider: 'microsoft',
    googleOAuth2ClientId: '',
    googleOAuth2ClientSecret: '',
    useGraphApi: 'false',
    maxDailyEmails: '100',
    sendDelay: '30',
    activeHoursStart: '09:00',
    activeHoursEnd: '17:00',
    scheduleBufferMinutes: '15',
    timezone: SYSTEM_TIMEZONE_VALUE,
    defaultTone: 'Professional',
    defaultLength: 'Concise',
    aiTemperature: String(AI_GENERATION_PROFILE_DEFAULTS.temperature),
    aiTopP: String(AI_GENERATION_PROFILE_DEFAULTS.topP),
    aiMaxOutputTokens: String(AI_GENERATION_PROFILE_DEFAULTS.maxOutputTokens),
    selectedAI: 'gemini',
    geminiKey: '',
    openaiKey: '',
    anthropicKey: '',
    xaiKey: '',
    metaKey: '',
    openrouterKey: '',
    openrouterModel: OPENROUTER_DEFAULT_MODEL,
    openaiCompatibleKey: '',
    openaiCompatibleBaseUrl: OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
    openaiCompatibleModel: ''
  });

  const [composerState, setComposerState] = useState({
    recipientName: '',
    jobTitle: '',
    companyName: '',
    to: '',
    hubspotId: null,
    subject: '',
    body: '',
    aiContext: '',
    threadHistory: '',
    objection: '',
    tone: 'Persuasive',
    length: 'Concise',
    selectedPlaybookId: '',
    sequenceCadenceId: DEFAULT_SEQUENCE_CADENCE_ID,
    sequenceStepCount: DEFAULT_SEQUENCE_STEP_COUNT,
    suggestedSubjects: [],
    sequenceSteps: []
  });
  const [configErrors, setConfigErrors] = useState({});
  const [composerErrors, setComposerErrors] = useState({});
  const notificationTimerRef = useRef(null);
  const activeAIRequestRef = useRef(null);
  const aiOperationQueueRef = useRef([]);
  const aiOperationActiveRef = useRef(null);
  const aiOperationSequenceRef = useRef(0);
  const aiDesktopRequestSequenceRef = useRef(0);
  const aiQueueDisposedRef = useRef(false);
  const outreachWorkspaceRef = useRef(null);
  const hasLoadedLocalConfigRef = useRef(false);
  const configChangeCountRef = useRef(0);
  const configSaveTimerRef = useRef(null);
  const [configSaveStatus, setConfigSaveStatus] = useState(null);
  const [aiQueueStatus, setAiQueueStatus] = useState({ running: false, activeLabel: '', pendingCount: 0 });
  const [outreachContextWidth, setOutreachContextWidth] = useState(() => {
    if (typeof window === 'undefined') return OUTREACH_CONTEXT_DEFAULT_WIDTH;
    try {
      const savedWidth = Number(window.localStorage.getItem(OUTREACH_CONTEXT_WIDTH_STORAGE_KEY));
      if (Number.isFinite(savedWidth) && savedWidth >= OUTREACH_CONTEXT_MIN_WIDTH) {
        return savedWidth;
      }
    } catch {
      // Ignore malformed widths and fall back to the default split.
    }
    return OUTREACH_CONTEXT_DEFAULT_WIDTH;
  });
  const [isOutreachSplitDragging, setIsOutreachSplitDragging] = useState(false);
  const [localDbPassphraseInput, setLocalDbPassphraseInput] = useState('');
  const [localDbPassphrase, setLocalDbPassphrase] = useState('');
  const [localDbUnlocked, setLocalDbUnlocked] = useState(false);
  const [localDbHasEncryptedData, setLocalDbHasEncryptedData] = useState(false);
  const [localDbStatusMessage, setLocalDbStatusMessage] = useState('');
  const [localDbBackend, setLocalDbBackend] = useState('initializing');
  const [desktopAppInfo, setDesktopAppInfo] = useState(null);
  const localDbReadyRef = useRef(false);
  const localDbSaveTimerRef = useRef(null);
  const imapSyncInFlightRef = useRef(false);
  const imapStartupSyncTriggeredRef = useRef(false);
  const [imapOAuth2Status, setImapOAuth2Status] = useState({ authenticated: false, user: '', name: '', expired: false });
  const [hasHydratedConfig, setHasHydratedConfig] = useState(false);

  useEffect(() => {
    const timerId = window.setInterval(() => setClockTick(Date.now()), 60000);
    return () => window.clearInterval(timerId);
  }, []);
  const [aiProviderTestBusy, setAiProviderTestBusy] = useState(false);
  const [aiProviderTestResults, setAiProviderTestResults] = useState({});
  const [aiStartupReadiness, setAiStartupReadiness] = useState({ level: 'ok', title: '', message: '', key: '' });
  const aiStartupWarningKeyRef = useRef('');
  const aiGenerationProfile = useMemo(
    () => buildAiGenerationProfile(config),
    [config.aiTemperature, config.aiTopP, config.aiMaxOutputTokens]
  );

  const clampOutreachContextWidth = useCallback((requestedWidth) => {
    const workspaceWidth = outreachWorkspaceRef.current?.getBoundingClientRect()?.width || 0;
    if (!workspaceWidth) {
      return Math.max(OUTREACH_CONTEXT_MIN_WIDTH, requestedWidth);
    }

    const maxWidth = Math.max(
      OUTREACH_CONTEXT_MIN_WIDTH,
      workspaceWidth - OUTREACH_DRAFT_MIN_WIDTH - OUTREACH_SPLIT_HANDLE_WIDTH
    );

    return Math.min(Math.max(requestedWidth, OUTREACH_CONTEXT_MIN_WIDTH), maxWidth);
  }, []);

  const adjustOutreachContextWidth = useCallback((delta) => {
    setOutreachContextWidth((currentWidth) => clampOutreachContextWidth(currentWidth + delta));
  }, [clampOutreachContextWidth]);

  const resetOutreachContextWidth = useCallback(() => {
    setOutreachContextWidth(clampOutreachContextWidth(OUTREACH_CONTEXT_DEFAULT_WIDTH));
  }, [clampOutreachContextWidth]);

  const startOutreachSplitDrag = useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setIsOutreachSplitDragging(true);
  }, []);

  const handleOutreachSplitKeyDown = useCallback((event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      adjustOutreachContextWidth(event.shiftKey ? -48 : -24);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      adjustOutreachContextWidth(event.shiftKey ? 48 : 24);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setOutreachContextWidth(OUTREACH_CONTEXT_MIN_WIDTH);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      const workspaceWidth = outreachWorkspaceRef.current?.getBoundingClientRect()?.width || 0;
      const maxWidth = workspaceWidth
        ? Math.max(OUTREACH_CONTEXT_MIN_WIDTH, workspaceWidth - OUTREACH_DRAFT_MIN_WIDTH - OUTREACH_SPLIT_HANDLE_WIDTH)
        : OUTREACH_CONTEXT_DEFAULT_WIDTH;
      setOutreachContextWidth(maxWidth);
    }
  }, [adjustOutreachContextWidth]);

  // Firebase Auth & Data Sync
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    try {
      window.localStorage.setItem(OUTREACH_CONTEXT_WIDTH_STORAGE_KEY, String(outreachContextWidth));
    } catch {
      // Ignore persistence failures and keep the current split width in memory.
    }

    return undefined;
  }, [outreachContextWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleResize = () => {
      setOutreachContextWidth((currentWidth) => clampOutreachContextWidth(currentWidth));
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [clampOutreachContextWidth]);

  useEffect(() => {
    if (!isOutreachSplitDragging) return undefined;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const handlePointerMove = (event) => {
      const workspaceBounds = outreachWorkspaceRef.current?.getBoundingClientRect();
      if (!workspaceBounds) return;
      setOutreachContextWidth(clampOutreachContextWidth(event.clientX - workspaceBounds.left));
    };

    const stopDragging = () => {
      setIsOutreachSplitDragging(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [clampOutreachContextWidth, isOutreachSplitDragging]);

  useEffect(() => {
    if (IS_LOCAL_DEV_MODE || !auth) {
      setUser(LOCAL_DEV_USER);
      return undefined;
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error('Authentication failed:', err);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser || null);
    });

    initAuth();

    return () => {
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const getAppInfo = window.salesDirectorDesktop?.getAppInfo;
    if (typeof getAppInfo !== 'function') return;

    getAppInfo()
      .then((info) => {
        if (info && typeof info === 'object') {
          setDesktopAppInfo(info);
        }
      })
      .catch((err) => {
        console.error('Failed to load desktop app info:', err);
      });
  }, []);

  useEffect(() => {
    if (IS_LOCAL_DEV_MODE || !db || !user?.uid) {
      return undefined;
    }

    const contactsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'contacts');
    const threadsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'threads');

    const unsubscribeContacts = onSnapshot(contactsRef, (snapshot) => {
      const nextContacts = snapshot.docs.map((contactDoc) => ({
        id: contactDoc.id,
        ...contactDoc.data()
      }));
      setContacts(normalizeContacts(nextContacts));
    });

    const unsubscribeThreads = onSnapshot(threadsRef, (snapshot) => {
      const nextThreads = {};
      snapshot.docs.forEach((threadDoc) => {
        const data = threadDoc.data() || {};
        nextThreads[threadDoc.id] = {
          contactEmail: data.contactEmail || threadDoc.id,
          messages: Array.isArray(data.messages) ? data.messages : []
        };
      });
      setThreads(nextThreads);
    });

    return () => {
      unsubscribeContacts();
      unsubscribeThreads();
    };
  }, [user]);

  useEffect(() => {
    setComposerState(prev => ({ 
      ...prev, 
      tone: config.defaultTone, 
      length: config.defaultLength 
    }));
  }, [config.defaultTone, config.defaultLength]);

  useEffect(() => {
    if (!selectedInboxEmail?.id) return;

    const updatedEmail = inboxEmails.find((email) => email.id === selectedInboxEmail.id);
    if (!updatedEmail) {
      setSelectedInboxEmail(null);
      return;
    }

    if (updatedEmail !== selectedInboxEmail) {
      setSelectedInboxEmail(updatedEmail);
    }
  }, [inboxEmails, selectedInboxEmail]);

  useEffect(() => {
    if (!selectedCalendarDate) return;
    const selectedMonthKey = selectedCalendarDate.slice(0, 7);
    if (selectedMonthKey && selectedMonthKey !== activeCalendarMonth) {
      setActiveCalendarMonth(selectedMonthKey);
    }
  }, [selectedCalendarDate, activeCalendarMonth]);

  useEffect(() => {
    if (urgentInboxQueueIds.length === 0) return;

    const nextQueueIds = urgentInboxQueueIds.filter((id) => inboxEmails.some((email) => email.id === id && !email.isArchived && email.needsResponse !== false));
    if (nextQueueIds.length !== urgentInboxQueueIds.length) {
      setUrgentInboxQueueIds(nextQueueIds);
    }
  }, [inboxEmails, urgentInboxQueueIds]);

  useEffect(() => {
    if (!selectedInboxEmail?.id || urgentInboxQueueIds.length === 0) return;
    if (!urgentInboxQueueIds.includes(selectedInboxEmail.id)) {
      setUrgentInboxQueueIds([]);
    }
  }, [selectedInboxEmail, urgentInboxQueueIds]);

  useEffect(() => {
    setArchiveSelectedInboxAfterSend(false);
  }, [selectedInboxEmail?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
    } catch {
      // Ignore local storage write failures.
    }
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
  }, [isDarkMode]);

  useEffect(() => {
    if (hasLoadedLocalConfigRef.current) return;
    hasLoadedLocalConfigRef.current = true;

    if (typeof window === 'undefined') {
      setHasHydratedConfig(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const safeConfig = {};
        PERSISTED_CONFIG_KEYS.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(parsed, key)) {
            safeConfig[key] = parsed[key];
          }
        });
        setConfig(prev => ({ ...prev, ...sanitizePersistedConfig(safeConfig) }));
      }
    } catch {
      // Ignore malformed local storage data and continue with defaults.
    } finally {
      setHasHydratedConfig(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedLocalConfigRef.current || typeof window === 'undefined') return;
    configChangeCountRef.current += 1;
    try {
      const safeConfig = {};
      PERSISTED_CONFIG_KEYS.forEach((key) => {
        safeConfig[key] = config[key];
      });
      const normalizedConfig = sanitizePersistedConfig(safeConfig);
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(normalizedConfig));
      // Show save confirmation only after user-initiated changes (skip first cycle from localStorage load)
      if (configChangeCountRef.current > 1) {
        setConfigSaveStatus('saved');
        if (configSaveTimerRef.current) clearTimeout(configSaveTimerRef.current);
        configSaveTimerRef.current = setTimeout(() => setConfigSaveStatus(null), 2500);
      }
    } catch {
      // Ignore local storage write failures (private mode/quota).
    }
  }, [config]);

  useEffect(() => {
    if (!hasHydratedConfig) return;

    const runtime = getAiProviderRuntime();
    const nextReadiness = !runtime.supported
      ? {
          level: 'error',
          title: 'Selected AI provider is unavailable in this mode',
          message: runtime.supportDetail,
          key: `unsupported:${runtime.provider}:${runtime.routeLabel}`
        }
      : (!runtime.ready
        ? {
            level: 'warn',
            title: `${runtime.label} is selected but not configured`,
            message: runtime.supportDetail || `Finish ${runtime.label} setup in Settings before using AI features.`,
            key: `needs-setup:${runtime.provider}:${runtime.supportDetail || 'incomplete'}`
          }
        : {
            level: 'ok',
            title: `${runtime.label} is ready`,
            message: `${runtime.label} is ready via ${runtime.routeLabel}.`,
            key: ''
          });

    setAiStartupReadiness(nextReadiness);

    if (!nextReadiness.key) {
      aiStartupWarningKeyRef.current = '';
      return;
    }

    if (aiStartupWarningKeyRef.current === nextReadiness.key) {
      return;
    }

    aiStartupWarningKeyRef.current = nextReadiness.key;
    showNotification(nextReadiness.message, 'error');
  }, [
    hasHydratedConfig,
    config.selectedAI,
    config.apiBaseUrl,
    config.geminiKey,
    config.openaiKey,
    config.anthropicKey,
    config.xaiKey,
    config.openrouterKey,
    config.openrouterModel,
    config.openaiCompatibleKey,
    config.openaiCompatibleBaseUrl,
    config.openaiCompatibleModel
  ]);

  useEffect(() => {
    return () => {
      aiQueueDisposedRef.current = true;
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
      if (localDbSaveTimerRef.current) {
        clearTimeout(localDbSaveTimerRef.current);
      }
      cancelQueuedAiOperations('AI queue cleared.');
    };
  }, []);

  const dismissNotification = useCallback(() => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = null;
    }
    setNotification(null);
  }, []);

  const showNotification = (message, type = 'success') => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    setNotification({ message, type });
    notificationTimerRef.current = setTimeout(() => {
      setNotification(null);
      notificationTimerRef.current = null;
    }, type === 'error' ? 5000 : 3200);
  };

  const TAB_LABELS = useMemo(() => ({
    dashboard: 'Dashboard',
    inbox: 'Smart Inbox',
    tasks: 'Tasks & Calendar',
    contacts: 'CRM & Contacts',
    outreach: 'AI Outreach',
    settings: 'Settings',
    about: 'About'
  }), []);

  // Close overlays / search with Escape; lock body scroll while a modal is open.
  useEffect(() => {
    const anyModalOpen = Boolean(
      isContactModalOpen || isTaskModalOpen || contactToDelete || selectedContact
    );
    const shouldListen = anyModalOpen || sidebarOpen || Boolean(globalSearch);

    if (!shouldListen) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      // Prefer closing the top-most UI layer first.
      if (contactToDelete) {
        setContactToDelete(null);
        return;
      }
      if (isTaskModalOpen) {
        setIsTaskModalOpen(false);
        setEditingTask(null);
        return;
      }
      if (isContactModalOpen) {
        setIsContactModalOpen(false);
        setEditingContact(null);
        return;
      }
      if (selectedContact) {
        setSelectedContact(null);
        return;
      }
      if (sidebarOpen) {
        setSidebarOpen(false);
        return;
      }
      if (globalSearch) {
        setGlobalSearch('');
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isContactModalOpen, isTaskModalOpen, contactToDelete, selectedContact, sidebarOpen, globalSearch]);

  const getApiBaseUrl = () => (config.apiBaseUrl || '').trim().replace(/\/+$/, '');

  const getSelectedAiProvider = () => {
    return normalizeAiProvider(config.selectedAI || 'gemini');
  };

  const getSelectedAiProviderConfig = (provider = getSelectedAiProvider()) => (
    AI_PROVIDER_CONFIG[provider] || AI_PROVIDER_CONFIG.gemini
  );

  const getSelectedAiLabel = (provider = getSelectedAiProvider()) => getSelectedAiProviderConfig(provider).label;

  const getSelectedAiApiKey = (provider = getSelectedAiProvider()) => {
    const providerConfig = getSelectedAiProviderConfig(provider);
    if (!providerConfig.keyName) return '';
    return String(config[providerConfig.keyName] || '').trim();
  };

  const getSelectedAiModel = (provider = getSelectedAiProvider()) => {
    const providerConfig = getSelectedAiProviderConfig(provider);
    if (providerConfig.modelKey) {
      return String(config[providerConfig.modelKey] || providerConfig.model || '').trim();
    }
    return String(providerConfig.model || '').trim();
  };

  const getSelectedAiBaseUrl = (provider = getSelectedAiProvider()) => {
    const providerConfig = getSelectedAiProviderConfig(provider);
    if (providerConfig.baseUrlKey) {
      return normalizeOpenAiCompatibleBaseUrl(
        config[providerConfig.baseUrlKey],
        providerConfig.defaultBaseUrl || ''
      );
    }
    return normalizeOpenAiCompatibleBaseUrl(providerConfig.defaultBaseUrl || '');
  };

  const getAiProviderRuntime = (provider = getSelectedAiProvider()) => getAiProviderRuntimeInfo({
    provider,
    apiBaseUrl: getApiBaseUrl(),
    hasDesktopAiApi: Boolean(getDesktopAiApi()),
    hasApiKey: Boolean(getSelectedAiApiKey(provider)),
    model: getSelectedAiModel(provider),
    providerBaseUrl: getSelectedAiBaseUrl(provider)
  });

  const getAiProviderBlockMessage = (provider = getSelectedAiProvider(), options = {}) => {
    const runtime = getAiProviderRuntime(provider);
    if (!runtime.supported) {
      return runtime.supportDetail;
    }
    if (runtime.usingProxy) {
      return '';
    }
    if (runtime.allowsCustomBaseUrl && !runtime.baseUrl) {
      return options.forHealthCheck
        ? `Set the ${runtime.label} base URL in Settings before running the health check.`
        : `Set the ${runtime.label} base URL in Settings before using AI features.`;
    }
    if (runtime.allowsCustomModel && !runtime.model) {
      return options.forHealthCheck
        ? `Set a ${runtime.label} model id in Settings before running the health check.`
        : `Set a ${runtime.label} model id in Settings before using AI features.`;
    }
    if (runtime.requiresApiKey && !runtime.hasApiKey) {
      return options.forHealthCheck
        ? `Add your ${runtime.label} API key in Settings before running the health check.`
        : `Add your ${runtime.label} API key in Settings before using AI features.`;
    }
    return '';
  };

  const applyOpenAiCompatiblePreset = (presetId) => {
    const preset = OPENAI_COMPATIBLE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setConfig((prev) => ({
      ...prev,
      selectedAI: 'openai_compatible',
      openaiCompatibleBaseUrl: preset.baseUrl,
      openaiCompatibleModel: prev.openaiCompatibleModel || preset.modelHint || ''
    }));
    showNotification(`${preset.label} endpoint loaded. Confirm the model id matches what is running locally.`);
  };

  const setAiProviderTestResult = (provider, nextResult) => {
    const normalizedProvider = normalizeAiProvider(provider);
    setAiProviderTestResults((prev) => ({
      ...prev,
      [normalizedProvider]: {
        ...(prev[normalizedProvider] || {}),
        ...nextResult,
        provider: normalizedProvider
      }
    }));
  };

  const switchToFirstSupportedAiProvider = () => {
    const nextProvider = AI_PROVIDER_OPTIONS.find((option) => getAiProviderRuntime(option.value).supported)?.value || 'gemini';
    if (nextProvider === getSelectedAiProvider()) {
      return;
    }
    setConfig((prev) => ({ ...prev, selectedAI: nextProvider }));
    showNotification(`Active AI provider switched to ${getSelectedAiLabel(nextProvider)}.`);
  };

  const isAiProviderReady = (provider = getSelectedAiProvider()) => {
    return getAiProviderRuntime(provider).ready;
  };

  const runAiProviderHealthCheck = async (providerInput) => {
    const runtime = getAiProviderRuntime(providerInput);
    const blockMessage = getAiProviderBlockMessage(runtime.provider, { forHealthCheck: true });
    const checkedAt = new Date().toISOString();

    if (blockMessage) {
      setAiProviderTestResult(runtime.provider, {
        status: runtime.supported ? 'blocked' : 'unsupported',
        ok: false,
        checkedAt,
        routeLabel: runtime.routeLabel,
        message: blockMessage
      });
      throw new Error(blockMessage);
    }

    const expectedToken = buildAiProviderHealthcheckToken(runtime.provider);
    setAiProviderTestResult(runtime.provider, {
      status: 'running',
      ok: null,
      checkedAt,
      routeLabel: runtime.routeLabel,
      message: `Testing ${runtime.routeLabel}...`
    });

    const startedAt = Date.now();
    try {
      const responseText = await callGeminiAPI(
        `Return exactly this text and nothing else: ${expectedToken}`,
        {
          abortPrevious: false,
          providerOverride: runtime.provider,
          systemInstructionOverride: {
            parts: [{ text: AI_PROVIDER_HEALTHCHECK_SYSTEM_TEXT }]
          }
        }
      );

      const normalizedResponse = normalizeAiHealthcheckResponse(responseText);
      if (normalizedResponse !== expectedToken && !String(responseText || '').includes(expectedToken)) {
        throw new Error(`${runtime.label} responded, but the verification token did not match exactly. Received: ${truncateAiPreview(responseText || 'empty response')}`);
      }

      const durationMs = Date.now() - startedAt;
      setAiProviderTestResult(runtime.provider, {
        status: 'passed',
        ok: true,
        checkedAt: new Date().toISOString(),
        routeLabel: runtime.routeLabel,
        durationMs,
        message: `Passed in ${durationMs} ms via ${runtime.routeLabel}.`,
        preview: String(responseText || '').trim()
      });
      return { provider: runtime.provider, label: runtime.label, ok: true, durationMs };
    } catch (error) {
      const message = error?.message || `${runtime.label} health check failed.`;
      setAiProviderTestResult(runtime.provider, {
        status: 'failed',
        ok: false,
        checkedAt: new Date().toISOString(),
        routeLabel: runtime.routeLabel,
        durationMs: Date.now() - startedAt,
        message
      });
      throw error instanceof Error ? error : new Error(message);
    }
  };

  const queueAiProviderHealthCheck = (providerInput) => {
    const provider = normalizeAiProvider(providerInput);
    const label = `${getSelectedAiLabel(provider)} health check`;
    setAiProviderTestBusy(true);

    void enqueueAiOperation(label, async () => {
      try {
        const result = await runAiProviderHealthCheck(provider);
        showNotification(`${result.label} AI health check passed in ${result.durationMs} ms.`);
      } catch (error) {
        if (error?.message !== 'AI queue cleared.') {
          showNotification(error?.message || 'AI health check failed.', 'error');
        }
        throw error;
      } finally {
        setAiProviderTestBusy(false);
      }
    }, { notifyOnQueue: true }).catch((error) => {
      setAiProviderTestBusy(false);
      if (error?.message !== 'AI queue cleared.') {
        console.error('AI provider health check queue failed:', error);
      }
    });
  };

  const queueAllAiProviderHealthChecks = () => {
    setAiProviderTestBusy(true);

    void enqueueAiOperation('AI provider parity check', async () => {
      const results = [];

      try {
        for (const option of AI_PROVIDER_OPTIONS) {
          try {
            const result = await runAiProviderHealthCheck(option.value);
            results.push(result);
          } catch (error) {
            results.push({
              provider: option.value,
              label: getSelectedAiLabel(option.value),
              ok: false,
              message: error?.message || 'AI health check failed.'
            });
          }
        }

        const passedCount = results.filter((result) => result.ok).length;
        const failedCount = results.length - passedCount;
        showNotification(
          failedCount === 0
            ? `AI parity check complete. ${passedCount}/${results.length} providers passed.`
            : `AI parity check complete. ${passedCount}/${results.length} providers passed; ${failedCount} need attention.`,
          failedCount === 0 ? 'success' : 'error'
        );
      } finally {
        setAiProviderTestBusy(false);
      }
    }, { notifyOnQueue: true }).catch((error) => {
      setAiProviderTestBusy(false);
      if (error?.message !== 'AI queue cleared.') {
        console.error('AI provider parity check queue failed:', error);
      }
    });
  };

  const syncAiQueueStatus = () => {
    if (aiQueueDisposedRef.current) return;
    const activeJob = aiOperationActiveRef.current;
    setAiQueueStatus({
      running: Boolean(activeJob),
      activeLabel: activeJob?.label || '',
      pendingCount: aiOperationQueueRef.current.length
    });
  };

  const processAiOperationQueue = () => {
    if (aiOperationActiveRef.current) {
      syncAiQueueStatus();
      return;
    }

    const nextJob = aiOperationQueueRef.current.shift();
    if (!nextJob) {
      syncAiQueueStatus();
      return;
    }

    aiOperationActiveRef.current = nextJob;
    syncAiQueueStatus();

    Promise.resolve()
      .then(() => nextJob.run())
      .then((result) => nextJob.resolve(result))
      .catch((error) => nextJob.reject(error))
      .finally(() => {
        if (aiOperationActiveRef.current?.id === nextJob.id) {
          aiOperationActiveRef.current = null;
        }
        syncAiQueueStatus();
        Promise.resolve().then(() => processAiOperationQueue());
      });
  };

  const enqueueAiOperation = (label, run, options = {}) => {
    const queuedAhead = aiOperationQueueRef.current.length + (aiOperationActiveRef.current ? 1 : 0);

    return new Promise((resolve, reject) => {
      aiOperationQueueRef.current.push({
        id: ++aiOperationSequenceRef.current,
        label,
        run,
        resolve,
        reject
      });

      syncAiQueueStatus();
      processAiOperationQueue();

      if (options.notifyOnQueue && queuedAhead > 0) {
        showNotification(`Queued ${label}. ${queuedAhead} AI job${queuedAhead === 1 ? '' : 's'} ahead.`, 'success');
      }
    });
  };

  const cancelQueuedAiOperations = (reason = 'AI queue cleared.') => {
    const error = new Error(reason);
    while (aiOperationQueueRef.current.length > 0) {
      const queuedJob = aiOperationQueueRef.current.shift();
      queuedJob?.reject?.(error);
    }
    if (activeAIRequestRef.current) {
      activeAIRequestRef.current.abort();
      activeAIRequestRef.current = null;
    }
    aiOperationActiveRef.current = null;
    syncAiQueueStatus();
  };

  const applyLocalDataset = (dataset = {}) => {
    if (Array.isArray(dataset.contacts)) {
      setContacts(normalizeContacts(dataset.contacts));
    }
    if (dataset.threads && typeof dataset.threads === 'object') {
      setThreads(dataset.threads);
    }
    if (Array.isArray(dataset.tasks)) {
      setTasks(normalizeTasks(dataset.tasks));
    }
    if (Array.isArray(dataset.inboxEmails)) {
      setInboxEmails(mergeInboxEmails([], dataset.inboxEmails));
    }
  };

  const persistLocalEncryptedDatabase = async (passphraseOverride = '') => {
    if (!IS_LOCAL_DEV_MODE || typeof window === 'undefined') return;

    const passphrase = String(passphraseOverride || localDbPassphrase || '').trim();
    if (!passphrase) return;

    const desktopLocalDb = getDesktopLocalDbApi();
    if (!desktopLocalDb) {
      throw new Error('Desktop encrypted database unavailable. Launch the desktop app to use local storage.');
    }

    const payload = {
      contacts,
      threads,
      tasks,
      inboxEmails,
      savedAt: new Date().toISOString()
    };

    await desktopLocalDb.save({ passphrase, data: payload });
    setLocalDbBackend('electron-encrypted-file');
    setLocalDbHasEncryptedData(true);
    setLocalDbStatusMessage(`Encrypted desktop database saved at ${new Date().toLocaleTimeString()}.`);
  };

  const unlockLocalEncryptedDatabase = async () => {
    if (!IS_LOCAL_DEV_MODE) {
      showNotification('Encrypted local database is only used in local mode.', 'error');
      return;
    }

    if (typeof window === 'undefined') {
      showNotification('Browser storage is unavailable in this environment.', 'error');
      return;
    }

    const passphrase = String(localDbPassphraseInput || '').trim();
    if (passphrase.length < 8) {
      showNotification('Use at least 8 characters for the local database passphrase.', 'error');
      return;
    }

    setLoading(true);
    try {
      const desktopLocalDb = getDesktopLocalDbApi();
      if (!desktopLocalDb) {
        throw new Error('Desktop encrypted database unavailable. Launch the desktop app to continue.');
      }

      const status = await desktopLocalDb.status();
      const hasDesktopData = Boolean(status?.exists);
      let migratedFromLegacyBrowserPayload = false;

      setLocalDbBackend(status?.backend || 'electron-encrypted-file');
      setLocalDbHasEncryptedData(hasDesktopData);

      if (hasDesktopData) {
        const loaded = await desktopLocalDb.load({ passphrase });
        applyLocalDataset(loaded?.data || {});
      } else {
        const legacyRaw = window.localStorage.getItem(LOCAL_DB_STORAGE_KEY);
        if (legacyRaw) {
          const legacyEncryptedPayload = parseRuntimeJson(legacyRaw, {});
          const legacyDecryptedPayload = await decryptLocalPayload(legacyEncryptedPayload, passphrase);
          applyLocalDataset(legacyDecryptedPayload || {});
          migratedFromLegacyBrowserPayload = true;
        }
      }

      setLocalDbPassphrase(passphrase);
      setLocalDbUnlocked(true);
      localDbReadyRef.current = true;

      await persistLocalEncryptedDatabase(passphrase);
      if (migratedFromLegacyBrowserPayload) {
        window.localStorage.removeItem(LOCAL_DB_STORAGE_KEY);
        setLocalDbStatusMessage('Legacy browser encrypted payload migrated to desktop encrypted database.');
        showNotification('Legacy local data migrated and database unlocked.');
      } else if (hasDesktopData) {
        setLocalDbStatusMessage('Encrypted desktop database unlocked.');
        showNotification('Encrypted local database unlocked.');
      } else {
        setLocalDbStatusMessage('New encrypted desktop database created and unlocked.');
        showNotification('Encrypted local database created and unlocked.');
      }
    } catch (err) {
      console.error(err);
      setLocalDbPassphrase('');
      setLocalDbUnlocked(false);
      localDbReadyRef.current = false;
      setLocalDbStatusMessage('Unable to decrypt local database. Check your passphrase.');
      showNotification('Could not unlock local database. Check your passphrase.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const lockLocalEncryptedDatabase = () => {
    setLocalDbPassphrase('');
    setLocalDbUnlocked(false);
    localDbReadyRef.current = false;
    setLocalDbStatusMessage(
      localDbHasEncryptedData
        ? 'Encrypted local database locked.'
        : 'No encrypted local database found on this device.'
    );
    showNotification('Encrypted local database locked.');
  };

  const resetLocalEncryptedDatabase = async () => {
    if (typeof window === 'undefined') return;
    const confirmed = window.confirm('This will permanently delete encrypted local CRM, thread, task, and inbox data on this device. Continue?');
    if (!confirmed) return;

    const desktopLocalDb = getDesktopLocalDbApi();
    if (!desktopLocalDb) {
      showNotification('Desktop encrypted database unavailable. Launch the desktop app to reset local storage.', 'error');
      return;
    }

    await desktopLocalDb.reset();
    window.localStorage.removeItem(LOCAL_DB_STORAGE_KEY);
    setLocalDbBackend('electron-encrypted-file');
    setContacts([]);
    setThreads({});
    setTasks(DEFAULT_TASKS.map((task) => ({ ...task })));
    setInboxEmails(DEFAULT_INBOX_EMAILS.map((email) => ({ ...email })));
    setLocalDbPassphrase('');
    setLocalDbPassphraseInput('');
    setLocalDbUnlocked(false);
    setLocalDbHasEncryptedData(false);
    localDbReadyRef.current = false;
    setLocalDbStatusMessage('Encrypted local database removed from this device.');
    showNotification('Encrypted local database cleared.', 'success');
  };

  useEffect(() => {
    if (!IS_LOCAL_DEV_MODE || typeof window === 'undefined') return;

    (async () => {
      const desktopLocalDb = getDesktopLocalDbApi();
      if (desktopLocalDb) {
        const status = await desktopLocalDb.status();
        const hasEncryptedData = Boolean(status?.exists);
        setLocalDbBackend(status?.backend || 'electron-encrypted-file');
        setLocalDbHasEncryptedData(hasEncryptedData);
        setLocalDbStatusMessage(
          hasEncryptedData
            ? 'Encrypted desktop database detected. Enter passphrase to unlock.'
            : 'No encrypted desktop database yet. Create one with a passphrase.'
        );
        return;
      }

      setLocalDbBackend('desktop-unavailable');
      setLocalDbHasEncryptedData(false);
      setLocalDbStatusMessage('Desktop encrypted database unavailable in browser preview. Launch the desktop app to use local encrypted storage.');
    })().catch((err) => {
      console.error(err);
      setLocalDbStatusMessage('Failed to initialize encrypted local database status.');
    });
  }, []);

  useEffect(() => {
    if (!IS_LOCAL_DEV_MODE || !localDbUnlocked || !localDbPassphrase || !localDbReadyRef.current) return;

    if (localDbSaveTimerRef.current) {
      clearTimeout(localDbSaveTimerRef.current);
    }

    localDbSaveTimerRef.current = setTimeout(() => {
      persistLocalEncryptedDatabase().catch((err) => {
        console.error(err);
        setLocalDbStatusMessage('Encrypted local database autosave failed.');
      });
    }, 120);

    return () => {
      if (localDbSaveTimerRef.current) {
        clearTimeout(localDbSaveTimerRef.current);
        localDbSaveTimerRef.current = null;
      }
    };
  }, [contacts, threads, tasks, inboxEmails, localDbUnlocked, localDbPassphrase]);

  const getComposerFieldError = (name, value) => {
    const trimmed = (value || '').trim();
    if (name === 'to' && trimmed && !isValidEmail(normalizeEmail(trimmed))) {
      return 'Enter a valid recipient email address.';
    }
    return '';
  };

  // --- Draft Auto-Save ---
  useEffect(() => {
    if (!composerState.body && !composerState.subject) return;
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem('salesdirector.draft.v1', JSON.stringify({
          to: composerState.to,
          subject: composerState.subject,
          body: composerState.body,
          recipientName: composerState.recipientName,
          jobTitle: composerState.jobTitle,
          companyName: composerState.companyName,
          savedAt: new Date().toISOString()
        }));
      } catch { /* ignore */ }
    }, 2000);
    return () => clearTimeout(timer);
  }, [composerState.body, composerState.subject, composerState.to]);

  // Recover draft on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('salesdirector.draft.v1');
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft && (draft.body || draft.subject)) {
        setComposerState(prev => ({
          ...prev,
          to: draft.to || prev.to,
          subject: draft.subject || prev.subject,
          body: draft.body || prev.body,
          recipientName: draft.recipientName || prev.recipientName,
          jobTitle: draft.jobTitle || prev.jobTitle,
          companyName: draft.companyName || prev.companyName
        }));
      }
    } catch { /* ignore */ }
  }, []);

  // --- Filtered Lists (memoized) ---
  const filteredInboxEmails = useMemo(() => {
    let emails = inboxEmails;
    if (inboxFilter === 'unread') emails = emails.filter(e => !e.isRead);
    else if (inboxFilter === 'needsResponse') emails = emails.filter(e => e.needsResponse && !e.isArchived);
    else if (inboxFilter === 'archived') emails = emails.filter(e => e.isArchived);
    else emails = emails.filter(e => !e.isArchived);

    if (inboxSearch.trim()) {
      const term = inboxSearch.toLowerCase();
      emails = emails.filter(e =>
        (e.fromName || '').toLowerCase().includes(term) ||
        (e.fromEmail || '').toLowerCase().includes(term) ||
        (e.subject || '').toLowerCase().includes(term) ||
        (e.company || '').toLowerCase().includes(term)
      );
    }
    return emails;
  }, [inboxEmails, inboxFilter, inboxSearch]);

  const actionableInboxEmails = useMemo(() => inboxEmails.filter((email) => !email.isArchived && email.needsResponse !== false), [inboxEmails]);
  const urgentInboxCandidates = useMemo(() => selectUrgentInboxEmails(inboxEmails, { limit: 3, minScore: 70 }), [inboxEmails]);
  const lowPriorityInboxCandidates = useMemo(() => selectLowPriorityInboxEmails(inboxEmails, { maxScore: 40 }), [inboxEmails]);
  const unscoredActionableInboxCount = useMemo(
    () => actionableInboxEmails.filter((email) => email.aiScore == null || !String(email.aiSummary || '').trim()).length,
    [actionableInboxEmails]
  );
  const normalizedContacts = useMemo(() => normalizeContacts(contacts), [contacts]);
  const normalizedTasks = useMemo(() => normalizeTasks(tasks), [tasks]);
  const pipelineOverview = useMemo(() => buildPipelineOverview(normalizedContacts), [normalizedContacts]);
  const crmOverview = useMemo(() => buildCrmOverview(normalizedContacts, normalizedTasks, threads), [normalizedContacts, normalizedTasks, threads]);
  const contactAttentionMap = useMemo(() => {
    const nextMap = new Map();
    normalizedContacts.forEach((contact) => {
      nextMap.set(contact.email || contact.id, getContactAttentionSummary(contact, normalizedTasks, threads));
    });
    return nextMap;
  }, [normalizedContacts, normalizedTasks, threads]);
  const getContactActionPlan = useCallback(
    (contact, attention = null) => buildContactActionPlan(contact, attention, new Date()),
    []
  );
  const isReviewDossierAction = useCallback(
    (actionPlan) => actionPlan?.primaryAction?.key === 'review-dossier',
    []
  );
  const editingContactInsights = useMemo(() => {
    if (!editingContact) return null;

    const normalizedEmail = normalizeEmail(editingContact.email || '');
    const duplicateContact = editingContact._isNew && normalizedEmail
      ? normalizedContacts.find((contact) => normalizeEmail(contact.email) === normalizedEmail) || null
      : null;
    const suggestedCompany = String(editingContact.company || '').trim() || (normalizedEmail ? formatCompanyFromEmail(normalizedEmail) : '');

    return {
      normalizedEmail,
      hasValidEmail: Boolean(normalizedEmail && isValidEmail(normalizedEmail)),
      missingName: !String(editingContact.name || '').trim(),
      duplicateContact,
      actionPlan: getContactActionPlan(
        {
          ...editingContact,
          email: normalizedEmail || editingContact.email,
          company: suggestedCompany
        },
        normalizedEmail ? contactAttentionMap.get(normalizedEmail) || null : null
      )
    };
  }, [contactAttentionMap, editingContact, getContactActionPlan, normalizedContacts]);
  const selectedContactAttention = useMemo(() => {
    if (!selectedContact) return null;

    const normalizedContact = normalizeContactRecord(selectedContact);
    return contactAttentionMap.get(normalizedContact.email || normalizedContact.id)
      || getContactAttentionSummary(normalizedContact, normalizedTasks, threads);
  }, [contactAttentionMap, normalizedTasks, selectedContact, threads]);
  const selectedContactActionPlan = useMemo(
    () => (selectedContact ? getContactActionPlan(selectedContact, selectedContactAttention) : null),
    [getContactActionPlan, selectedContact, selectedContactAttention]
  );
  const joinContextBlocks = useCallback((...blocks) => blocks
    .map((block) => String(block || '').trim())
    .filter(Boolean)
    .join('\n\n'), []);
  const findLinkedContact = useCallback((options = {}) => {
    const normalizedAddress = normalizeEmail(options.email || '');
    const normalizedHubspotId = String(options.hubspotId || '').trim();
    const normalizedName = String(options.name || '').trim().toLowerCase();

    if (normalizedAddress) {
      const byEmail = normalizedContacts.find((contact) => normalizeEmail(contact.email) === normalizedAddress);
      if (byEmail) return byEmail;
    }

    if (normalizedHubspotId) {
      const byHubspotId = normalizedContacts.find((contact) => String(contact.hubspotId || '').trim() === normalizedHubspotId);
      if (byHubspotId) return byHubspotId;
    }

    if (normalizedName) {
      return normalizedContacts.find((contact) => String(contact.name || '').trim().toLowerCase() === normalizedName) || null;
    }

    return null;
  }, [normalizedContacts]);
  const buildOutreachRelationshipState = useCallback((options = {}) => {
    const inboxEmail = options.inboxEmail || null;
    const matchedContact = options.contact
      ? normalizeContactRecord(options.contact)
      : findLinkedContact({
          email: options.email,
          name: options.name,
          hubspotId: options.hubspotId
        });
    const attention = matchedContact
      ? (contactAttentionMap.get(matchedContact.email || matchedContact.id) || getContactAttentionSummary(matchedContact, normalizedTasks, threads))
      : null;

    const crmLines = matchedContact ? [
      '[CRM SNAPSHOT]',
      `Contact: ${matchedContact.name || options.name || 'Unknown'}`,
      `Company: ${matchedContact.company || options.company || 'Unknown'}`,
      `Stage: ${matchedContact.stage || 'Contact'}`,
      `Priority Score: ${matchedContact.priorityScore || 0}`,
      `Estimated Value: ${formatCurrencyCompact(matchedContact.estimatedValue)}`,
      `Open Tasks: ${attention?.openTasksCount || 0}`,
      `Follow-Up Due: ${attention?.followUpDue ? 'Yes' : 'No'}`,
      `Next Follow-Up: ${matchedContact.nextFollowUpAt || 'Not set'}`,
      `Next Step: ${matchedContact.nextStep || 'Not defined'}`,
      matchedContact.aiSummary ? `AI Summary: ${matchedContact.aiSummary}` : '',
      matchedContact.timelineSummary ? `Timeline Summary: ${matchedContact.timelineSummary}` : ''
    ].filter(Boolean).join('\n') : '';

    const inboxLines = inboxEmail ? [
      '[INBOX SIGNAL]',
      `Latest Subject: ${inboxEmail.subject || 'No subject'}`,
      `Received: ${inboxEmail.date || 'Unknown date'}`,
      inboxEmail.aiScore != null ? `AI Score: ${inboxEmail.aiScore}/100` : '',
      inboxEmail.aiSummary ? `Inbox Insight: ${inboxEmail.aiSummary}` : '',
      'Requested Reply Goal: Move the conversation toward a clear next step.'
    ].filter(Boolean).join('\n') : '';

    return {
      matchedContact,
      attention,
      context: joinContextBlocks(crmLines, inboxLines)
    };
  }, [contactAttentionMap, findLinkedContact, joinContextBlocks, normalizedTasks, threads]);
  const activeOutreachRelationshipState = useMemo(() => buildOutreachRelationshipState({
    email: composerState.to || selectedInboxEmail?.fromEmail,
    name: composerState.recipientName || selectedInboxEmail?.fromName,
    company: composerState.companyName || selectedInboxEmail?.company,
    hubspotId: composerState.hubspotId,
    inboxEmail: selectedInboxEmail
  }), [buildOutreachRelationshipState, composerState.companyName, composerState.hubspotId, composerState.recipientName, composerState.to, selectedInboxEmail]);
  const recommendedOutreachStrategy = useMemo(() => getRecommendedOutreachStrategy({
    stage: activeOutreachRelationshipState?.matchedContact?.stage,
    isStale: activeOutreachRelationshipState?.attention?.isStale,
    followUpDue: activeOutreachRelationshipState?.attention?.followUpDue,
    threadHistory: composerState.threadHistory,
    hasInboxSignal: Boolean(selectedInboxEmail)
  }), [activeOutreachRelationshipState?.attention?.followUpDue, activeOutreachRelationshipState?.attention?.isStale, activeOutreachRelationshipState?.matchedContact?.stage, composerState.threadHistory, selectedInboxEmail]);
  const selectedPlaybook = useMemo(
    () => OUTREACH_PLAYBOOKS.find((playbook) => playbook.id === composerState.selectedPlaybookId) || null,
    [composerState.selectedPlaybookId]
  );
  const selectedSequenceCadence = useMemo(
    () => getSequenceCadenceById(composerState.sequenceCadenceId || recommendedOutreachStrategy.cadenceId || DEFAULT_SEQUENCE_CADENCE_ID, composerState.sequenceStepCount || DEFAULT_SEQUENCE_STEP_COUNT),
    [composerState.sequenceCadenceId, composerState.sequenceStepCount, recommendedOutreachStrategy.cadenceId]
  );
  const outreachPlayContext = useMemo(() => buildOutreachPlayContext({
    playbookId: composerState.selectedPlaybookId || recommendedOutreachStrategy.playbookId,
    cadenceId: composerState.sequenceCadenceId || recommendedOutreachStrategy.cadenceId,
    stepCount: composerState.sequenceStepCount || DEFAULT_SEQUENCE_STEP_COUNT,
    recipientName: composerState.recipientName || activeOutreachRelationshipState?.matchedContact?.name || selectedInboxEmail?.fromName || '',
    companyName: composerState.companyName || activeOutreachRelationshipState?.matchedContact?.company || selectedInboxEmail?.company || '',
    stage: activeOutreachRelationshipState?.matchedContact?.stage || '',
    nextStep: activeOutreachRelationshipState?.matchedContact?.nextStep || '',
    followUpAt: activeOutreachRelationshipState?.matchedContact?.nextFollowUpAt || '',
    aiSummary: activeOutreachRelationshipState?.matchedContact?.aiSummary || selectedInboxEmail?.aiSummary || '',
    timelineSummary: activeOutreachRelationshipState?.matchedContact?.timelineSummary || ''
  }), [activeOutreachRelationshipState?.matchedContact?.aiSummary, activeOutreachRelationshipState?.matchedContact?.company, activeOutreachRelationshipState?.matchedContact?.name, activeOutreachRelationshipState?.matchedContact?.nextFollowUpAt, activeOutreachRelationshipState?.matchedContact?.nextStep, activeOutreachRelationshipState?.matchedContact?.stage, activeOutreachRelationshipState?.matchedContact?.timelineSummary, composerState.companyName, composerState.recipientName, composerState.selectedPlaybookId, composerState.sequenceCadenceId, composerState.sequenceStepCount, recommendedOutreachStrategy.cadenceId, recommendedOutreachStrategy.playbookId, selectedInboxEmail?.aiSummary, selectedInboxEmail?.company, selectedInboxEmail?.fromName]);
  useEffect(() => {
    setComposerState((prev) => {
      const nextPlaybookId = prev.selectedPlaybookId || recommendedOutreachStrategy.playbookId || '';
      const nextCadenceId = prev.sequenceCadenceId || recommendedOutreachStrategy.cadenceId || DEFAULT_SEQUENCE_CADENCE_ID;
      const nextStepCount = prev.sequenceStepCount || DEFAULT_SEQUENCE_STEP_COUNT;

      if (
        nextPlaybookId === prev.selectedPlaybookId
        && nextCadenceId === prev.sequenceCadenceId
        && nextStepCount === prev.sequenceStepCount
      ) {
        return prev;
      }

      return {
        ...prev,
        selectedPlaybookId: nextPlaybookId,
        sequenceCadenceId: nextCadenceId,
        sequenceStepCount: nextStepCount
      };
    });
  }, [recommendedOutreachStrategy.cadenceId, recommendedOutreachStrategy.playbookId]);
  const planningTimeZoneValue = useMemo(() => normalizePlanningTimeZone(config.timezone), [config.timezone]);
  const planningTimeZoneLabel = useMemo(() => getPlanningTimeZoneLabel(planningTimeZoneValue), [planningTimeZoneValue]);
  const currentPlanningDateKey = useMemo(() => formatDateKeyInTimeZone(clockTick, planningTimeZoneValue), [clockTick, planningTimeZoneValue]);
  const currentPlanningDateTimeLabel = useMemo(
    () => formatDateTimeInTimeZone(clockTick, planningTimeZoneValue, { dateStyle: 'full', timeStyle: 'short' }),
    [clockTick, planningTimeZoneValue]
  );
  const planningReferenceDate = useMemo(() => dateKeyToDate(currentPlanningDateKey) || new Date(clockTick), [currentPlanningDateKey, clockTick]);
  const taskSummary = useMemo(
    () => buildTaskSummary(normalizedTasks, selectedCalendarDate, planningReferenceDate),
    [normalizedTasks, selectedCalendarDate, planningReferenceDate]
  );
  const scheduleBufferMinutes = useMemo(() => {
    const parsed = Number(config.scheduleBufferMinutes || 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(120, Math.round(parsed)));
  }, [config.scheduleBufferMinutes]);
  const taskScheduleIssueMap = useMemo(
    () => buildTaskScheduleIssueMap(normalizedTasks, { minimumGapMinutes: scheduleBufferMinutes }),
    [normalizedTasks, scheduleBufferMinutes]
  );
  const taskConflictMap = useMemo(
    () => buildTaskConflictMap(normalizedTasks, { minimumGapMinutes: scheduleBufferMinutes }),
    [normalizedTasks, scheduleBufferMinutes]
  );
  const activeHoursWindow = useMemo(() => {
    const startMinutes = parseTimeToMinutes(config.activeHoursStart);
    const endMinutes = parseTimeToMinutes(config.activeHoursEnd);
    return {
      startMinutes,
      endMinutes,
      isValid: startMinutes != null && endMinutes != null && endMinutes > startMinutes
    };
  }, [config.activeHoursEnd, config.activeHoursStart]);
  const calendarDays = useMemo(
    () => buildCalendarMonth(normalizedTasks, activeCalendarMonth, selectedCalendarDate, planningReferenceDate),
    [normalizedTasks, activeCalendarMonth, selectedCalendarDate, planningReferenceDate]
  );
  const selectedDayTasks = useMemo(
    () => getTasksForDate(normalizedTasks, selectedCalendarDate, planningReferenceDate),
    [normalizedTasks, selectedCalendarDate, planningReferenceDate]
  );
  const selectedDayOpenTasks = useMemo(() => selectedDayTasks.filter((task) => task.status !== 'completed'), [selectedDayTasks]);
  const selectedDayScheduleIssueCount = useMemo(
    () => selectedDayOpenTasks.filter((task) => (taskScheduleIssueMap.get(task.id) || []).length > 0).length,
    [selectedDayOpenTasks, taskScheduleIssueMap]
  );
  const selectedCalendarDateLabel = useMemo(() => formatFriendlyDate(selectedCalendarDate, 'No day selected'), [selectedCalendarDate]);
  const activeCalendarMonthLabel = useMemo(() => {
    const monthDate = dateKeyToDate(`${activeCalendarMonth}-01`);
    if (!monthDate || Number.isNaN(monthDate.getTime())) return 'Unknown month';
    return monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [activeCalendarMonth]);
  const formatTaskTimeRangeLabel = useCallback((task) => {
    const normalizedTask = normalizeTaskRecord(task);
    const startDate = getTaskScheduledStart(normalizedTask);
    const endDate = getTaskScheduledEnd(normalizedTask);
    if (!startDate || !endDate) {
      return normalizedTask.time ? `${normalizedTask.time} · ${normalizedTask.durationMinutes || 30}m` : 'No time set';
    }

    const timeOptions = { hour: 'numeric', minute: '2-digit' };
    return `${startDate.toLocaleTimeString(undefined, timeOptions)} - ${endDate.toLocaleTimeString(undefined, timeOptions)}`;
  }, []);

  const getTaskScheduleState = useCallback((task, issueMap = taskScheduleIssueMap) => {
    const normalizedTask = normalizeTaskRecord(task);
    const parsedStartMinutes = parseTimeToMinutes(normalizedTask.time);
    const hasExplicitTime = normalizedTask.time !== '';
    const issueDetails = issueMap.get(normalizedTask.id) || [];
    const overlapIssues = issueDetails.filter((issue) => issue.kind === 'overlap');
    const bufferIssues = issueDetails.filter((issue) => issue.kind === 'buffer');
    const conflictIds = Array.from(new Set(issueDetails.map((issue) => issue.otherTaskId).filter(Boolean)));

    return {
      invalidTime: hasExplicitTime && parsedStartMinutes == null,
      outsideActiveHours: parsedStartMinutes != null && activeHoursWindow.isValid
        ? parsedStartMinutes < activeHoursWindow.startMinutes || (parsedStartMinutes + (normalizedTask.durationMinutes || 30)) > activeHoursWindow.endMinutes
        : false,
      issueDetails,
      overlapIssues,
      bufferIssues,
      conflictIds,
      hasConflict: issueDetails.length > 0,
      hasOverlap: overlapIssues.length > 0,
      hasBufferConflict: bufferIssues.length > 0,
      startDate: getTaskScheduledStart(normalizedTask),
      endDate: getTaskScheduledEnd(normalizedTask)
    };
  }, [activeHoursWindow, taskScheduleIssueMap]);

  const editingTaskScheduleState = useMemo(() => {
    if (!editingTask) return null;

    const candidateTask = normalizeTaskRecord(editingTask);
    const candidateTasks = normalizedTasks.map((task) => (task.id === candidateTask.id ? candidateTask : normalizeTaskRecord(task)));
    const candidateIssueMap = buildTaskScheduleIssueMap(candidateTasks, { minimumGapMinutes: scheduleBufferMinutes });
    const state = getTaskScheduleState(candidateTask, candidateIssueMap);

    return {
      ...state,
      conflictingTasks: candidateTasks.filter((task) => state.conflictIds.includes(task.id))
    };
  }, [editingTask, getTaskScheduleState, normalizedTasks, scheduleBufferMinutes]);

  const plannerPrepCandidates = useMemo(() => normalizedContacts
    .filter((contact) => {
      if (!contact.email) return false;
      const dueOnSelectedDay = (contact.nextFollowUpAt || '') === selectedCalendarDate;
      return dueOnSelectedDay || ['Opportunity', 'Proposal', 'Customer'].includes(contact.stage);
    })
    .sort((left, right) => {
      const leftDueToday = (left.nextFollowUpAt || '') === selectedCalendarDate ? 1 : 0;
      const rightDueToday = (right.nextFollowUpAt || '') === selectedCalendarDate ? 1 : 0;
      if (rightDueToday !== leftDueToday) return rightDueToday - leftDueToday;

      const priorityDelta = (right.priorityScore || 0) - (left.priorityScore || 0);
      if (priorityDelta !== 0) return priorityDelta;

      const valueDelta = (right.estimatedValue || 0) - (left.estimatedValue || 0);
      if (valueDelta !== 0) return valueDelta;

      return (left.name || '').localeCompare(right.name || '');
    })
    .slice(0, 4), [normalizedContacts, selectedCalendarDate]);
  const upcomingMeetingQueue = useMemo(() => buildUpcomingMeetingQueue(normalizedTasks, normalizedContacts), [normalizedTasks, normalizedContacts]);

  const atRiskPipelineContacts = useMemo(() => normalizedContacts
    .filter((contact) => ['Opportunity', 'Proposal'].includes(contact.stage))
    .map((contact) => ({
      contact,
      attention: contactAttentionMap.get(contact.email || contact.id)
    }))
    .filter(({ contact, attention }) => (
      !contact.nextStep ||
      (contact.nextFollowUpAt || '') <= selectedCalendarDate ||
      Boolean(attention?.isStale) ||
      (attention?.openTasksCount || 0) === 0
    ))
    .sort((left, right) => {
      const valueDelta = (right.contact.estimatedValue || 0) - (left.contact.estimatedValue || 0);
      if (valueDelta !== 0) return valueDelta;

      const priorityDelta = (right.contact.priorityScore || 0) - (left.contact.priorityScore || 0);
      if (priorityDelta !== 0) return priorityDelta;

      return (left.contact.name || '').localeCompare(right.contact.name || '');
    })
    .slice(0, 4), [normalizedContacts, contactAttentionMap, selectedCalendarDate]);
  const salesPerformanceSnapshot = useMemo(() => buildSalesPerformanceSnapshot(normalizedContacts, threads, normalizedTasks), [normalizedContacts, threads, normalizedTasks]);

  const filteredTasks = useMemo(() => {
    const term = taskSearchQuery.trim().toLowerCase();
    return sortTasksForPlanner(normalizedTasks, selectedCalendarDate, planningReferenceDate).filter((task) => {
      const bucket = getTaskBucket(task, selectedCalendarDate, planningReferenceDate);

      if (taskStatusFilter === 'active' && task.status === 'completed') return false;
      if (taskStatusFilter === 'focus-day' && bucket !== 'selected') return false;
      if (taskStatusFilter === 'overdue' && bucket !== 'overdue') return false;
      if (taskStatusFilter === 'unscheduled' && bucket !== 'unscheduled') return false;
      if (taskStatusFilter === 'completed' && task.status !== 'completed') return false;
      if (taskStatusFilter === 'waiting' && task.status !== 'waiting') return false;

      if (!term) return true;
      return [task.title, task.contact, task.company, task.notes, task.rationale, task.owner]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [normalizedTasks, planningReferenceDate, selectedCalendarDate, taskSearchQuery, taskStatusFilter]);

  const filteredContacts = useMemo(() => {
    const term = contactSearchQuery.trim().toLowerCase();
    return normalizedContacts.filter((contact) => {
      if (contactStageFilter !== 'all' && (contact.stage || 'Lead') !== contactStageFilter) {
        return false;
      }

      if (!term) return true;
      return [
        contact.name,
        contact.email,
        contact.company,
        contact.owner,
        contact.nextStep,
        contact.industry,
        contact.city
      ].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [normalizedContacts, contactStageFilter, contactSearchQuery]);

  const globalSearchResults = useMemo(() => {
    if (!globalSearch.trim()) return null;
    const term = globalSearch.toLowerCase();
    return normalizedContacts.filter(c =>
      (c.name || '').toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term) ||
      (c.company || '').toLowerCase().includes(term)
    ).slice(0, 8);
  }, [normalizedContacts, globalSearch]);

  const getConfigFieldError = (name, value, nextConfig) => {
    const trimmed = String(value || '').trim();

    if (name === 'apiBaseUrl' && trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
      return 'Use a full URL starting with http:// or https://';
    }

    if (name === 'companyUrl' && trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
      return 'Use a full URL starting with http:// or https://';
    }

    if ((name === 'replyTo' || name === 'autoBcc' || name === 'smtpUser') && trimmed && !isValidEmail(trimmed)) {
      return 'Enter a valid email address.';
    }

    if (name === 'maxDailyEmails') {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5000) {
        return 'Enter a whole number between 1 and 5000.';
      }
    }

    if (name === 'sendDelay') {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3600) {
        return 'Enter a whole number between 0 and 3600 seconds.';
      }
    }

    if (name === 'imapPort') {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        return 'Enter a valid IMAP port between 1 and 65535.';
      }
    }

    if (name === 'imapLookbackDays') {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
        return 'Enter a whole number between 1 and 365 days.';
      }
    }

    if (name === 'imapSyncLimit') {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
        return 'Enter a whole number between 1 and 200 emails.';
      }
    }

    if (name === 'imapAutoSyncMinutes') {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 240) {
        return 'Enter a whole number between 1 and 240 minutes.';
      }
    }

    if (name === 'scheduleBufferMinutes') {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 120) {
        return 'Enter a whole number between 0 and 120 minutes.';
      }
    }

    if (name === 'aiTemperature') {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1.5) {
        return 'Enter a number between 0.00 and 1.50.';
      }
    }

    if (name === 'aiTopP') {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        return 'Enter a number between 0.00 and 1.00.';
      }
    }

    if (name === 'aiMaxOutputTokens') {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 256 || parsed > AI_MAX_OUTPUT_TOKENS_LIMIT) {
        return `Enter a whole number between 256 and ${AI_MAX_OUTPUT_TOKENS_LIMIT}.`;
      }
    }

    const start = nextConfig.activeHoursStart;
    const end = nextConfig.activeHoursEnd;
    if ((name === 'activeHoursStart' || name === 'activeHoursEnd') && start && end && start >= end) {
      return 'Start time must be earlier than end time.';
    }

    return '';
  };

  const handleConfigChange = (e) => {
    const { name, value, type, checked } = e.target;
    let nextValue = type === 'checkbox' ? checked : value;
    if (name === 'oauth2Provider') {
      nextValue = normalizeOAuthProvider(nextValue);
    } else if (name === 'imapAuthMethod' || name === 'smtpAuthMethod') {
      nextValue = normalizeMailAuthMethod(nextValue);
    } else if (name === 'smtpSecure') {
      nextValue = normalizeSmtpSecureMode(nextValue);
    } else if (name === 'timezone') {
      nextValue = normalizePlanningTimeZone(nextValue);
    } else if (name === 'useGraphApi') {
      nextValue = String(nextValue || '').trim().toLowerCase() === 'true' ? 'true' : 'false';
    }
    if (['apiBaseUrl', 'proxySecret', 'selectedAI', 'geminiKey', 'openaiKey', 'anthropicKey', 'xaiKey', 'openrouterKey', 'openrouterModel', 'openaiCompatibleKey', 'openaiCompatibleBaseUrl', 'openaiCompatibleModel', 'aiTemperature', 'aiTopP', 'aiMaxOutputTokens'].includes(name)) {
      setAiProviderTestResults({});
    }
    setConfig(prev => {
      const nextConfig = { ...prev, [name]: nextValue };
      setConfigErrors(prevErrors => {
        const nextErrors = { ...prevErrors, [name]: getConfigFieldError(name, nextValue, nextConfig) };

        if (name === 'activeHoursStart' || name === 'activeHoursEnd') {
          const rangeError = (nextConfig.activeHoursStart && nextConfig.activeHoursEnd && nextConfig.activeHoursStart >= nextConfig.activeHoursEnd)
            ? 'Start time must be earlier than end time.'
            : '';
          nextErrors.activeHoursStart = rangeError;
          nextErrors.activeHoursEnd = rangeError;
        }

        return nextErrors;
      });

      return nextConfig;
    });
  };

  const handleAiProviderChange = (e) => {
    const provider = normalizeAiProvider(e.target.value);
    const runtime = getAiProviderRuntime(provider);
    if (!runtime.supported) {
      showNotification(runtime.supportDetail, 'error');
      return;
    }
    handleConfigChange(e);
  };

  const handleComposerChange = (e) => {
    const { name, value } = e.target;
    setComposerErrors(prev => ({ ...prev, [name]: getComposerFieldError(name, value) }));
    setComposerState(prev => ({ ...prev, [name]: value }));
  };

  const insertMergeTag = (tag) => {
    const textArea = document.querySelector('textarea[name="body"]');
    if (textArea) {
      const startPos = textArea.selectionStart;
      const endPos = textArea.selectionEnd;
      setComposerState(prev => {
        const newBody = prev.body.substring(0, startPos) + tag + prev.body.substring(endPos);
        return { ...prev, body: newBody };
      });
    } else {
      setComposerState(prev => ({ ...prev, body: prev.body + tag }));
    }
  };

  const getComposerResetState = () => createComposerResetState({
    defaultTone: config.defaultTone,
    defaultLength: config.defaultLength
  });

  const clearWorkspace = () => {
    cancelQueuedAiOperations('AI queue cleared.');
    setComposerState(getComposerResetState());
    setComposerErrors({});
    setInboxFilter('all');
    setInboxSearch('');
    setSelectedInboxEmail(null);
    setUrgentInboxQueueIds([]);
    setArchiveSelectedInboxAfterSend(false);
    showNotification('Workspace cleared and composer reset.', 'success');
  };

  const selectInboxEmailForOutreach = (email, options = {}) => {
    const { quiet = false } = options;
    if (!email) return;
    if (!canReplyToInboxEmail(email)) {
      showNotification('This email does not include a valid sender address to reply to.', 'error');
      return;
    }
    const replyMetadata = getInboxReplyMetadata(email);
    const relationshipState = buildOutreachRelationshipState({
      email: email.fromEmail,
      name: email.fromName,
      company: email.company,
      inboxEmail: email
    });
    setComposerState(buildComposerStateFromInboxEmail({
      email,
      defaultTone: config.defaultTone,
      defaultLength: config.defaultLength,
      aiContext: joinContextBlocks(
        relationshipState.context,
        `Drafting reply to the selected inbox email from ${replyMetadata.recipientName}.`
      )
    }));
    setSelectedInboxEmail(email);
    setActiveTab('outreach');
    if (!quiet) {
      showNotification('Selected inbox email loaded into AI Outreach.', 'success');
    }
  };

  const openSelectedInboxEmailInInbox = () => {
    if (!selectedInboxEmail) return;
    setInboxFilter(selectedInboxEmail.isArchived ? 'archived' : 'all');
    setInboxSearch(selectedInboxEmail.subject || selectedInboxEmail.fromEmail || selectedInboxEmail.fromName || '');
    setActiveTab('inbox');
  };

  const changeInboxSource = () => {
    setUrgentInboxQueueIds([]);
    setInboxFilter('all');
    setInboxSearch('');
    setActiveTab('inbox');
    showNotification('Choose a different email from Smart Inbox.', 'success');
  };

  const clearSavedPreferences = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CONFIG_STORAGE_KEY);
    }
    showNotification('Saved local settings cleared.', 'success');
  };

  const callHubSpotAPI = async ({ resource, method = 'GET', query = '', body }) => {
    const proxyBaseUrl = getApiBaseUrl();

    if (proxyBaseUrl) {
      const headers = { 'Content-Type': 'application/json' };
      if (config.proxySecret) {
        headers['x-proxy-secret'] = config.proxySecret;
      }

      const proxyPath = resource === 'contacts' ? '/api/hubspot/contacts' : '/api/hubspot/emails';
      const proxyQuery = query ? `?${query}` : '';

      const response = await fetch(`${proxyBaseUrl}${proxyPath}${proxyQuery}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {})
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `HubSpot proxy request failed: ${response.status}`);
      }
      return data;
    }

    if (!config.hubspotToken) {
      throw new Error('Please configure your HubSpot Access Token in Settings first.');
    }

    const directPath = resource === 'contacts'
      ? `/crm/v3/objects/contacts${query ? `?${query}` : ''}`
      : `/crm/v3/objects/emails${query ? `?${query}` : ''}`;

    const response = await fetch(`https://api.hubapi.com${directPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.hubspotToken}`,
        'Content-Type': 'application/json'
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `HubSpot API error: ${response.status}`);
    }
    return data;
  };

  const loadSequenceStepToComposer = (step) => {
    if (!step) return;
    setComposerState(prev => ({
      ...prev,
      subject: step.subject,
      body: step.body
    }));
    showNotification(`Loaded Step ${step.stepNumber} into composer.`);
  };

  const injectCurrentRelationshipContext = () => {
    if (!activeOutreachRelationshipState?.context) {
      showNotification('No linked CRM or inbox context is available for this draft yet.', 'error');
      return;
    }

    setComposerState((prev) => ({
      ...prev,
      aiContext: joinContextBlocks(prev.aiContext, activeOutreachRelationshipState.context)
    }));
    showNotification('CRM and inbox context added to the outreach workspace.', 'success');
  };

  const openOrCreateOutreachContact = async () => {
    if (activeOutreachRelationshipState?.matchedContact) {
      openDossier(activeOutreachRelationshipState.matchedContact);
      setActiveTab('contacts');
      return;
    }

    const recipientEmail = normalizeEmail(composerState.to || selectedInboxEmail?.fromEmail || '');
    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      showNotification('Add a valid recipient email before creating a CRM contact from Outreach.', 'error');
      return;
    }

    const savedContact = await ensureContactFromActivity({
      email: recipientEmail,
      name: composerState.recipientName || selectedInboxEmail?.fromName || 'Unknown',
      company: composerState.companyName || selectedInboxEmail?.company || formatCompanyFromEmail(recipientEmail),
      source: selectedInboxEmail ? 'Inbox' : 'Manual',
      stage: 'Contact',
      priorityScore: selectedInboxEmail?.aiScore || undefined,
      aiSummary: selectedInboxEmail?.aiSummary || undefined
    });

    if (!savedContact) {
      showNotification('Unable to create a CRM contact from the current outreach draft.', 'error');
      return;
    }

    openDossier(savedContact);
    setActiveTab('contacts');
    showNotification('CRM contact created from the current outreach recipient.', 'success');
  };

  const createSequenceTasksFromComposer = () => {
    if (!Array.isArray(composerState.sequenceSteps) || composerState.sequenceSteps.length === 0) {
      showNotification('Generate a sequence first so there are steps to schedule.', 'error');
      return;
    }

    const sequenceTasks = createSequenceTasksFromSteps(composerState.sequenceSteps, {
      baseDateKey: selectedCalendarDate || currentPlanningDateKey,
      recipientName: composerState.recipientName || activeOutreachRelationshipState?.matchedContact?.name || '',
      companyName: composerState.companyName || activeOutreachRelationshipState?.matchedContact?.company || '',
      recipientEmail: composerState.to,
      owner: activeOutreachRelationshipState?.matchedContact?.owner || config.senderName || ''
    });

    if (sequenceTasks.length === 0) {
      showNotification('The generated sequence could not be converted into planner tasks.', 'error');
      return;
    }

    const savedTasks = appendTaskBatchLocally(sequenceTasks);
    if (savedTasks[0]?.scheduledDate) {
      setSelectedCalendarDate(savedTasks[0].scheduledDate);
    }
    setActiveTab('tasks');
    showNotification(`Created ${savedTasks.length} sequence follow-up task${savedTasks.length === 1 ? '' : 's'} in the planner.`, 'success');
  };

  const buildHistoryStringFromMessages = (messages = []) => {
    return [...(Array.isArray(messages) ? messages : [])]
      .sort((left, right) => new Date(left?.date || 0) - new Date(right?.date || 0))
      .map((message) => {
        const actor = message?.type === 'call'
          ? 'Call note'
          : message?.direction === 'outbound'
            ? 'You'
            : 'Prospect';
        return `[${new Date(message?.date || Date.now()).toLocaleDateString()}] ${actor} wrote:\nSubject: ${message?.subject || 'No Subject'}\n${message?.body || ''}`;
      })
      .join('\n\n');
  };

  const buildThreadMessageFromInboxEmail = (email) => ({
    date: email?.dateRaw || new Date().toISOString(),
    subject: email?.subject || 'No Subject',
    body: email?.body || '',
    direction: 'inbound',
    type: 'email',
    sourceInboxId: email?.id || '',
    source: email?.source || 'manual'
  });

  const mergeThreadMessages = (currentMessages = [], additionalMessages = []) => {
    const byFingerprint = new Map();

    [...currentMessages, ...additionalMessages].forEach((message) => {
      if (!message) return;
      const fingerprint = message.sourceInboxId
        ? `inbox:${message.sourceInboxId}`
        : `${message.direction || ''}|${message.type || 'email'}|${message.date || ''}|${message.subject || ''}|${message.body || ''}`;

      if (!byFingerprint.has(fingerprint)) {
        byFingerprint.set(fingerprint, { ...message });
      }
    });

    return Array.from(byFingerprint.values()).sort((left, right) => new Date(left?.date || 0) - new Date(right?.date || 0));
  };

  const updateSelectedContactSnapshot = (contactInput, messagesOverride) => {
    const normalizedContact = normalizeContactRecord(contactInput);
    setSelectedContact((prev) => {
      if (!prev || normalizeEmail(prev.email) !== normalizedContact.email) {
        return prev;
      }

      const nextMessages = Array.isArray(messagesOverride)
        ? messagesOverride
        : (threads[normalizedContact.email]?.messages || prev.messages || []);

      return {
        ...prev,
        ...normalizedContact,
        messages: nextMessages,
        historyString: buildHistoryStringFromMessages(nextMessages)
      };
    });
  };

  const upsertContactLocally = (contactInput) => {
    const nextContact = normalizeContactRecord(contactInput);
    setContacts((prev) => normalizeContacts([
      ...prev.filter((contact) => normalizeEmail(contact.email) !== nextContact.email),
      nextContact
    ]));
    return nextContact;
  };

  const saveContactRecord = async (contactInput, options = {}) => {
    const normalizedContact = normalizeContactRecord({ ...contactInput, _isNew: false });
    const existingContact = normalizedContacts.find((contact) => normalizeEmail(contact.email) === normalizedContact.email);
    const baseStageHistory = Array.isArray(contactInput?.stageHistory) && contactInput.stageHistory.length > 0
      ? contactInput.stageHistory
      : (existingContact?.stageHistory || []);
    const stageHistory = (!baseStageHistory.length || baseStageHistory[baseStageHistory.length - 1]?.stage !== normalizedContact.stage)
      ? [...baseStageHistory, { stage: normalizedContact.stage, date: new Date().toISOString() }]
      : baseStageHistory;
    const nextContact = normalizeContactRecord({ ...normalizedContact, stageHistory });

    if (!nextContact.email || !isValidEmail(nextContact.email) || !user) {
      return nextContact;
    }

    if (IS_LOCAL_DEV_MODE || !db) {
      upsertContactLocally(nextContact);
    } else {
      const { _isNew, ...persistableContact } = nextContact;
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', nextContact.email);
      await setDoc(docRef, persistableContact, { merge: true });
    }

    updateSelectedContactSnapshot(nextContact);
    if (options.notificationMessage) {
      showNotification(options.notificationMessage, options.notificationType || 'success');
    }
    return nextContact;
  };

  const persistThreadMessages = async (contactEmail, messages = []) => {
    if (!contactEmail || !user) return [];

    const normalizedEmail = normalizeEmail(contactEmail);
    const nextMessages = mergeThreadMessages([], messages);
    setThreads((prev) => ({
      ...prev,
      [normalizedEmail]: {
        contactEmail: normalizedEmail,
        messages: nextMessages
      }
    }));

    if (!IS_LOCAL_DEV_MODE && db) {
      const threadRef = doc(db, 'artifacts', appId, 'users', user.uid, 'threads', normalizedEmail);
      await setDoc(threadRef, {
        contactEmail: normalizedEmail,
        messages: nextMessages
      }, { merge: true });
    }

    updateSelectedContactSnapshot({ email: normalizedEmail }, nextMessages);
    return nextMessages;
  };

  const ensureContactFromActivity = async (activity = {}) => {
    const email = normalizeEmail(activity.email || activity.contactEmail || '');
    if (!email || !isValidEmail(email)) return null;

    const existingContact = normalizedContacts.find((contact) => normalizeEmail(contact.email) === email) || {};
    const nextContact = normalizeContactRecord({
      ...existingContact,
      id: email,
      email,
      name: activity.name || existingContact.name || activity.fromName || 'Unknown',
      company: activity.company || existingContact.company || formatCompanyFromEmail(email),
      jobTitle: activity.jobTitle || existingContact.jobTitle || '',
      source: existingContact.source || activity.source || 'Manual',
      stage: existingContact.stage || activity.stage || 'Contact',
      owner: existingContact.owner || config.senderName || '',
      lastContactedAt: activity.lastContactedAt || existingContact.lastContactedAt,
      nextFollowUpAt: activity.nextFollowUpAt ?? existingContact.nextFollowUpAt,
      nextStep: activity.nextStep ?? existingContact.nextStep,
      priorityScore: Math.max(Number(activity.priorityScore || 0), Number(existingContact.priorityScore || 0), 50),
      aiSummary: activity.aiSummary ?? existingContact.aiSummary,
      timelineSummary: activity.timelineSummary ?? existingContact.timelineSummary
    });

    return saveContactRecord(nextContact);
  };

  const runContactTimelineSummary = async (contactInput, options = {}) => {
    const normalizedContact = normalizeContactRecord(contactInput);
    if (!normalizedContact.email || !isValidEmail(normalizedContact.email)) return null;

    const timelineMessages = mergeThreadMessages(
      threads[normalizedContact.email]?.messages || [],
      options.messages || []
    );

    if (timelineMessages.length === 0 && !normalizedContact.nextStep) {
      return null;
    }

    setTimelineSummaryRefreshingEmail(normalizedContact.email);
    try {
      const canUseAi = !options.preferHeuristic && isAiProviderReady();
      let timelineSummary = buildHeuristicTimelineSummary(normalizedContact, timelineMessages);

      if (canUseAi) {
        const timelineLines = timelineMessages.slice(-8).map((message) => {
          const kind = message.type === 'call' ? 'Call' : message.direction === 'outbound' ? 'Outbound Email' : 'Inbound Email';
          return `[${new Date(message.date || Date.now()).toLocaleString()}] ${kind}\nSubject: ${message.subject || 'No Subject'}\n${String(message.body || '').slice(0, 500)}`;
        }).join('\n\n');

        const prompt = `Act as an elite small-business revenue operator. Summarize this relationship timeline so the owner can act fast.
Return exactly three lines with these labels:
SUMMARY: ...
MOMENTUM: ...
NEXT ACTION: ...

Contact: ${normalizedContact.name} at ${normalizedContact.company || 'Unknown'}
Stage: ${normalizedContact.stage}
Next Step: ${normalizedContact.nextStep || 'Not defined'}
Follow-Up Date: ${normalizedContact.nextFollowUpAt || 'Not set'}

Timeline:
${timelineLines}

No emojis.`;

        const result = await callGeminiAPI(prompt, { abortPrevious: false });
        if (String(result || '').trim()) {
          timelineSummary = String(result || '').trim();
        }
      }

      const savedContact = await saveContactRecord({
        ...normalizedContact,
        timelineSummary,
        lastAiReviewedAt: new Date().toISOString()
      });

      updateSelectedContactSnapshot(savedContact, timelineMessages);
      return savedContact;
    } catch (error) {
      console.error('Failed to refresh contact timeline summary:', error);
      if (options.notifyOnError) {
        showNotification(error.message || 'Failed to refresh timeline summary.', 'error');
      }
      return null;
    } finally {
      setTimelineSummaryRefreshingEmail((prev) => (prev === normalizedContact.email ? '' : prev));
    }
  };

  const refreshContactTimelineSummary = async (contactInput, options = {}) => {
    const normalizedContact = normalizeContactRecord(contactInput);
    const shouldQueue = !options.preferHeuristic && isAiProviderReady() && Boolean(normalizedContact.email);

    if (!shouldQueue) {
      return runContactTimelineSummary(contactInput, options);
    }

    const label = normalizedContact.name
      ? `Refresh pulse for ${normalizedContact.name}`
      : 'Refresh relationship pulse';

    return enqueueAiOperation(label, () => runContactTimelineSummary(contactInput, options));
  };

  const appendTaskLocally = (taskInput) => {
    const nextTask = normalizeTaskRecord(taskInput);
    setTasks((prev) => sortTasksForPlanner([nextTask, ...prev], selectedCalendarDate, planningReferenceDate));
    return nextTask;
  };

  const appendTaskBatchLocally = (taskInputs = []) => {
    const nextTasks = taskInputs.map((task) => normalizeTaskRecord(task));
    if (nextTasks.length === 0) return [];
    setTasks((prev) => sortTasksForPlanner([...nextTasks, ...prev], selectedCalendarDate, planningReferenceDate));
    return nextTasks;
  };

  const updateTaskLocally = (taskId, updater) => {
    setTasks((prev) => sortTasksForPlanner(
      prev.map((task) => {
        if (task.id !== taskId) return normalizeTaskRecord(task);
        const nextTask = typeof updater === 'function' ? updater(normalizeTaskRecord(task)) : { ...normalizeTaskRecord(task), ...updater };
        return normalizeTaskRecord(nextTask);
      }),
      selectedCalendarDate,
      planningReferenceDate
    ));
  };

  const loadContactIntoOutreach = (contact) => {
    const normalizedContact = normalizeContactRecord(contact);
    const attention = contactAttentionMap.get(normalizedContact.email || normalizedContact.id);
    const historyString = attention?.contact?.historyString || selectedContact?.historyString || '';
    const relationshipState = buildOutreachRelationshipState({ contact: normalizedContact });

    setComposerState(prev => ({
      ...createComposerResetState({ defaultTone: config.defaultTone, defaultLength: config.defaultLength }),
      to: normalizedContact.email,
      hubspotId: normalizedContact.hubspotId || null,
      recipientName: normalizedContact.name,
      companyName: normalizedContact.company,
      jobTitle: normalizedContact.jobTitle || '',
      threadHistory: historyString,
      aiContext: joinContextBlocks(relationshipState.context, normalizedContact.aiSummary || prev.aiContext || '')
    }));
    setSelectedInboxEmail(null);
    setActiveTab('outreach');
  };

  const createTaskForContact = (contact) => {
    const normalizedContact = normalizeContactRecord(contact);
    const task = appendTaskLocally(createEmptyTask({
      id: `task-${Date.now()}`,
      title: normalizedContact.nextStep || `Follow up with ${normalizedContact.name}`,
      type: 'follow-up',
      dueDate: normalizedContact.nextFollowUpAt || selectedCalendarDate,
      scheduledDate: normalizedContact.nextFollowUpAt || selectedCalendarDate,
      priority: normalizedContact.priorityScore || 65,
      contact: normalizedContact.name,
      contactEmail: normalizedContact.email,
      company: normalizedContact.company,
      owner: normalizedContact.owner,
      rationale: normalizedContact.aiSummary || normalizedContact.notes || '',
      notes: normalizedContact.nextStep ? `Next step: ${normalizedContact.nextStep}` : ''
    }));
    setNewTaskInput('');
    setSelectedCalendarDate(getTaskCalendarDate(task) || selectedCalendarDate);
    setActiveTab('tasks');
    showNotification(`Task created for ${normalizedContact.name}.`);
  };

  const runContactPrimaryAction = (contact, attention = null, event) => {
    event?.stopPropagation();

    const normalizedContact = normalizeContactRecord(contact);
    const actionPlan = getContactActionPlan(normalizedContact, attention);

    switch (actionPlan.primaryAction.key) {
      case 'edit-contact':
        openContactEditor(normalizedContact, { isNew: false });
        break;
      case 'proposal-follow-up':
        void handleAIAction('proposalFollowUp', { contact: normalizedContact });
        break;
      case 'reactivation-draft':
        void handleAIAction('reactivationDraft', { contact: normalizedContact });
        break;
      case 'customer-check-in-draft':
        void handleAIAction('customerCheckIn', { contact: normalizedContact });
        break;
      case 'customer-check-in-task':
        createTaskForContact(normalizedContact);
        break;
      case 'outreach':
        loadContactIntoOutreach(normalizedContact);
        break;
      case 'create-task':
        createTaskForContact(normalizedContact);
        break;
      default:
        openDossier(normalizedContact);
        setActiveTab('contacts');
        break;
    }
  };

  const runInboxPrimaryAction = (email, relationshipState) => {
    if (!relationshipState?.matchedContact) {
      void openOrCreateContactFromInboxEmail(email);
      return;
    }

    const normalizedContact = normalizeContactRecord(relationshipState.matchedContact);
    const actionPlan = getContactActionPlan(normalizedContact, relationshipState.attention);

    switch (actionPlan.primaryAction.key) {
      case 'edit-contact':
        openContactEditor(normalizedContact, { isNew: false });
        break;
      case 'proposal-follow-up':
        void handleAIAction('proposalFollowUp', { contact: normalizedContact });
        break;
      case 'reactivation-draft':
        void handleAIAction('reactivationDraft', { contact: normalizedContact, inboxEmail: email });
        break;
      case 'customer-check-in-draft':
        void handleAIAction('customerCheckIn', { contact: normalizedContact, inboxEmail: email });
        break;
      case 'customer-check-in-task':
        addFollowUpTaskFromInboxEmail(email);
        break;
      case 'create-task':
        addFollowUpTaskFromInboxEmail(email);
        break;
      case 'outreach':
        prepareComposerFromInboxEmail(email);
        break;
      default:
        openDossier(normalizedContact);
        setActiveTab('contacts');
        break;
    }
  };

  const inferTaskTypeFromTitle = (title = '') => {
    const normalizedTitle = String(title || '').toLowerCase();
    if (/(call|phone)/i.test(normalizedTitle)) return 'call';
    if (/(meeting|demo)/i.test(normalizedTitle)) return 'meeting';
    if (/(proposal|quote|pricing)/i.test(normalizedTitle)) return 'proposal';
    if (/(review|research|audit|analy)/i.test(normalizedTitle)) return 'research';
    if (/(admin|update|clean|document)/i.test(normalizedTitle)) return 'admin';
    return 'follow-up';
  };

  const parseStructuredOutreachDraft = (text = '') => {
    const source = String(text || '');
    const subject = source.match(/^SUBJECT\s*[:=-]\s*(.+)$/im)?.[1]?.trim() || '';
    const followUpDate = formatDateKey(source.match(/^FOLLOW-UP DATE\s*[:=-]\s*(.+)$/im)?.[1] || '');
    const bodyMatch = source.match(/BODY\s*[:=-]\s*([\s\S]+)/im);
    const body = bodyMatch
      ? bodyMatch[1].trim()
      : source
        .replace(/^SUBJECT\s*[:=-].*$/im, '')
        .replace(/^FOLLOW-UP DATE\s*[:=-].*$/im, '')
        .replace(/^BODY\s*[:=-]\s*/im, '')
        .trim();

    return { subject, followUpDate, body };
  };

  const findContactForTask = (taskInput) => {
    const normalizedTask = normalizeTaskRecord(taskInput);
    return normalizedContacts.find((contact) => normalizeEmail(contact.email) === normalizeEmail(normalizedTask.contactEmail || ''))
      || normalizedContacts.find((contact) => (contact.name || '').toLowerCase() === (normalizedTask.contact || '').toLowerCase())
      || null;
  };

  const findBestContactMatchFromText = (...candidateTexts) => {
    const haystack = candidateTexts
      .map((value) => String(value || '').toLowerCase())
      .filter(Boolean)
      .join(' ');

    if (!haystack.trim()) return null;

    let bestMatch = null;
    let bestScore = 0;

    normalizedContacts.forEach((contact) => {
      const candidates = [contact.name, contact.company, contact.email]
        .map((value) => String(value || '').toLowerCase())
        .filter(Boolean);
      const score = candidates.reduce((total, value) => total + (haystack.includes(value) ? value.length : 0), 0);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = contact;
      }
    });

    return bestScore > 0 ? bestMatch : null;
  };

  const applyTaskTemplate = (templateId) => {
    const existingSignature = new Set(normalizedTasks
      .filter((task) => task.status !== 'completed' && task.templateId)
      .map((task) => `${task.templateId}:${task.scheduledDate || ''}`));
    const signature = `${templateId}:${selectedCalendarDate}`;
    if (existingSignature.has(signature)) {
      showNotification('This template is already active for the selected day.', 'error');
      return;
    }

    const templateTasks = materializeTaskTemplate(templateId, {
      scheduledDate: selectedCalendarDate,
      owner: config.senderName || ''
    });

    if (templateTasks.length === 0) {
      showNotification('Template could not be created.', 'error');
      return;
    }

    appendTaskBatchLocally(templateTasks);
    showNotification(`Added ${templateTasks.length} tasks from the template.`);
  };

  const createMeetingPrepPackForContact = (contact, options = {}) => {
    const normalizedContact = normalizeContactRecord(contact);
    const prepDate = options.scheduledDate || normalizedContact.nextFollowUpAt || selectedCalendarDate;
    const existingPack = normalizedTasks.some((task) => (
      task.status !== 'completed' &&
      task.templateId === 'meeting-prep-pack' &&
      normalizeEmail(task.contactEmail || '') === normalizedContact.email &&
      (task.scheduledDate || '') === prepDate
    ));

    if (existingPack) {
      showNotification(`A meeting prep pack already exists for ${normalizedContact.name} on ${formatFriendlyDate(prepDate)}.`, 'error');
      return false;
    }

    const prepTasks = createMeetingPrepPack(normalizedContact, { scheduledDate: prepDate });
    appendTaskBatchLocally(prepTasks);
    setSelectedCalendarDate(prepDate);
    setActiveTab('tasks');
    showNotification(`Meeting prep pack created for ${normalizedContact.name}.`);
    return true;
  };

  const moveContactToStage = async (contact, nextStage) => {
    const normalizedContact = normalizeContactRecord(contact);
    if (!nextStage || normalizedContact.stage === nextStage) return;

    const stageDefaults = {
      Lead: { priorityScore: Math.max(normalizedContact.priorityScore || 45, 45), leadTemperature: 'Cold' },
      Contact: { priorityScore: Math.max(normalizedContact.priorityScore || 55, 55), leadTemperature: normalizedContact.leadTemperature === 'Hot' ? 'Warm' : normalizedContact.leadTemperature || 'Warm' },
      Opportunity: { priorityScore: Math.max(normalizedContact.priorityScore || 70, 70), leadTemperature: 'Hot' },
      Proposal: { priorityScore: Math.max(normalizedContact.priorityScore || 85, 85), leadTemperature: 'Hot' },
      Customer: { priorityScore: Math.max(normalizedContact.priorityScore || 80, 80), leadTemperature: 'Warm' },
      Churned: { priorityScore: normalizedContact.priorityScore || 30, leadTemperature: normalizedContact.leadTemperature || 'Cold' }
    };

    const updatedContact = await saveContactRecord({
      ...normalizedContact,
      stage: nextStage,
      ...stageDefaults[nextStage]
    });
    setDraggedPipelineContactEmail('');
    if (updatedContact) {
      showNotification(`${updatedContact.name} moved to ${nextStage}.`);
    }
  };

  const markTaskInProgress = (taskId) => {
    updateTaskLocally(taskId, (task) => ({
      ...task,
      status: task.status === 'completed' ? 'completed' : 'in-progress'
    }));
    showNotification('Task moved into progress.');
  };

  const scheduleTaskForSelectedDay = (taskId) => {
    updateTaskLocally(taskId, (task) => ({
      ...task,
      scheduledDate: selectedCalendarDate,
      dueDate: task.dueDate || selectedCalendarDate,
      status: task.status === 'completed' ? 'completed' : 'pending'
    }));
    showNotification(`Task scheduled for ${selectedCalendarDateLabel}.`);
  };

  const clearPlannerScheduleForTask = (taskId) => {
    updateTaskLocally(taskId, (task) => ({
      ...task,
      scheduledDate: '',
      time: ''
    }));
    showNotification('Task removed from the planner day.');
  };

  // --- Task Management Logic ---
  const addTask = (e) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;
    appendTaskLocally(createEmptyTask({
      id: `task-${Date.now()}`,
      title: newTaskInput,
      type: 'admin',
      status: 'pending',
      priority: 45,
      scheduledDate: selectedCalendarDate,
      dueDate: selectedCalendarDate,
      contact: 'General Task',
      company: 'Internal'
    }));
    setNewTaskInput('');
    showNotification("Task added.");
  };

  const toggleTaskStatus = (taskId) => {
    updateTaskLocally(taskId, (task) => ({
      ...task,
      status: task.status === 'completed' ? 'pending' : 'completed'
    }));
  };
  
  const deleteTask = (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    showNotification("Task removed.");
  };

  const openEditTask = (task) => {
    setEditingTask({ ...normalizeTaskRecord(task), dueDate: task.dueDate || '', scheduledDate: task.scheduledDate || '', priority: task.priority || '' });
    setIsTaskModalOpen(true);
  };

  const handleTaskFormChange = (e) => {
    const { name, value } = e.target;
    setEditingTask(prev => ({
      ...prev,
      [name]: name === 'priority' || name === 'durationMinutes' ? (value ? Number(value) : null) : value
    }));
  };

  const saveTask = () => {
    if (!editingTask) return;

    const nextTask = normalizeTaskRecord(editingTask);
    if (nextTask.time && parseTimeToMinutes(nextTask.time) == null) {
      showNotification('Use a start time like 09:00 AM or 14:30.', 'error');
      return;
    }

    const nextTasks = normalizedTasks.map((task) => (task.id === nextTask.id ? nextTask : normalizeTaskRecord(task)));
    const nextIssueMap = buildTaskScheduleIssueMap(nextTasks, { minimumGapMinutes: scheduleBufferMinutes });
    const nextIssues = nextIssueMap.get(nextTask.id) || [];
    if (nextTask.status !== 'completed' && nextIssues.length > 0) {
      const hasOverlap = nextIssues.some((issue) => issue.kind === 'overlap');
      showNotification(
        hasOverlap
          ? 'This task overlaps with another scheduled task. Resolve the conflict before saving.'
          : `Leave at least ${scheduleBufferMinutes} minutes between scheduled tasks before saving.`,
        'error'
      );
      return;
    }

    setTasks(prev => sortTasksForPlanner(prev.map((task) => task.id === editingTask.id ? nextTask : normalizeTaskRecord(task)), selectedCalendarDate, planningReferenceDate));
    setIsTaskModalOpen(false);
    setEditingTask(null);
    showNotification('Task updated.');
  };

  // --- Inbox Management Logic ---
  const deleteInboxEmail = (emailId) => {
    setInboxEmails(prev => prev.filter(e => e.id !== emailId));
    showNotification('Email removed from inbox.');
  };

  const getImapActionConfig = () => {
    const user = (config.imapUser || config.smtpUser || '').trim();
    const password = String(config.imapPass || config.smtpPass || '');
    const provider = normalizeOAuthProvider(config.oauth2Provider);
    const isGoogle = provider === 'google';
    return {
      host: config.imapHost,
      port: Number(config.imapPort),
      secure: true,
      user,
      password,
      folder: config.imapFolder || 'INBOX',
      archiveFolder: config.imapArchiveFolder || 'Archive',
      authMethod: normalizeMailAuthMethod(config.imapAuthMethod),
      oauth2Provider: provider,
      oauth2ClientId: isGoogle ? (config.googleOAuth2ClientId || '') : (config.imapOAuth2ClientId || ''),
      oauth2TenantId: config.imapOAuth2TenantId || '',
      oauth2ClientSecret: isGoogle ? (config.googleOAuth2ClientSecret || '') : ''
    };
  };

  const getSmtpSendConfig = () => {
    const provider = normalizeOAuthProvider(config.oauth2Provider);
    const isGoogle = provider === 'google';
    return {
      smtpHost: config.smtpHost,
      smtpPort: Number(config.smtpPort),
      smtpSecure: normalizeSmtpSecureMode(config.smtpSecure),
      smtpUser: config.smtpUser || '',
      smtpPass: config.smtpPass || '',
      smtpAuthMethod: normalizeMailAuthMethod(config.smtpAuthMethod),
      oauth2Provider: provider,
      oauth2ClientId: isGoogle ? (config.googleOAuth2ClientId || '') : (config.imapOAuth2ClientId || ''),
      oauth2TenantId: config.imapOAuth2TenantId || '',
      oauth2ClientSecret: isGoogle ? (config.googleOAuth2ClientSecret || '') : ''
    };
  };

  const getOAuth2LoginParams = () => {
    const provider = normalizeOAuthProvider(config.oauth2Provider);
    const isGoogle = provider === 'google';
    return {
      provider,
      clientId: isGoogle ? (config.googleOAuth2ClientId || '').trim() : (config.imapOAuth2ClientId || '').trim(),
      tenantId: (config.imapOAuth2TenantId || '').trim(),
      clientSecret: isGoogle ? (config.googleOAuth2ClientSecret || '').trim() : '',
      loginHint: (config.imapUser || config.smtpUser || '').trim()
    };
  };

  const handleOAuth2Login = async () => {
    const desktopImapApi = getDesktopImapApi();
    if (!desktopImapApi || typeof desktopImapApi.oauth2Login !== 'function') {
      showNotification('OAuth2 login requires the desktop app runtime.', 'error');
      return;
    }
    const params = getOAuth2LoginParams();
    if (!params.clientId) {
      showNotification(`Enter your ${params.provider === 'google' ? 'Google' : 'Azure'} Client ID before signing in.`, 'error');
      return;
    }
    if (params.provider === 'google' && !params.clientSecret) {
      showNotification('Enter your Google Client Secret before signing in.', 'error');
      return;
    }
    try {
      setLoading(true);
      const scopeSet = String(config.useGraphApi) === 'true' && params.provider === 'microsoft' ? 'graph' : 'imap';
      const result = await desktopImapApi.oauth2Login({ ...params, scopeSet });
      if (result?.ok) {
        setImapOAuth2Status({ authenticated: true, user: result.user || params.loginHint, name: result.name || '', expired: false });
        const label = params.provider === 'google' ? 'Google' : 'Microsoft';
        showNotification(`Signed in to ${label} as ${result.user || result.name || 'user'}.`);
      }
    } catch (error) {
      showNotification(error?.message || 'Sign-in failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth2Logout = async () => {
    const desktopImapApi = getDesktopImapApi();
    if (!desktopImapApi || typeof desktopImapApi.oauth2Logout !== 'function') return;
    const params = getOAuth2LoginParams();
    try {
      await desktopImapApi.oauth2Logout({ provider: params.provider, clientId: params.clientId, user: params.loginHint });
      setImapOAuth2Status({ authenticated: false, user: '', name: '', expired: false });
      showNotification('Account disconnected.');
    } catch (error) {
      showNotification(error?.message || 'Sign-out failed.', 'error');
    }
  };

  const refreshOAuth2Status = async () => {
    const desktopImapApi = getDesktopImapApi();
    if (!desktopImapApi || typeof desktopImapApi.oauth2Status !== 'function') return;
    const params = getOAuth2LoginParams();
    if (!params.clientId || !params.loginHint) {
      setImapOAuth2Status({ authenticated: false, user: '', name: '', expired: false });
      return;
    }
    try {
      const status = await desktopImapApi.oauth2Status({ provider: params.provider, clientId: params.clientId, user: params.loginHint });
      setImapOAuth2Status({
        authenticated: Boolean(status?.authenticated),
        user: status?.user || '',
        name: status?.name || '',
        expired: Boolean(status?.expired)
      });
    } catch {
      setImapOAuth2Status({ authenticated: false, user: '', name: '', expired: false });
    }
  };

  useEffect(() => {
    if (normalizeMailAuthMethod(config.imapAuthMethod) !== 'oauth2') {
      setImapOAuth2Status({ authenticated: false, user: '', name: '', expired: false });
      return;
    }
    void refreshOAuth2Status();
  }, [
    config.imapAuthMethod,
    config.imapUser,
    config.smtpUser,
    config.imapOAuth2ClientId,
    config.imapOAuth2TenantId,
    config.oauth2Provider,
    config.googleOAuth2ClientId,
    config.googleOAuth2ClientSecret
  ]);

  const [connectionTestResult, setConnectionTestResult] = useState({ imap: null, smtp: null });

  const handleTestImapConnection = async () => {
    const desktopImapApi = getDesktopImapApi();
    if (!desktopImapApi || typeof desktopImapApi.testConnection !== 'function') {
      showNotification('Connection test requires the desktop app runtime.', 'error');
      return;
    }
    const imapConfig = getImapActionConfig();
    if (!imapConfig.host || !imapConfig.user) {
      showNotification('Set IMAP host and username first.', 'error');
      return;
    }
    try {
      setLoading(true);
      setConnectionTestResult((prev) => ({ ...prev, imap: null }));
      const result = await desktopImapApi.testConnection({
        ...imapConfig,
        password: imapConfig.authMethod === 'oauth2' ? '' : imapConfig.password
      });
      setConnectionTestResult((prev) => ({
        ...prev,
        imap: {
          ...result,
          message: `IMAP OK: ${result.totalMessages ?? '?'} messages, ${result.unseenMessages ?? '?'} unseen in ${result.folder}.`
        }
      }));
      showNotification(`IMAP connected — ${result.totalMessages ?? '?'} messages, ${result.unseenMessages ?? '?'} unseen in ${result.folder}.`);
    } catch (error) {
      setConnectionTestResult((prev) => ({
        ...prev,
        imap: {
          ok: false,
          error: error?.message || 'IMAP test failed.',
          message: error?.message || 'IMAP test failed.'
        }
      }));
      showNotification(error?.message || 'IMAP connection test failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTestSmtpConnection = async () => {
    const smtpApi = window.salesDirectorDesktop?.smtp;
    if (!smtpApi || typeof smtpApi.testConnection !== 'function') {
      showNotification('SMTP test requires the desktop app runtime.', 'error');
      return;
    }
    const smtpConfig = getSmtpSendConfig();
    if (!smtpConfig.smtpHost || !smtpConfig.smtpUser) {
      showNotification('Set SMTP host and username first.', 'error');
      return;
    }
    try {
      setLoading(true);
      setConnectionTestResult((prev) => ({ ...prev, smtp: null }));
      const result = await smtpApi.testConnection(smtpConfig);
      setConnectionTestResult((prev) => ({
        ...prev,
        smtp: {
          ...result,
          message: 'SMTP OK: connection verified successfully.'
        }
      }));
      showNotification('SMTP connection verified successfully.');
    } catch (error) {
      setConnectionTestResult((prev) => ({
        ...prev,
        smtp: {
          ok: false,
          error: error?.message || 'SMTP test failed.',
          message: error?.message || 'SMTP test failed.'
        }
      }));
      showNotification(error?.message || 'SMTP connection test failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const shouldSyncImapFlags = (email) => {
    return (email?.source === 'imap' || email?.source === 'graph') && String(config.imapSyncFlagChanges) === 'true';
  };

  const syncImapMessageState = async (email, action, value) => {
    // Graph API path
    if (email?.source === 'graph' && email?.graphId) {
      const graphApi = window.salesDirectorDesktop?.graph;
      if (!graphApi || typeof graphApi.updateMessageState !== 'function') {
        throw new Error('Graph message sync requires the desktop app runtime.');
      }
      return graphApi.updateMessageState({
        oauth2ClientId: config.imapOAuth2ClientId,
        oauth2TenantId: config.imapOAuth2TenantId,
        user: (config.imapUser || config.smtpUser || '').trim(),
        graphId: email.graphId,
        archiveFolder: config.imapArchiveFolder || 'Archive',
        action,
        value
      });
    }

    // IMAP path
    const desktopImapApi = getDesktopImapApi();
    if (!desktopImapApi || typeof desktopImapApi.updateMessageState !== 'function') {
      throw new Error('Mailbox action sync requires the desktop app runtime.');
    }

    const uid = Number(email?.uid || email?.sourceId || 0);
    if (!Number.isInteger(uid) || uid <= 0) {
      throw new Error('Selected email cannot be synced to IMAP because UID is missing.');
    }

    const imapConfig = getImapActionConfig();
    const isOAuth2 = imapConfig.authMethod === 'oauth2';
    if (!imapConfig.host || !imapConfig.port || !imapConfig.user) {
      throw new Error('Set IMAP host, port, and username before syncing mailbox actions.');
    }
    if (!isOAuth2 && !imapConfig.password) {
      throw new Error('Set IMAP password or switch to OAuth2 authentication before syncing mailbox actions.');
    }

    return desktopImapApi.updateMessageState({
      ...imapConfig,
      password: isOAuth2 ? '' : imapConfig.password,
      action,
      value,
      uid,
      currentFolder: email.folder || imapConfig.folder
    });
  };

  const toggleInboxRead = async (emailId) => {
    const target = inboxEmails.find((email) => email.id === emailId);
    if (!target) return;

    const nextRead = !target.isRead;
    if (shouldSyncImapFlags(target)) {
      try {
        await syncImapMessageState(target, 'setRead', nextRead);
      } catch (error) {
        showNotification(error.message || 'Failed to sync read state to mailbox.', 'error');
        return;
      }
    }

    setInboxEmails(prev => prev.map(e => e.id === emailId ? { ...e, isRead: nextRead } : e));
  };

  const toggleInboxArchived = async (emailId) => {
    const target = inboxEmails.find((email) => email.id === emailId);
    if (!target) return;

    const nextArchived = !target.isArchived;
    let resultingFolder = target.folder;
    if (shouldSyncImapFlags(target)) {
      try {
        const syncResult = await syncImapMessageState(target, 'setArchived', nextArchived);
        if (syncResult?.folder) {
          resultingFolder = syncResult.folder;
        }
      } catch (error) {
        showNotification(error.message || 'Failed to sync archive state to mailbox.', 'error');
        return;
      }
    }

    setInboxEmails(prev => prev.map(e => e.id === emailId ? { ...e, isArchived: nextArchived, folder: resultingFolder || e.folder } : e));
  };

  const toggleInboxNeedsResponse = async (emailId) => {
    const target = inboxEmails.find((email) => email.id === emailId);
    if (!target) return;

    const nextNeedsResponse = !target.needsResponse;
    if (shouldSyncImapFlags(target)) {
      try {
        await syncImapMessageState(target, 'setFlagged', nextNeedsResponse);
      } catch (error) {
        showNotification(error.message || 'Failed to sync flag state to mailbox.', 'error');
        return;
      }
    }

    setInboxEmails(prev => prev.map(e => e.id === emailId ? { ...e, needsResponse: nextNeedsResponse } : e));
  };

  const setInboxEmailInsight = (emailId, update) => {
    setInboxEmails(prev =>
      prev.map(e => (e.id === emailId ? { ...e, ...update } : e))
    );
  };

  const analyzeInboxEmailInsight = async (email, options = {}) => {
    if (!email) {
      throw new Error('No inbox email selected for analysis.');
    }

    const useHeuristicFallback = IS_LOCAL_DEV_MODE && !isAiProviderReady();
    if (useHeuristicFallback) {
      return buildHeuristicInboxInsight(email);
    }

    const prompt = `You are an elite Virtual Sales Director who understands marketing, advertising, sales, and buyer psychology.\nAnalyze this inbound email and identify the prospect's likely mindset, buying trigger, and the best follow-up approach.\nReturn exactly in this format: Score: [number] || Summary: [one sentence sales insight]\nEmail:\nFrom: ${email.fromName}\nCompany: ${email.company}\nSubject: ${email.subject}\nBody:\n${email.body}\nCRITICAL: NO EMOJIS. RETURN ONLY ONE LINE WITH THE FORMAT ABOVE.`;
    const result = await callGeminiAPI(prompt, options);
    const parsed = parseInboxScoreSummary(result);

    if (parsed) {
      return parsed;
    }

    return buildHeuristicInboxInsight(email);
  };

  const addFollowUpTaskFromInboxEmail = (email) => {
    if (!email) return null;

    const existingTask = normalizedTasks.find((task) => task.sourceInboxId === email.id && task.status !== 'completed');
    if (existingTask) {
      showNotification('A follow-up task already exists for this inbox email.', 'success');
      return existingTask;
    }

    const relationshipState = buildOutreachRelationshipState({
      email: email.fromEmail,
      name: email.fromName,
      company: email.company,
      inboxEmail: email
    });
    const suggestedPriority = Math.max(65, Math.min(Number(email.aiScore || 70), 95));
    const baseTask = createFollowUpTaskFromInboxEmail(email, {
      priority: suggestedPriority,
      offsetDays: Number(email.aiScore || 0) >= 90 ? 1 : Number(email.aiScore || 0) >= 75 ? 2 : 3
    });
    const nextTask = appendTaskLocally({
      ...baseTask,
      dueDate: relationshipState.matchedContact?.nextFollowUpAt || baseTask.dueDate,
      scheduledDate: relationshipState.matchedContact?.nextFollowUpAt || baseTask.dueDate,
      contact: relationshipState.matchedContact?.name || baseTask.contact,
      contactEmail: relationshipState.matchedContact?.email || baseTask.contactEmail,
      company: relationshipState.matchedContact?.company || baseTask.company,
      owner: relationshipState.matchedContact?.owner || config.senderName || '',
      rationale: email.aiSummary || baseTask.rationale,
      notes: joinContextBlocks(baseTask.notes, relationshipState.context)
    });
    showNotification('Follow-up task added from Smart Inbox.', 'success');
    return nextTask;
  };

  const openOrCreateContactFromInboxEmail = async (email) => {
    if (!email) return;

    const relationshipState = buildOutreachRelationshipState({
      email: email.fromEmail,
      name: email.fromName,
      company: email.company,
      inboxEmail: email
    });

    if (relationshipState.matchedContact) {
      openDossier(relationshipState.matchedContact);
      setActiveTab('contacts');
      return;
    }

    openAddContact({
      email: normalizeEmail(email.fromEmail || ''),
      id: normalizeEmail(email.fromEmail || ''),
      name: email.fromName || '',
      company: email.company || formatCompanyFromEmail(email.fromEmail || ''),
      source: 'Inbox',
      stage: 'Contact',
      priorityScore: Math.max(Number(email.aiScore || 55), 55),
      aiSummary: email.aiSummary || '',
      lastContactedAt: formatDateKey(email.dateRaw || email.date),
      notes: email.subject ? `Latest inbox subject: ${email.subject}` : ''
    });
    setActiveTab('contacts');
    showNotification('Review the CRM draft, then save the contact.', 'success');
  };

  const createTasksFromHottestInboxEmails = () => {
    if (urgentInboxCandidates.length === 0) {
      showNotification('No scored urgent inbox emails are ready for task creation yet.', 'error');
      return;
    }

    const existingSourceInboxIds = new Set(tasks.map((task) => task.sourceInboxId).filter(Boolean));
    const newTasks = urgentInboxCandidates
      .filter((email) => !existingSourceInboxIds.has(email.id))
      .map((email) => createFollowUpTaskFromInboxEmail(email, {
        priority: Math.max(70, Math.min(Number(email.aiScore || 70), 100)),
        offsetDays: Number(email.aiScore || 0) >= 90 ? 1 : 3
      }));

    if (newTasks.length === 0) {
      showNotification('Follow-up tasks already exist for the current hottest inbox leads.', 'success');
      return;
    }

    setTasks(prev => [...newTasks, ...prev]);
    showNotification(`Created ${newTasks.length} follow-up task${newTasks.length === 1 ? '' : 's'} from the hottest inbox leads.`);
  };

  const openTopUrgentInboxReplies = () => {
    if (urgentInboxCandidates.length === 0) {
      showNotification('No urgent scored inbox emails are ready for Outreach yet.', 'error');
      return;
    }

    setUrgentInboxQueueIds(urgentInboxCandidates.map((email) => email.id));
    selectInboxEmailForOutreach(urgentInboxCandidates[0], { quiet: true });
    showNotification(`Loaded ${urgentInboxCandidates.length} urgent inbox repl${urgentInboxCandidates.length === 1 ? 'y' : 'ies'} into Outreach.`);
  };

  const openNextUrgentInboxReply = () => {
    if (urgentInboxQueueIds.length === 0) {
      showNotification('No urgent reply queue is active right now.', 'error');
      return;
    }

    const currentIndex = selectedInboxEmail ? urgentInboxQueueIds.indexOf(selectedInboxEmail.id) : -1;
    const nextId = urgentInboxQueueIds.slice(currentIndex + 1).find((id) => inboxEmails.some((email) => email.id === id && !email.isArchived && email.needsResponse !== false));

    if (!nextId) {
      setUrgentInboxQueueIds([]);
      showNotification('Urgent reply queue complete.', 'success');
      return;
    }

    const nextEmail = inboxEmails.find((email) => email.id === nextId);
    if (!nextEmail) {
      setUrgentInboxQueueIds([]);
      showNotification('Urgent reply queue could not find the next email.', 'error');
      return;
    }

    selectInboxEmailForOutreach(nextEmail, { quiet: true });
    const nextPosition = urgentInboxQueueIds.indexOf(nextId) + 1;
    showNotification(`Loaded urgent reply ${nextPosition} of ${urgentInboxQueueIds.length}.`);
  };

  const markLowPriorityInboxHandled = async () => {
    if (lowPriorityInboxCandidates.length === 0) {
      showNotification('No low-priority inbox emails are ready to clear.', 'success');
      return;
    }

    setLoading(true);
    try {
      let handledCount = 0;
      let failedCount = 0;

      for (const email of lowPriorityInboxCandidates) {
        try {
          await markInboxEmailHandled(email, { updateSelection: false });
          handledCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      if (handledCount === 0) {
        throw new Error('No low-priority inbox emails could be marked handled.');
      }

      showNotification(
        failedCount > 0
          ? `Marked ${handledCount} low-priority email${handledCount === 1 ? '' : 's'} handled. ${failedCount} email${failedCount === 1 ? '' : 's'} could not be updated.`
          : `Marked ${handledCount} low-priority email${handledCount === 1 ? '' : 's'} handled.`
      );
    } catch (error) {
      showNotification(error.message || 'Failed to clear low-priority inbox emails.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const markInboxEmailHandled = async (email, options = {}) => {
    if (!email) return null;

    const { archiveOriginal = false, updateSelection = true, refreshTimeline = true } = options;
    let resultingFolder = email.folder;

    if (shouldSyncImapFlags(email)) {
      if (!email.isRead) {
        await syncImapMessageState(email, 'setRead', true);
      }

      if (email.needsResponse) {
        await syncImapMessageState(email, 'setFlagged', false);
      }

      if (archiveOriginal && !email.isArchived) {
        const syncResult = await syncImapMessageState(email, 'setArchived', true);
        if (syncResult?.folder) {
          resultingFolder = syncResult.folder;
        }
      }
    }

    const updatedEmail = buildHandledInboxEmailUpdate(email, {
      archiveOriginal,
      resultingFolder
    });

    setInboxEmails(prev => prev.map((item) => (item.id === email.id ? updatedEmail : item)));
    if (updateSelection) {
      setSelectedInboxEmail(updatedEmail);
    }

    if (updatedEmail.fromEmail && isValidEmail(updatedEmail.fromEmail)) {
      const nextMessages = mergeThreadMessages(
        threads[normalizeEmail(updatedEmail.fromEmail)]?.messages || [],
        [buildThreadMessageFromInboxEmail(updatedEmail)]
      );

      try {
        await persistThreadMessages(updatedEmail.fromEmail, nextMessages);
        const savedContact = await ensureContactFromActivity({
          email: updatedEmail.fromEmail,
          name: updatedEmail.fromName,
          company: updatedEmail.company,
          source: 'Inbox',
          stage: 'Contact',
          priorityScore: updatedEmail.aiScore || undefined,
          aiSummary: updatedEmail.aiSummary || undefined,
          lastContactedAt: formatDateKey(updatedEmail.dateRaw || updatedEmail.date)
        });

        if (refreshTimeline) {
          void refreshContactTimelineSummary(savedContact || updatedEmail, {
            messages: nextMessages,
            preferHeuristic: !updateSelection
          });
        }
      } catch (error) {
        console.error('Failed to sync handled inbox email into CRM timeline:', error);
      }
    }

    return updatedEmail;
  };

  const prepareComposerFromInboxEmail = (email) => {
    if (!email) return;
    if (!canReplyToInboxEmail(email)) {
      showNotification('This email does not include a valid sender address to reply to.', 'error');
      return;
    }
    const relationshipState = buildOutreachRelationshipState({
      email: email.fromEmail,
      name: email.fromName,
      company: email.company,
      inboxEmail: email
    });
    setComposerState(buildComposerStateFromInboxEmail({
      email,
      defaultTone: config.defaultTone,
      defaultLength: config.defaultLength,
      aiContext: joinContextBlocks(
        relationshipState.context,
        `Use the email below to craft a high-conversion sales reply. Focus on the prospect's intent, match their tone, and use marketing and psychological triggers to make the response feel urgent and relevant.`
      )
    }));
    setSelectedInboxEmail(email);
    setActiveTab('outreach');
  };

  const runAnalyzeInboxEmail = async (email) => {
    if (!email) return;
    try {
      const parsed = await analyzeInboxEmailInsight(email);
      setInboxEmailInsight(email.id, { aiScore: parsed.score, aiSummary: parsed.summary });
      showNotification('AI inbox insight added.');
    } catch (error) {
      showNotification(error.message || 'Failed to analyze inbox email.', 'error');
    }
  };

  const handleAnalyzeInboxEmail = (email) => {
    if (!email) return;
    const label = email.fromName || email.fromEmail
      ? `Analyze inbox email from ${email.fromName || email.fromEmail}`
      : 'Analyze inbox email';
    void enqueueAiOperation(label, () => runAnalyzeInboxEmail(email), { notifyOnQueue: true }).catch((error) => {
      if (error?.message !== 'AI queue cleared.') {
        console.error('Inbox insight queue failed:', error);
      }
    });
  };

  const normalizeSyncedInboxEmails = (emails = [], source = 'manual') => {
    return (Array.isArray(emails) ? emails : []).map((email, index) => {
      const normalizedDate = normalizeInboxDate(email.dateRaw || email.date);
      const fromEmail = normalizeEmail(email.fromEmail || '');
      const fromName = String(email.fromName || fromEmail || 'Unknown Sender').trim();

      return {
        id: email.id || `${source}-${Date.now()}-${index}`,
        source,
        sourceId: String(email.sourceId || email.uid || email.id || `${index}`),
        uid: Number(email.uid || email.sourceId || 0) || undefined,
        folder: String(email.folder || (source === 'imap' ? (config.imapFolder || 'INBOX') : '')).trim() || undefined,
        messageId: String(email.messageId || ''),
        fromName,
        fromEmail,
        company: String(email.company || formatCompanyFromEmail(fromEmail) || 'Unknown').trim(),
        subject: String(email.subject || 'No subject').trim(),
        body: String(email.body || 'No preview available.').trim(),
        dateRaw: normalizedDate.raw,
        date: normalizedDate.label,
        isRead: Boolean(email.isRead),
        needsResponse: typeof email.needsResponse === 'boolean' ? email.needsResponse : !Boolean(email.isRead),
        isArchived: Boolean(email.isArchived),
        aiScore: null,
        aiSummary: ''
      };
    });
  };

  const handleImapInboxSync = async (options = {}) => {
    const { background = false, silent = false } = options;

    if (imapSyncInFlightRef.current) {
      if (!silent) {
        showNotification('Mailbox sync is already running.', 'error');
      }
      return;
    }

    const provider = normalizeOAuthProvider(config.oauth2Provider);
    const useGraph =
      String(config.useGraphApi) === 'true' &&
      provider === 'microsoft';
    const imapUser = (config.imapUser || config.smtpUser || '').trim();
    const isOAuth2 = normalizeMailAuthMethod(config.imapAuthMethod) === 'oauth2';
    const isGoogle = provider === 'google';
    const oauthClientId = isGoogle ? (config.googleOAuth2ClientId || '').trim() : (config.imapOAuth2ClientId || '').trim();

    // --- Graph API path ---
    if (useGraph) {
      const graphApi = window.salesDirectorDesktop?.graph;
      if (!graphApi || typeof graphApi.syncInbox !== 'function') {
        if (!silent) showNotification('Graph API sync requires the desktop app runtime.', 'error');
        return;
      }
      if (!oauthClientId || !imapUser) {
        if (!silent) showNotification('Set Client ID and user email for Graph API sync.', 'error');
        return;
      }

      imapSyncInFlightRef.current = true;
      setInboxSyncBusy((prev) => ({ ...prev, imap: true }));
      if (!background) setLoading(true);
      try {
        const result = await graphApi.syncInbox({
          oauth2ClientId: oauthClientId,
          oauth2TenantId: config.imapOAuth2TenantId || '',
          user: imapUser,
          lookbackDays: Number(config.imapLookbackDays || 14),
          limit: Number(config.imapSyncLimit || 50),
          unreadOnly: String(config.imapUnreadOnly) === 'true'
        });

        const syncedEmails = normalizeSyncedInboxEmails(result?.emails || [], 'graph');
        setInboxEmails((prev) => mergeInboxEmails(prev, syncedEmails));
        setInboxSyncStatus((prev) => ({
          ...prev,
          imap: { lastRunAt: new Date().toISOString(), fetchedCount: syncedEmails.length, error: '' }
        }));
        if (!silent) {
          showNotification(syncedEmails.length > 0
            ? `Graph sync complete. Imported ${syncedEmails.length} email${syncedEmails.length === 1 ? '' : 's'}.`
            : 'Graph sync complete. No recent emails found.');
        }
      } catch (error) {
        const message = error?.message || 'Graph API sync failed.';
        setInboxSyncStatus((prev) => ({ ...prev, imap: { lastRunAt: new Date().toISOString(), fetchedCount: 0, error: message } }));
        if (!silent) showNotification(message, 'error');
      } finally {
        imapSyncInFlightRef.current = false;
        setInboxSyncBusy((prev) => ({ ...prev, imap: false }));
        if (!background) setLoading(false);
      }
      return;
    }

    // --- IMAP path ---
    const desktopImapApi = getDesktopImapApi();
    if (!desktopImapApi) {
      if (!silent) {
        showNotification('Mailbox sync requires the desktop app runtime.', 'error');
      }
      return;
    }

    const imapPassword = String(config.imapPass || config.smtpPass || '');

    if (!config.imapHost || !config.imapPort || !imapUser) {
      if (!silent) {
        showNotification('Set IMAP host, port, and username before syncing mailbox.', 'error');
      }
      return;
    }

    if (!isOAuth2 && !imapPassword) {
      if (!silent) {
        showNotification('Set IMAP password or switch to OAuth2 authentication.', 'error');
      }
      return;
    }

    if (isOAuth2 && !oauthClientId) {
      if (!silent) {
        showNotification('Set OAuth2 Client ID for authentication.', 'error');
      }
      return;
    }

    imapSyncInFlightRef.current = true;
    setInboxSyncBusy((prev) => ({ ...prev, imap: true }));
    if (!background) {
      setLoading(true);
    }
    try {
      const result = await desktopImapApi.syncInbox({
        host: config.imapHost,
        port: Number(config.imapPort),
        secure: true,
        user: imapUser,
        password: isOAuth2 ? '' : imapPassword,
        authMethod: normalizeMailAuthMethod(config.imapAuthMethod),
        oauth2Provider: provider,
        oauth2ClientId: oauthClientId,
        oauth2TenantId: config.imapOAuth2TenantId || '',
        oauth2ClientSecret: isGoogle ? (config.googleOAuth2ClientSecret || '') : '',
        folder: config.imapFolder || 'INBOX',
        lookbackDays: Number(config.imapLookbackDays || 14),
        limit: Number(config.imapSyncLimit || 50),
        unreadOnly: String(config.imapUnreadOnly) === 'true'
      });

      const syncedEmails = normalizeSyncedInboxEmails(result?.emails || [], 'imap');
      setInboxEmails((prev) => mergeInboxEmails(prev, syncedEmails));
      setInboxSyncStatus((prev) => ({
        ...prev,
        imap: {
          lastRunAt: new Date().toISOString(),
          fetchedCount: syncedEmails.length,
          error: ''
        }
      }));

      if (!silent) {
        showNotification(
          syncedEmails.length > 0
            ? `Mailbox sync complete. Imported ${syncedEmails.length} email${syncedEmails.length === 1 ? '' : 's'}.`
            : 'Mailbox sync complete. No recent emails found in the selected window.'
        );
      }
    } catch (error) {
      const message = error?.message || 'Mailbox sync failed.';
      setInboxSyncStatus((prev) => ({
        ...prev,
        imap: {
          lastRunAt: new Date().toISOString(),
          fetchedCount: 0,
          error: message
        }
      }));
      if (!silent) {
        showNotification(message, 'error');
      }
    } finally {
      imapSyncInFlightRef.current = false;
      setInboxSyncBusy((prev) => ({ ...prev, imap: false }));
      if (!background) {
        setLoading(false);
      }
    }
  };

  const handleHubSpotInboxSync = async () => {
    if (!config.hubspotToken && !getApiBaseUrl()) {
      showNotification('Configure HubSpot token or proxy before inbox sync.', 'error');
      return;
    }

    setLoading(true);
    setInboxSyncBusy((prev) => ({ ...prev, hubspot: true }));
    try {
      const properties = [
        'hs_timestamp',
        'hs_email_direction',
        'hs_email_subject',
        'hs_email_text',
        'hs_email_from_email',
        'hs_email_from_firstname',
        'hs_email_from_lastname'
      ].join(',');

      const data = await callHubSpotAPI({
        resource: 'emails',
        method: 'GET',
        query: `limit=50&properties=${encodeURIComponent(properties)}`
      });

      const mapped = (Array.isArray(data?.results) ? data.results : []).map((item) => {
        const props = item?.properties || {};
        const direction = String(props.hs_email_direction || '').toUpperCase();
        const fromEmail = normalizeEmail(props.hs_email_from_email || '');
        const fromName = `${props.hs_email_from_firstname || ''} ${props.hs_email_from_lastname || ''}`.trim();
        const normalizedDate = normalizeInboxDate(props.hs_timestamp);
        const isLikelyOutbound = direction.includes('OUT') || direction.includes('SENT');

        return {
          id: `hubspot-${item.id}`,
          source: 'hubspot',
          sourceId: String(item.id || ''),
          messageId: '',
          fromName: fromName || fromEmail || 'HubSpot Contact',
          fromEmail,
          company: formatCompanyFromEmail(fromEmail),
          subject: props.hs_email_subject || 'HubSpot timeline email',
          body: props.hs_email_text || 'No email body available from HubSpot.',
          dateRaw: normalizedDate.raw,
          date: normalizedDate.label,
          isRead: isLikelyOutbound,
          needsResponse: !isLikelyOutbound,
          isArchived: false,
          aiScore: null,
          aiSummary: ''
        };
      });

      const syncedEmails = normalizeSyncedInboxEmails(mapped, 'hubspot');
      setInboxEmails((prev) => mergeInboxEmails(prev, syncedEmails));
      setInboxSyncStatus((prev) => ({
        ...prev,
        hubspot: {
          lastRunAt: new Date().toISOString(),
          fetchedCount: syncedEmails.length,
          error: ''
        }
      }));

      showNotification(
        syncedEmails.length > 0
          ? `HubSpot inbox sync complete. Imported ${syncedEmails.length} email${syncedEmails.length === 1 ? '' : 's'}.`
          : 'HubSpot inbox sync complete. No email records returned.'
      );
    } catch (error) {
      const message = error?.message || 'HubSpot inbox sync failed.';
      setInboxSyncStatus((prev) => ({
        ...prev,
        hubspot: {
          lastRunAt: new Date().toISOString(),
          fetchedCount: 0,
          error: message
        }
      }));
      showNotification(message, 'error');
    } finally {
      setInboxSyncBusy((prev) => ({ ...prev, hubspot: false }));
      setLoading(false);
    }
  };

  useEffect(() => {
    if (String(config.imapAutoSyncEnabled) !== 'true') {
      return undefined;
    }

    const intervalMinutes = Number(config.imapAutoSyncMinutes || 10);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 240) {
      return undefined;
    }

    let stopped = false;
    const runAutoSync = async () => {
      if (stopped) return;
      await handleImapInboxSync({ background: true, silent: true });
    };

    const shouldRunStartupSync =
      String(config.imapSyncOnStartup) === 'true' &&
      !imapStartupSyncTriggeredRef.current;

    let initialDelay;
    if (shouldRunStartupSync) {
      imapStartupSyncTriggeredRef.current = true;
      initialDelay = setTimeout(runAutoSync, 2500);
    }

    const timer = setInterval(runAutoSync, intervalMinutes * 60 * 1000);

    return () => {
      stopped = true;
      if (initialDelay) {
        clearTimeout(initialDelay);
      }
      clearInterval(timer);
    };
  }, [
    config.imapAutoSyncEnabled,
    config.imapSyncOnStartup,
    config.imapAutoSyncMinutes,
    config.imapHost,
    config.imapPort,
    config.imapUser,
    config.smtpUser,
    config.imapPass,
    config.smtpPass,
    config.imapFolder,
    config.imapLookbackDays,
    config.imapSyncLimit,
    config.imapUnreadOnly,
    config.imapAuthMethod,
    config.imapOAuth2ClientId,
    config.imapOAuth2TenantId,
    config.oauth2Provider,
    config.googleOAuth2ClientId,
    config.googleOAuth2ClientSecret,
    config.useGraphApi
  ]);

  // --- Call Logging ---
  const logCallActivity = async (contact, noteText = '') => {
    const callLog = {
      date: new Date().toISOString(),
      subject: `Phone call with ${contact.name}`,
      body: noteText || `Call logged at ${new Date().toLocaleString()}.`,
      direction: 'outbound',
      type: 'call'
    };
    const contactEmail = normalizeEmail(contact.email);
    const existingThread = threads[contactEmail]?.messages || [];
    const nextMessages = mergeThreadMessages(existingThread, [callLog]);

    try {
      await persistThreadMessages(contactEmail, nextMessages);
      const savedContact = await ensureContactFromActivity({
        email: contactEmail,
        name: contact.name,
        company: contact.company,
        stage: contact.stage || 'Contact',
        source: contact.source || 'Manual',
        lastContactedAt: formatDateKey(callLog.date)
      });
      void refreshContactTimelineSummary(savedContact || contact, { messages: nextMessages, preferHeuristic: false });
      showNotification(`Call with ${contact.name} logged to timeline.`);
    } catch (error) {
      console.error('Failed to log call:', error);
      showNotification('Failed to log call.', 'error');
    }
  };

  // --- Thread Message Delete ---
  const deleteThreadMessage = async (contactEmail, messageIndex) => {
    const email = normalizeEmail(contactEmail);
    const thread = threads[email];
    if (!thread) return;

    const updatedMessages = thread.messages.filter((_, idx) => idx !== messageIndex);
    try {
      await persistThreadMessages(email, updatedMessages);
      const existingContact = normalizedContacts.find((contact) => normalizeEmail(contact.email) === email);
      if (existingContact) {
        void refreshContactTimelineSummary(existingContact, { messages: updatedMessages, preferHeuristic: true });
      }
      showNotification('Message removed from thread.');
    } catch (error) {
      console.error('Failed to delete timeline message:', error);
      showNotification('Failed to remove message from thread.', 'error');
    }
  };

  // --- CRM Logic ---

  const closeContactModal = () => {
    setIsContactModalOpen(false);
    setEditingContact(null);
  };

  const openContactEditor = (contactInput = {}, options = {}) => {
    const normalizedEmail = normalizeEmail(contactInput.email || '');
    const nextContact = normalizeContactRecord({
      ...contactInput,
      email: normalizedEmail || contactInput.email || '',
      id: options.isNew ? (normalizedEmail || contactInput.id || '') : (contactInput.id || normalizedEmail || contactInput.email || ''),
      company: String(contactInput.company || '').trim() || (options.prefillCompanyFromEmail && normalizedEmail ? formatCompanyFromEmail(normalizedEmail) : '')
    });

    setEditingContact({
      ...nextContact,
      name: options.isNew ? String(contactInput.name || '') : nextContact.name,
      email: normalizedEmail || String(contactInput.email || ''),
      company: String(contactInput.company || '').trim() || nextContact.company,
      _isNew: Boolean(options.isNew)
    });
    setIsContactModalOpen(true);
  };

  const openAddContact = (seed = {}) => {
    openContactEditor(createEmptyContact(seed), { isNew: true, prefillCompanyFromEmail: true });
  };

  const openEditContact = (contact, e) => {
    e.stopPropagation();
    openContactEditor(contact, { isNew: false });
  };

  const handleContactFormChange = (e) => {
    setEditingContact(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const mergeDraftIntoExistingContact = (existingContact, draftContact) => {
    const existing = normalizeContactRecord(existingContact);
    const draft = draftContact || {};
    const normalizeStringField = (value) => String(value ?? '').trim();
    const pickStringField = (draftValue, existingValue) => normalizeStringField(draftValue) || existingValue;
    const pickNumberField = (draftValue, existingValue, mode = 'replace') => {
      if (draftValue === '' || draftValue == null) return existingValue;
      const parsed = Number(draftValue);
      if (!Number.isFinite(parsed)) return existingValue;
      return mode === 'max' ? Math.max(parsed, Number(existingValue) || 0) : parsed;
    };
    const getLeadTemperatureRank = (value = 'Cold') => {
      const normalizedValue = normalizeStringField(value) || 'Cold';
      const rank = CONTACT_TEMPERATURE_OPTIONS.indexOf(normalizedValue);
      return rank >= 0 ? rank : 0;
    };
    const normalizedEmail = normalizeEmail(draft.email || existing.email || '');
    const draftLeadTemperature = normalizeStringField(draft.leadTemperature) || existing.leadTemperature;

    return {
      ...existing,
      id: normalizedEmail || existing.id,
      email: normalizedEmail || existing.email,
      name: pickStringField(draft.name, existing.name),
      company: pickStringField(draft.company, existing.company),
      jobTitle: pickStringField(draft.jobTitle, existing.jobTitle),
      phone: pickStringField(draft.phone, existing.phone),
      website: pickStringField(draft.website, existing.website),
      owner: pickStringField(draft.owner, existing.owner),
      source: pickStringField(draft.source, existing.source),
      linkedin: pickStringField(draft.linkedin, existing.linkedin),
      nextStep: pickStringField(draft.nextStep, existing.nextStep),
      aiSummary: pickStringField(draft.aiSummary, existing.aiSummary),
      painPoints: pickStringField(draft.painPoints, existing.painPoints),
      notes: pickStringField(draft.notes, existing.notes),
      nextFollowUpAt: pickStringField(draft.nextFollowUpAt, existing.nextFollowUpAt),
      lastContactedAt: pickStringField(draft.lastContactedAt, existing.lastContactedAt),
      estimatedValue: pickNumberField(draft.estimatedValue, existing.estimatedValue),
      priorityScore: pickNumberField(draft.priorityScore, existing.priorityScore, 'max'),
      leadTemperature: getLeadTemperatureRank(draftLeadTemperature) > getLeadTemperatureRank(existing.leadTemperature)
        ? draftLeadTemperature
        : existing.leadTemperature,
      stage: existing.stage,
      _isNew: false
    };
  };

  const applyEditingContactGuidance = (mode = 'all') => {
    if (!editingContactInsights?.actionPlan) return;

    const { actionPlan, normalizedEmail } = editingContactInsights;
    setEditingContact((prev) => ({
      ...prev,
      company: mode === 'all' && !String(prev.company || '').trim() && normalizedEmail
        ? formatCompanyFromEmail(normalizedEmail)
        : prev.company,
      priorityScore: mode === 'all' ? actionPlan.suggestedPriorityScore : prev.priorityScore,
      leadTemperature: mode === 'all' ? actionPlan.suggestedLeadTemperature : prev.leadTemperature,
      nextFollowUpAt: mode === 'all' || mode === 'follow-up' ? actionPlan.suggestedNextFollowUpAt : prev.nextFollowUpAt,
      nextStep: mode === 'all' || mode === 'next-step' ? actionPlan.suggestedNextStep : prev.nextStep
    }));
  };

  const openExistingDuplicateContact = () => {
    if (!editingContactInsights?.duplicateContact) return;

    openContactEditor(
      mergeDraftIntoExistingContact(editingContactInsights.duplicateContact, {
        ...editingContact,
        email: editingContactInsights.normalizedEmail || editingContact.email || editingContactInsights.duplicateContact.email
      }),
      { isNew: false }
    );
  };

  const saveContact = async () => {
    const normalizedEmail = normalizeEmail(editingContact?.email || '');

    if (!user || !normalizedEmail) {
      showNotification("Email is required to save a contact.", "error");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      showNotification("Please provide a valid email address.", "error");
      return;
    }

    setLoading(true);
    try {
      const existingContact = normalizedContacts.find((contact) => normalizeEmail(contact.email) === normalizedEmail) || null;

      if (editingContact._isNew && existingContact) {
        setEditingContact({
          ...normalizeContactRecord(mergeDraftIntoExistingContact(existingContact, {
            ...editingContact,
            email: normalizedEmail,
            id: normalizedEmail
          })),
          _isNew: false
        });
        showNotification('A contact with this email already exists. Review and save updates instead.', 'success');
        return;
      }

      const actionPlan = buildContactActionPlan({
        ...editingContact,
        email: normalizedEmail,
        company: String(editingContact.company || '').trim() || formatCompanyFromEmail(normalizedEmail)
      }, contactAttentionMap.get(normalizedEmail) || null, new Date());
      const currentPriorityScore = Number(editingContact.priorityScore || 0);
      const currentLeadTemperature = String(editingContact.leadTemperature || '').trim() || 'Cold';

      await saveContactRecord({
        ...editingContact,
        email: normalizedEmail,
        id: normalizedEmail,
        _isNew: false,
        company: String(editingContact.company || '').trim() || formatCompanyFromEmail(normalizedEmail),
        priorityScore: editingContact._isNew && currentPriorityScore === 50 && actionPlan.suggestedPriorityScore > currentPriorityScore
          ? actionPlan.suggestedPriorityScore
          : (currentPriorityScore || actionPlan.suggestedPriorityScore),
        leadTemperature: editingContact._isNew && currentLeadTemperature === 'Cold' && actionPlan.suggestedLeadTemperature !== 'Cold'
          ? actionPlan.suggestedLeadTemperature
          : currentLeadTemperature,
        nextStep: editingContact.nextStep || actionPlan.suggestedNextStep,
        nextFollowUpAt: editingContact.nextFollowUpAt || actionPlan.suggestedNextFollowUpAt
      });

      showNotification(`Contact ${editingContact._isNew ? 'added' : 'updated'} successfully!`);
      closeContactModal();
    } catch (err) {
      console.error(err);
      showNotification("Failed to save contact.", "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteContact = async () => {
    if (!user || !contactToDelete) return;
    setLoading(true);
    try {
      const targetEmail = normalizeEmail(contactToDelete.email);
      if (IS_LOCAL_DEV_MODE || !db) {
        setContacts(prev => prev.filter(contact => normalizeEmail(contact.email) !== targetEmail));
      } else {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', targetEmail));
      }
      showNotification("Contact deleted securely.");
      setContactToDelete(null);
    } catch (err) {
      console.error(err);
      showNotification("Failed to delete contact.", "error");
    } finally {
      setLoading(false);
    }
  };

  const openDossier = (contact) => {
    const normalizedContact = normalizeContactRecord(contact);
    const contactThreads = threads[normalizeEmail(normalizedContact.email)]?.messages || [];
    const historyString = buildHistoryStringFromMessages(contactThreads);

    setSelectedContact({ ...normalizedContact, historyString, messages: contactThreads });
  };

  // --- AI Integration Logic ---
  const callGeminiAPI = async (promptText, options = {}) => {
    const {
      abortPrevious = true,
      providerOverride = '',
      systemInstructionOverride = null
    } = options;
    const provider = normalizeAiProvider(providerOverride || getSelectedAiProvider());
    const providerRuntime = getAiProviderRuntime(provider);
    const providerLabel = providerRuntime.label;
    const proxyBaseUrl = getApiBaseUrl();
    const usingProxy = providerRuntime.usingProxy;
    const apiKey = getSelectedAiApiKey(provider);
    const providerModel = getSelectedAiModel(provider);
    const providerBaseUrl = getSelectedAiBaseUrl(provider);
    const desktopAiApi = getDesktopAiApi();
    const providerConfig = getSelectedAiProviderConfig(provider);
    const generationProfile = aiGenerationProfile;
    const maxAttempts = 2;
    const requestTimeoutMs = 90000;
    const blockMessage = getAiProviderBlockMessage(provider);

    if (blockMessage) {
      throw new Error(blockMessage);
    }

    if (abortPrevious && activeAIRequestRef.current) {
      activeAIRequestRef.current.abort();
    }
    const controller = new AbortController();
    const requestId = `ai-${Date.now()}-${++aiDesktopRequestSequenceRef.current}`;
    const abortRequest = () => {
      controller.abort();
      if (desktopAiApi && !usingProxy) {
        desktopAiApi.cancelRequest(requestId);
      }
    };
    activeAIRequestRef.current = { abort: abortRequest, requestId, provider };
    
    const systemInstruction = systemInstructionOverride || {
      parts: [{ text: "You are an elite Virtual Sales Director. You have unparalleled skills in B2B sales strategy, psychology, negotiation, and high-conversion copywriting. Your advice is cutting-edge. CRITICAL RULE: Absolutely NO emojis under any circumstances." }]
    };
    const systemText = getAiSystemInstructionText(systemInstruction);
    const proxyPayload = {
      provider,
      promptText,
      systemInstruction,
      generationProfile,
      model: providerModel || undefined,
      baseUrl: provider === 'openai_compatible' ? providerBaseUrl : undefined
    };
    const requestDirectProviderText = async (requestPromptText) => {
      if (provider === 'gemini') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${providerConfig.model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: requestPromptText }] }],
            systemInstruction,
            generationConfig: {
              temperature: generationProfile.temperature,
              topP: generationProfile.topP,
              maxOutputTokens: generationProfile.maxOutputTokens
            }
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const providerError = new Error(
            await parseProviderErrorMessage(response, `${providerLabel} request failed`)
          );
          providerError.retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
          throw providerError;
        }

        const data = await response.json();
        const text = (data?.candidates || [])
          .flatMap((candidate) => candidate?.content?.parts || [])
          .map((part) => part?.text || '')
          .join('\n')
          .trim();

        if (!text) {
          const finishReason = String(data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || '').trim();
          throw new Error(finishReason
            ? `${providerLabel} returned no usable text (${finishReason}).`
            : `${providerLabel} returned no usable text.`);
        }

        return {
          text,
          shouldContinue: hasLengthLimitedAiResponse(provider, data?.candidates?.[0]?.finishReason)
        };
      }

      if (provider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: providerModel || providerConfig.model,
            temperature: generationProfile.temperature,
            top_p: generationProfile.topP,
            max_tokens: generationProfile.maxOutputTokens,
            system: systemText || undefined,
            messages: [
              {
                role: 'user',
                content: [{ type: 'text', text: requestPromptText }]
              }
            ]
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const providerError = new Error(
            await parseProviderErrorMessage(response, `${providerLabel} request failed`)
          );
          providerError.retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
          throw providerError;
        }

        const data = await response.json();
        const text = flattenProviderText(data?.content || []).trim();
        if (!text) {
          throw new Error(`${providerLabel} returned no usable text.`);
        }

        return {
          text,
          shouldContinue: hasLengthLimitedAiResponse(provider, data?.stop_reason)
        };
      }

      const openAiCompatibleUrl = buildOpenAiCompatibleChatCompletionsUrl(
        providerBaseUrl,
        providerConfig.defaultBaseUrl || (provider === 'xai' ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1')
      );
      if (!openAiCompatibleUrl) {
        throw new Error(`${providerLabel} base URL is missing.`);
      }
      if (!providerModel) {
        throw new Error(`${providerLabel} model id is required.`);
      }

      const openAiHeaders = {
        'Content-Type': 'application/json'
      };
      if (apiKey) {
        openAiHeaders.Authorization = `Bearer ${apiKey}`;
      }
      if (provider === 'openrouter') {
        openAiHeaders['HTTP-Referer'] = AKITA_CREDITS.website;
        openAiHeaders['X-Title'] = 'SalesDirector';
      }

      const response = await fetch(openAiCompatibleUrl, {
        method: 'POST',
        headers: openAiHeaders,
        body: JSON.stringify({
          model: providerModel,
          temperature: generationProfile.temperature,
          top_p: generationProfile.topP,
          max_tokens: generationProfile.maxOutputTokens,
          messages: [
            ...(systemText ? [{ role: 'system', content: systemText }] : []),
            { role: 'user', content: requestPromptText }
          ]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const providerError = new Error(
          await parseProviderErrorMessage(response, `${providerLabel} request failed`)
        );
        providerError.retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
        throw providerError;
      }

      const data = await response.json();
      const text = flattenProviderText(data?.choices?.[0]?.message?.content).trim();
      if (!text) {
        throw new Error(`${providerLabel} returned no usable text.`);
      }

      return {
        text,
        shouldContinue: hasLengthLimitedAiResponse(provider, data?.choices?.[0]?.finish_reason)
      };
    };

    let attemptsRemaining = maxAttempts;
    let delay = 1000;

    try {
      while (attemptsRemaining > 0) {
        let didTimeout = false;
        const timeoutId = setTimeout(() => {
          didTimeout = true;
          abortRequest();
        }, requestTimeoutMs);

        try {
          if (!usingProxy && desktopAiApi) {
            const result = await desktopAiApi.generateText({
              requestId,
              provider,
              apiKey,
              model: providerModel,
              baseUrl: providerBaseUrl,
              promptText,
              systemInstruction,
              generationProfile
            });
            clearTimeout(timeoutId);

            const text = String(result?.text || '').trim();
            if (!text) {
              throw new Error(`${providerLabel} returned no usable text.`);
            }

            return text;
          }

          let text = '';

          if (usingProxy) {
            const headers = { 'Content-Type': 'application/json' };
            if (config.proxySecret) {
              headers['x-proxy-secret'] = config.proxySecret;
            }

            const response = await fetch(`${proxyBaseUrl}/api/ai`, {
              method: 'POST',
              headers,
              body: JSON.stringify(proxyPayload),
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
              const providerError = new Error(
                await parseProviderErrorMessage(response, `${providerLabel} request failed`)
              );
              providerError.retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
              throw providerError;
            }

            const data = await response.json();
            text = String(data?.text || '').trim();
          } else {
            let accumulatedText = '';
            let currentPromptText = promptText;

            for (let continuationIndex = 0; continuationIndex <= AI_CONTINUATION_MAX_REQUESTS; continuationIndex += 1) {
              const nextResult = await requestDirectProviderText(currentPromptText);
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

            clearTimeout(timeoutId);
            text = accumulatedText.trim();
          }

          if (!text) {
            const blockReason = provider === 'gemini' ? 'Check provider output or upstream block reason.' : '';
            throw new Error(blockReason
              ? `${providerLabel} returned no usable text (${blockReason}).`
              : `${providerLabel} returned no usable text.`);
          }

          return text;
        } catch (error) {
          clearTimeout(timeoutId);

          if (error?.name === 'AbortError' || (controller.signal.aborted && /abort|cancel/i.test(String(error?.message || '')))) {
            if (didTimeout) {
              throw new Error(`AI request timed out after ${Math.round(requestTimeoutMs / 1000)} seconds. Check your ${providerLabel} key, proxy, or network and try again.`);
            }
            throw new Error("AI request cancelled.");
          }

          attemptsRemaining--;
          const shouldRetry = attemptsRemaining > 0 && (Boolean(error?.retryable) || error instanceof TypeError);

          if (!shouldRetry) {
            if (!usingProxy && !desktopAiApi && error instanceof TypeError) {
              throw new Error(`${providerLabel} browser direct request failed. This is usually a browser network or cross-origin restriction. If it persists, use the desktop app or proxy mode.`);
            }
            if (error instanceof Error) {
              throw error;
            }
            throw new Error("Failed to generate AI response.");
          }

          await new Promise(res => setTimeout(res, delay));
          delay *= 2;
        }
      }
    } finally {
      if (activeAIRequestRef.current?.requestId === requestId) {
        activeAIRequestRef.current = null;
      }
    }
  };

  const runAIAction = async (actionType, options = {}) => {
    const setLoading = () => {};
    let prompt = "";

    try {
      if (actionType === 'generateTasks') {
        if (normalizedContacts.length === 0) {
          showNotification("Sync contacts first to generate tasks.", "error");
          setLoading(false); return;
        }
        const sampleContacts = normalizedContacts.slice(0, 8).map(c => `${c.name} at ${c.company}`).join(', ');
        prompt = `Review these contacts: ${sampleContacts}. Generate a smart, prioritized daily to-do list of exactly 3 sales tasks based on these prospects. 
        Format EACH line EXACTLY as follows with no extra characters, bullets, or labels:
        Contact Name || Company Name || Task Description
        CRITICAL: NO EMOJIS. ONLY RETURN THE 3 LINES.`;
        
        const result = await callGeminiAPI(prompt);
        const lines = result.split('\n').filter(l => l.includes('||'));
        if (lines.length > 0) {
          const newTasks = lines.map((l, i) => {
            const parts = l.split('||').map(p => p.trim());
            const matchedContact = normalizedContacts.find((contact) => (contact.name || '').toLowerCase() === (parts[0] || '').toLowerCase());
            return createEmptyTask({
              id: `task-${Date.now()}-${i}`,
              title: parts[2] || 'Follow up',
              type: 'follow-up',
              status: 'pending',
              priority: matchedContact?.priorityScore || 60,
              scheduledDate: selectedCalendarDate,
              dueDate: matchedContact?.nextFollowUpAt || selectedCalendarDate,
              contact: parts[0] || 'Unknown',
              contactEmail: matchedContact?.email || '',
              company: parts[1] || 'Unknown',
              owner: matchedContact?.owner || '',
              rationale: matchedContact?.aiSummary || ''
            });
          });
          setTasks(prev => sortTasksForPlanner([...newTasks, ...prev], selectedCalendarDate, planningReferenceDate));
          showNotification("Smart Action Plan generated!");
        } else {
          throw new Error("Failed to parse task format.");
        }
        setLoading(false); return;
      }

      if (actionType === 'prioritizeTasks') {
        const pendingTasks = normalizedTasks.filter(t => t.status === 'pending');
        if (pendingTasks.length === 0) {
          showNotification("No pending tasks to prioritize.", "error"); setLoading(false); return;
        }
        const taskString = pendingTasks.map(t => `ID: ${t.id} | Contact: ${t.contact} | Task: ${t.type}`).join('\n');
        const planningNowLabel = formatDateTimeInTimeZone(new Date(), planningTimeZoneValue, { dateStyle: 'full', timeStyle: 'short' });
        prompt = `Act as an elite Virtual Sales Director. Review these sales tasks and organize my schedule.
        Assign a Priority Score (1-100), a suggested time block (e.g., '09:00 AM' or '02:30 PM'), and a 1-sentence rationale for the priority.
        Respect the operator's planning window of ${config.activeHoursStart}-${config.activeHoursEnd} (${planningTimeZoneLabel}).
        Current planning date/time: ${planningNowLabel}.
        Format EACH line EXACTLY as follows with no extra characters:
        [ID] || [Score] || [Time] || [Rationale]
        
        Tasks to prioritize:
        ${taskString}
        
        CRITICAL: NO EMOJIS. ONLY RETURN THE FORMATTED LINES.`;
        
        const result = await callGeminiAPI(prompt);
        const lines = result.split('\n').filter(l => l.includes('||'));
        
        if (lines.length > 0) {
          setTasks(prev => sortTasksForPlanner(applyTaskPrioritization(lines, prev), selectedCalendarDate, planningReferenceDate));
          showNotification("Tasks successfully prioritized and scheduled!");
        } else {
          showNotification("Failed to parse AI schedule.", "error");
        }
        setLoading(false); return;
      }

      if (actionType === 'planFocusDay') {
        const selectedTasks = sortTasksForPlanner(normalizedTasks, selectedCalendarDate, planningReferenceDate)
          .filter((task) => task.status !== 'completed')
          .slice(0, 8);

        if (selectedTasks.length === 0) {
          showNotification('Add a few active tasks before planning the day.', 'error');
          setLoading(false);
          return;
        }

        const taskLines = selectedTasks.map((task) => `ID: ${task.id} | Task: ${task.title} | Priority: ${task.priority || 50} | Contact: ${task.contact || 'General'} | Current Time: ${task.time || 'Unscheduled'}`).join('\n');
        const planningNowLabel = formatDateTimeInTimeZone(new Date(), planningTimeZoneValue, { dateStyle: 'full', timeStyle: 'short' });
        prompt = `Act as a world-class small-business operating chief. Build a focused workday plan for ${selectedCalendarDateLabel}.
For each task below, choose the best start time, an estimated duration in minutes, and one short reason.
      Keep the schedule inside ${config.activeHoursStart}-${config.activeHoursEnd} (${planningTimeZoneLabel}).
      Current planning date/time: ${planningNowLabel}.
Format EACH line EXACTLY like this:
[ID] || [Start Time] || [Duration Minutes] || [Reason]

Tasks:
${taskLines}

CRITICAL: No emojis. Return only formatted lines.`;

        const result = await callGeminiAPI(prompt);
        const lines = result.split('\n').filter((line) => line.includes('||'));
        if (lines.length === 0) {
          throw new Error('Failed to parse the AI focus-day schedule.');
        }

        setTasks((prev) => applyAiFocusDayPlan(lines, prev, selectedCalendarDate));
        setTaskPlannerInsight(`[AI Focus Day Plan]\n\n${result}`);
        showNotification(`Planner updated for ${selectedCalendarDateLabel}.`);
        setLoading(false);
        return;
      }

      if (actionType === 'crmWorkspace') {
        const attentionContacts = crmOverview.attentionContacts.slice(0, 5);
        if (attentionContacts.length === 0) {
          showNotification('Add or sync contacts before asking AI to review the CRM.', 'error');
          setLoading(false);
          return;
        }

        const contactLines = attentionContacts.map((item, index) => {
          const contact = item.contact;
          return `${index + 1}. ${contact.name} at ${contact.company || 'Unknown company'} | Stage: ${contact.stage} | Priority: ${contact.priorityScore || 50} | Value: ${contact.estimatedValue || 0} | Next Step: ${contact.nextStep || 'Not set'} | Follow-up: ${contact.nextFollowUpAt || 'Not set'} | Open Tasks: ${item.openTasksCount}`;
        }).join('\n');

        prompt = `Act as an elite revenue operator for a small business. Review this CRM snapshot and return:
1. The top revenue risks.
2. The top 3 actions the owner should do next.
3. One short operating recommendation to reduce follow-up slippage.

CRM Snapshot:
Pipeline Value: ${crmOverview.pipelineValue}
Follow-ups Due: ${crmOverview.followUpsDueCount}
Stale Contacts: ${crmOverview.staleContactsCount}
Hot Contacts: ${crmOverview.hotContactsCount}
Open Pipeline: ${crmOverview.openPipelineCount}

Top Contacts:
${contactLines}

Be concise, practical, and specific. No emojis.`;

        const result = await callGeminiAPI(prompt);
        setCrmWorkspaceInsight(result);
        showNotification('AI CRM workspace review generated.');
        setLoading(false);
        return;
      }

      if (actionType === 'dailyRevenueBrief') {
        const todayKey = currentPlanningDateKey;
        const planningNowLabel = formatDateTimeInTimeZone(new Date(), planningTimeZoneValue, { dateStyle: 'full', timeStyle: 'short' });
        const outboundTodayCount = Object.values(threads).flatMap((thread) => thread?.messages || [])
          .filter((message) => message.direction === 'outbound')
          .filter((message) => {
            const sentAt = new Date(message.date);
            return !Number.isNaN(sentAt.getTime()) && formatDateKeyInTimeZone(sentAt, planningTimeZoneValue) === todayKey;
          }).length;
        const topTaskLines = sortTasksForPlanner(normalizedTasks, selectedCalendarDate, planningReferenceDate)
          .filter((task) => task.status !== 'completed')
          .slice(0, 5)
          .map((task) => `${task.title} | ${task.contact || 'Internal'} | Priority ${task.priority || 50} | Due ${task.dueDate || 'Unscheduled'}`)
          .join('\n') || 'No active tasks.';
        const urgentInboxLines = urgentInboxCandidates
          .slice(0, 4)
          .map((email) => `${email.fromName || email.fromEmail} at ${email.company || 'Unknown'} | Score ${email.aiScore ?? 'n/a'} | ${email.subject}`)
          .join('\n') || 'No urgent inbox leads.';
        const riskLines = atRiskPipelineContacts
          .slice(0, 4)
          .map(({ contact, attention }) => `${contact.name} at ${contact.company || 'Unknown'} | Stage ${contact.stage} | Value ${contact.estimatedValue || 0} | Next Step ${contact.nextStep || 'Missing'} | Open Tasks ${attention?.openTasksCount || 0}`)
          .join('\n') || 'No at-risk pipeline accounts.';

        prompt = `Act as my embedded small-business revenue operating partner. Review this live business snapshot and return:
1. TODAY'S FOCUS: One short paragraph.
2. PIPELINE RISK: The biggest risks to closing revenue this week.
3. OUTREACH WINDOW: Where immediate follow-up will matter most.
4. OWNER WATCHOUT: One habit or blind spot that will hurt execution.
5. PRIORITY MOVES: Exactly 3 numbered actions for today.

Snapshot:
Planning Time: ${planningNowLabel}
Planning Time Zone: ${planningTimeZoneLabel}
Pipeline Value: ${crmOverview.pipelineValue}
Weighted Forecast: ${pipelineOverview.weightedForecast}
Follow-Ups Due: ${crmOverview.followUpsDueCount}
Hot Contacts: ${crmOverview.hotContactsCount}
Active Tasks: ${normalizedTasks.filter((task) => task.status !== 'completed').length}
Needs Response Inbox: ${inboxEmails.filter(email => email.needsResponse && !email.isArchived).length}
Sent Today: ${outboundTodayCount}

Top Tasks:
${topTaskLines}

Urgent Inbox:
${urgentInboxLines}

At-Risk Deals:
${riskLines}

Be concise, commercial, and practical. No emojis.`;

        const result = await callGeminiAPI(prompt);
        setDashboardPartnerInsight(`[AI Revenue Brief]\n\n${result}`);
        showNotification('AI revenue brief generated.');
        setLoading(false);
        return;
      }

      if (actionType === 'organizeIdea') {
        const rawIdea = ideaCaptureInput.trim();
        if (!rawIdea) {
          showNotification('Capture a note, idea, objection, or customer signal first.', 'error');
          setLoading(false);
          return;
        }

        const crmContext = normalizedContacts
          .slice(0, 8)
          .map((contact) => `${contact.name} | ${contact.company || 'Unknown'} | ${contact.stage}`)
          .join('\n');

        prompt = `Act as an embedded small-business sales operator. Turn this raw note into immediate execution.
Return exactly these labels, one per line:
SUMMARY: ...
CRM NOTE: ...
OUTREACH ANGLE: ...
BEST CONTACT: ...
TASK 1: ...
TASK 2: ...
TASK 3: ...

Raw note:
${rawIdea}

Known CRM accounts:
${crmContext || 'No CRM accounts yet.'}

Make the tasks specific, practical, and sales-oriented. No emojis.`;

        const result = await callGeminiAPI(prompt);
        const plan = parseAiIdeaOrganizer(result);
        if (!plan.summary && !plan.crmNote && !plan.outreachAngle && plan.taskTitles.length === 0) {
          throw new Error('Failed to convert the idea into a usable plan.');
        }

        let matchedContact = findBestContactMatchFromText(rawIdea, plan.bestContact, plan.crmNote, plan.outreachAngle);
        if (matchedContact && plan.crmNote) {
          const timestampLabel = new Date().toLocaleString();
          const noteEntry = `[AI Idea ${timestampLabel}] ${plan.crmNote}`;
          const nextNotes = String(matchedContact.notes || '').includes(plan.crmNote)
            ? matchedContact.notes
            : [matchedContact.notes, noteEntry].filter(Boolean).join('\n\n');

          matchedContact = await saveContactRecord({
            ...matchedContact,
            notes: nextNotes,
            lastAiReviewedAt: new Date().toISOString()
          });
        }

        const ideaTasks = plan.taskTitles.slice(0, 3).map((taskTitle, index) => createEmptyTask({
          id: `idea-task-${Date.now()}-${index}`,
          title: taskTitle,
          type: inferTaskTypeFromTitle(taskTitle),
          status: 'pending',
          priority: matchedContact?.priorityScore || 68,
          scheduledDate: selectedCalendarDate,
          dueDate: matchedContact?.nextFollowUpAt || selectedCalendarDate,
          contact: matchedContact?.name || 'Internal Workflow',
          contactEmail: matchedContact?.email || '',
          company: matchedContact?.company || 'Growth Ops',
          owner: matchedContact?.owner || config.senderName || '',
          rationale: plan.summary || plan.crmNote || '',
          notes: plan.crmNote || '',
          source: 'ai-idea-organizer'
        }));

        if (ideaTasks.length > 0) {
          appendTaskBatchLocally(ideaTasks);
        }

        if (plan.outreachAngle || matchedContact) {
          setComposerState((prev) => ({
            ...prev,
            to: matchedContact?.email || prev.to,
            recipientName: matchedContact?.name || prev.recipientName,
            companyName: matchedContact?.company || prev.companyName,
            jobTitle: matchedContact?.jobTitle || prev.jobTitle,
            aiContext: `[AI Idea Organizer]\n\n${plan.outreachAngle || plan.crmNote || plan.summary}`
          }));
        }

        setDashboardPartnerInsight(`[AI Idea Organizer]\n\n${result}`);
        if (matchedContact) {
          setCrmWorkspaceInsight(`[AI Idea Linked To ${matchedContact.name}]\n\n${result}`);
        }
        if (ideaTasks.length > 0) {
          setTaskPlannerInsight(`[AI Idea Organizer]\n\n${result}`);
        }
        setIdeaCaptureInput('');
        showNotification(`Idea organized into ${ideaTasks.length} task${ideaTasks.length === 1 ? '' : 's'}${matchedContact ? ` and linked to ${matchedContact.name}` : ''}.`);
        setLoading(false);
        return;
      }

      if (actionType === 'rescuePipeline') {
        const rescueCandidates = atRiskPipelineContacts.slice(0, 3).map((item) => item.contact);
        if (rescueCandidates.length === 0) {
          showNotification('There are no obvious at-risk opportunity or proposal deals to rescue right now.', 'error');
          setLoading(false);
          return;
        }

        const existingTaskSignatures = new Set(normalizedTasks
          .filter((task) => task.status !== 'completed')
          .map((task) => `${normalizeEmail(task.contactEmail || '')}:${(task.title || '').toLowerCase()}`));
        const rescueTasks = [];
        const rescueNotes = [];
        let completedPlans = 0;

        for (const candidate of rescueCandidates) {
          try {
            const relatedTasks = normalizedTasks.filter((task) => normalizeEmail(task.contactEmail || '') === candidate.email);
            const threadHistory = threads[candidate.email]?.messages || [];
            const threadSummary = threadHistory.slice(-4).map((message) => `${message.direction || 'activity'} | ${message.subject || 'No subject'} | ${new Date(message.date).toLocaleDateString()}`).join('\n') || 'No recent interactions.';

            prompt = `Act as a sharp small-business deal rescue operator. This deal is active but at risk.
Return the answer using these exact labels, one per line:
SUMMARY: ...
PRIORITY: ...
VALUE: ...
NEXT STEP: ...
FOLLOW-UP DATE: ...
TASK TYPE: ...
TASK TITLE: ...
OPENER: ...
CHANNEL: ...
ROLE: ...
PAIN POINTS: ...

Contact:
Name: ${candidate.name}
Company: ${candidate.company || 'Unknown'}
Title: ${candidate.jobTitle || 'Unknown'}
Stage: ${candidate.stage}
Current Priority: ${candidate.priorityScore || 50}
Current Value: ${candidate.estimatedValue || 0}
Current Next Step: ${candidate.nextStep || 'Not set'}
Open Tasks: ${relatedTasks.length}
Thread Summary:
${threadSummary}

Focus on a realistic move that helps the owner close revenue faster. No emojis.`;

            const result = await callGeminiAPI(prompt, { abortPrevious: false });
            const plan = parseAiContactPlan(result);
            const updatedContact = await saveContactRecord({
              ...candidate,
              aiSummary: plan.summary || candidate.aiSummary,
              nextStep: plan.nextStep || candidate.nextStep,
              nextFollowUpAt: plan.followUpDate || candidate.nextFollowUpAt,
              priorityScore: plan.priority || candidate.priorityScore,
              estimatedValue: plan.estimatedValue ?? candidate.estimatedValue,
              preferredChannel: plan.channel || candidate.preferredChannel,
              buyingRole: plan.role || candidate.buyingRole,
              painPoints: plan.painPoints || candidate.painPoints,
              lastAiReviewedAt: new Date().toISOString()
            });

            void refreshContactTimelineSummary(updatedContact, { preferHeuristic: true });

            const nextTask = createTaskFromContactPlan(updatedContact, plan);
            const taskSignature = `${normalizeEmail(nextTask.contactEmail || '')}:${(nextTask.title || '').toLowerCase()}`;
            if (!existingTaskSignatures.has(taskSignature)) {
              existingTaskSignatures.add(taskSignature);
              rescueTasks.push(nextTask);
            }

            rescueNotes.push(`${candidate.name} at ${candidate.company || 'Unknown'}: ${plan.nextStep || updatedContact.nextStep || 'Define a next step.'}`);
            completedPlans += 1;
          } catch (error) {
            rescueNotes.push(`${candidate.name} at ${candidate.company || 'Unknown'}: rescue plan failed to generate.`);
          }
        }

        if (completedPlans === 0) {
          throw new Error('Failed to generate rescue plans for the current at-risk deals.');
        }

        if (rescueTasks.length > 0) {
          appendTaskBatchLocally(rescueTasks);
        }

        const rescueInsight = `[AI Rescue Queue]\n\n${rescueNotes.map((line, index) => `${index + 1}. ${line}`).join('\n')}`;
        setDashboardPartnerInsight(rescueInsight);
        setCrmWorkspaceInsight(rescueInsight);
        showNotification(`Generated rescue plans for ${completedPlans} at-risk deal${completedPlans === 1 ? '' : 's'}${rescueTasks.length ? ` and added ${rescueTasks.length} task${rescueTasks.length === 1 ? '' : 's'}` : ''}.`);
        setLoading(false);
        return;
      }

      if (actionType === 'callPrep') {
        const inputTask = options?.task ? normalizeTaskRecord(options.task) : null;
        const explicitContact = options?.contact ? normalizeContactRecord(options.contact) : null;
        const matchedContact = explicitContact
          || (inputTask ? findContactForTask(inputTask) : null)
          || selectedContact
          || upcomingMeetingQueue[0]?.contact
          || null;

        if (!matchedContact || !matchedContact.email) {
          showNotification('Pick a meeting or contact first so AI can build a prep brief.', 'error');
          setLoading(false);
          return;
        }

        const queueItem = inputTask
          ? { task: inputTask, contact: matchedContact }
          : upcomingMeetingQueue.find((item) => normalizeEmail(item.contact?.email || '') === matchedContact.email)
            || null;
        const prepTask = queueItem?.task || null;
        const prepDate = prepTask ? getTaskCalendarDate(prepTask) : (matchedContact.nextFollowUpAt || selectedCalendarDate);
        const prepTime = prepTask?.time || 'No time set';
        const relatedTasks = normalizedTasks
          .filter((task) => normalizeEmail(task.contactEmail || '') === matchedContact.email)
          .slice(0, 6);
        const threadMessages = threads[matchedContact.email]?.messages || [];
        const timelineSummary = threadMessages
          .slice(-6)
          .map((message) => `${message.type === 'call' ? 'Call' : message.direction === 'outbound' ? 'Outbound' : 'Inbound'} | ${message.subject || 'No subject'} | ${formatDateKey(message.date) || 'Unknown date'}`)
          .join('\n') || 'No recent interactions.';

        prompt = `Act as an elite sales call strategist for a small business owner. Build a practical prep brief for the next live conversation.
Return:
1. CALL GOAL: One sentence.
2. WHAT THEY CARE ABOUT: 2-3 bullets.
3. RISKS / OBJECTIONS: 2-3 bullets.
4. FIVE QUESTIONS TO ASK: 5 short numbered questions.
5. COMMERCIAL ANGLE: One short paragraph.
6. BEST NEXT CLOSE: The exact closing move to use.

Contact:
Name: ${matchedContact.name}
Company: ${matchedContact.company || 'Unknown'}
Title: ${matchedContact.jobTitle || 'Unknown'}
Stage: ${matchedContact.stage}
Value: ${matchedContact.estimatedValue || 0}
Priority: ${matchedContact.priorityScore || 50}
Pain Points: ${matchedContact.painPoints || 'Not captured'}
Current Next Step: ${matchedContact.nextStep || 'Not defined'}
Conversation Date: ${formatFriendlyDate(prepDate)}
Conversation Time: ${prepTime}
Task: ${prepTask?.title || 'Upcoming call or meeting'}

Relationship Summary:
${matchedContact.timelineSummary || matchedContact.aiSummary || 'No stored summary.'}

Recent Timeline:
${timelineSummary}

Open Work:
${relatedTasks.map((task) => `${task.title} | ${task.status} | ${task.dueDate || task.scheduledDate || 'Unscheduled'}`).join('\n') || 'No open tasks.'}

Be concise and commercial. No emojis.`;

        const result = await callGeminiAPI(prompt);
        if (prepDate) {
          setSelectedCalendarDate(prepDate);
          setActiveCalendarMonth(formatMonthKey(prepDate));
        }
        setTaskPlannerInsight(`[AI Call Prep: ${matchedContact.name}]\n\n${result}`);
        setDashboardPartnerInsight(`[AI Call Prep: ${matchedContact.name}]\n\n${result}`);
        setSelectedContact(null);
        setActiveTab('tasks');
        showNotification(`AI call prep ready for ${matchedContact.name}.`);
        setLoading(false);
        return;
      }

      if (actionType === 'proposalFollowUp') {
        const proposalContact = normalizeContactRecord(options?.contact || selectedContact || {});
        if (!proposalContact.email) {
          showNotification('Choose a proposal-stage contact first.', 'error');
          setLoading(false);
          return;
        }
        if (proposalContact.stage !== 'Proposal') {
          showNotification('Proposal follow-up is designed for proposal-stage contacts.', 'error');
          setLoading(false);
          return;
        }

        const threadMessages = threads[proposalContact.email]?.messages || [];
        const threadSummary = threadMessages
          .slice(-6)
          .map((message) => `${message.type === 'call' ? 'Call' : message.direction === 'outbound' ? 'Outbound' : 'Inbound'} | ${message.subject || 'No subject'} | ${formatDateKey(message.date) || 'Unknown date'}`)
          .join('\n') || 'No recent interactions.';

        prompt = `Act as an elite small-business sales closer. Draft a concise proposal follow-up email that moves this deal toward a decision.
Return exactly in this format:
SUBJECT: ...
FOLLOW-UP DATE: ...
BODY:
...

Contact:
Name: ${proposalContact.name}
Company: ${proposalContact.company || 'Unknown'}
Title: ${proposalContact.jobTitle || 'Unknown'}
Stage: ${proposalContact.stage}
Value: ${proposalContact.estimatedValue || 0}
Priority: ${proposalContact.priorityScore || 50}
Pain Points: ${proposalContact.painPoints || 'Not captured'}
Current Next Step: ${proposalContact.nextStep || 'Not defined'}

Relationship Summary:
${proposalContact.timelineSummary || proposalContact.aiSummary || 'No stored summary.'}

Recent Timeline:
${threadSummary}

The email should be short, commercial, and lightly urgent without sounding desperate. Ask for a concrete checkpoint or decision step. No emojis.`;

        const result = await callGeminiAPI(prompt);
        const draft = parseStructuredOutreachDraft(result);
        if (!draft.body) {
          throw new Error('Failed to parse the proposal follow-up draft.');
        }

        const followUpDate = draft.followUpDate || proposalContact.nextFollowUpAt || formatFuturePlanningDateKey(2, planningTimeZoneValue);
        let nextBody = draft.body;
        if (config.signature && !nextBody.includes(config.signature.substring(0, 10))) {
          nextBody = `${nextBody}\n\n${config.signature}`;
        }

        setComposerState({
          ...createComposerResetState({ defaultTone: config.defaultTone, defaultLength: config.defaultLength }),
          to: proposalContact.email,
          hubspotId: proposalContact.hubspotId || null,
          recipientName: proposalContact.name,
          companyName: proposalContact.company,
          jobTitle: proposalContact.jobTitle || '',
          threadHistory: buildHistoryStringFromMessages(threadMessages),
          aiContext: `[AI Proposal Follow-Up: ${proposalContact.name}]\n\n${result}`,
          subject: draft.subject || `Quick follow-up on the proposal for ${proposalContact.company || proposalContact.name}`,
          body: nextBody
        });
        setSelectedInboxEmail(null);
        setSelectedContact(null);
        setActiveTab('outreach');
        setSelectedCalendarDate(followUpDate);
        setActiveCalendarMonth(formatMonthKey(followUpDate));

        const hasActiveProposalTask = normalizedTasks.some((task) => (
          task.status !== 'completed'
          && normalizeEmail(task.contactEmail || '') === proposalContact.email
          && (/proposal|pricing|quote/i.test(task.title || '') || task.type === 'proposal')
        ));
        if (!hasActiveProposalTask) {
          appendTaskLocally(createEmptyTask({
            id: `proposal-follow-up-${Date.now()}`,
            title: `Follow up proposal with ${proposalContact.name}`,
            type: 'proposal',
            status: 'pending',
            priority: Math.max(proposalContact.priorityScore || 75, 82),
            dueDate: followUpDate,
            scheduledDate: followUpDate,
            contact: proposalContact.name,
            contactEmail: proposalContact.email,
            company: proposalContact.company,
            owner: proposalContact.owner,
            rationale: proposalContact.timelineSummary || proposalContact.aiSummary || proposalContact.nextStep || '',
            notes: 'AI-generated proposal follow-up draft is loaded in Outreach.',
            source: 'ai-proposal-follow-up'
          }));
        }

        const savedContact = await saveContactRecord({
          ...proposalContact,
          nextFollowUpAt: followUpDate,
          nextStep: 'Follow up on proposal and ask for a decision checkpoint.',
          lastAiReviewedAt: new Date().toISOString()
        });
        setCrmWorkspaceInsight(`[AI Proposal Follow-Up: ${proposalContact.name}]\n\n${result}`);
        if (selectedContact && normalizeEmail(selectedContact.email) === savedContact.email) {
          openDossier(savedContact);
        }
        showNotification(`Proposal follow-up draft loaded for ${proposalContact.name}.`);
        setLoading(false);
        return;
      }

      if (actionType === 'reactivationDraft') {
        const reactivationContact = normalizeContactRecord(options?.contact || selectedContact || {});
        if (!reactivationContact.email) {
          showNotification('Choose a CRM contact first.', 'error');
          setLoading(false);
          return;
        }
        if (reactivationContact.stage === 'Customer') {
          showNotification('Use customer check-in for active customers instead of the reactivation flow.', 'error');
          setLoading(false);
          return;
        }

        const threadMessages = threads[reactivationContact.email]?.messages || [];
        const threadSummary = threadMessages
          .slice(-6)
          .map((message) => `${message.type === 'call' ? 'Call' : message.direction === 'outbound' ? 'Outbound' : 'Inbound'} | ${message.subject || 'No subject'} | ${formatDateKey(message.date) || 'Unknown date'}`)
          .join('\n') || 'No recent interactions.';
        const inboxSignal = options?.inboxEmail ? joinContextBlocks(
          `Latest inbox subject: ${options.inboxEmail.subject || 'No subject'}`,
          options.inboxEmail.aiSummary ? `Inbox insight: ${options.inboxEmail.aiSummary}` : '',
          options.inboxEmail.body ? `Inbox body: ${options.inboxEmail.body}` : ''
        ) : 'No fresh inbox signal.';

        prompt = `Act as an elite small-business revenue operator. Draft a reactivation email for a stalled relationship.
Return exactly in this format:
SUBJECT: ...
FOLLOW-UP DATE: ...
BODY:
...

Contact:
Name: ${reactivationContact.name}
Company: ${reactivationContact.company || 'Unknown'}
Title: ${reactivationContact.jobTitle || 'Unknown'}
Stage: ${reactivationContact.stage}
Value: ${reactivationContact.estimatedValue || 0}
Priority: ${reactivationContact.priorityScore || 50}
Pain Points: ${reactivationContact.painPoints || 'Not captured'}
Current Next Step: ${reactivationContact.nextStep || 'Not defined'}

Relationship Summary:
${reactivationContact.timelineSummary || reactivationContact.aiSummary || 'No stored summary.'}

Recent Timeline:
${threadSummary}

Fresh Signal:
${inboxSignal}

Make the email respectful, fresh, and low-friction. Acknowledge the gap without guilt, introduce a new business angle, and ask for a very easy next step. No emojis.`;

        const result = await callGeminiAPI(prompt);
        const draft = parseStructuredOutreachDraft(result);
        if (!draft.body) {
          throw new Error('Failed to parse the reactivation draft.');
        }

        const followUpDate = draft.followUpDate || reactivationContact.nextFollowUpAt || formatFuturePlanningDateKey(4, planningTimeZoneValue);
        let nextBody = draft.body;
        if (config.signature && !nextBody.includes(config.signature.substring(0, 10))) {
          nextBody = `${nextBody}\n\n${config.signature}`;
        }

        setComposerState({
          ...createComposerResetState({ defaultTone: config.defaultTone, defaultLength: config.defaultLength }),
          to: reactivationContact.email,
          hubspotId: reactivationContact.hubspotId || null,
          recipientName: reactivationContact.name,
          companyName: reactivationContact.company,
          jobTitle: reactivationContact.jobTitle || '',
          threadHistory: buildHistoryStringFromMessages(threadMessages),
          aiContext: `[AI Reactivation Draft: ${reactivationContact.name}]\n\n${result}`,
          subject: draft.subject || `Quick idea to re-open the conversation with ${reactivationContact.company || reactivationContact.name}`,
          body: nextBody
        });
        setSelectedInboxEmail(options?.inboxEmail || null);
        setSelectedContact(null);
        setActiveTab('outreach');
        setSelectedCalendarDate(followUpDate);
        setActiveCalendarMonth(formatMonthKey(followUpDate));

        const hasActiveReactivationTask = normalizedTasks.some((task) => (
          task.status !== 'completed'
          && normalizeEmail(task.contactEmail || '') === reactivationContact.email
          && task.source === 'ai-reactivation-draft'
        ));
        if (!hasActiveReactivationTask) {
          appendTaskLocally(createEmptyTask({
            id: `reactivation-follow-up-${Date.now()}`,
            title: `${reactivationContact.stage === 'Churned' ? 'Win back' : 'Re-activate'} ${reactivationContact.name}`,
            type: 'follow-up',
            status: 'pending',
            priority: Math.max(reactivationContact.priorityScore || 68, 74),
            dueDate: followUpDate,
            scheduledDate: followUpDate,
            contact: reactivationContact.name,
            contactEmail: reactivationContact.email,
            company: reactivationContact.company,
            owner: reactivationContact.owner,
            rationale: reactivationContact.timelineSummary || reactivationContact.aiSummary || reactivationContact.nextStep || '',
            notes: 'AI-generated reactivation draft is loaded in Outreach.',
            source: 'ai-reactivation-draft'
          }));
        }

        const savedContact = await saveContactRecord({
          ...reactivationContact,
          nextFollowUpAt: followUpDate,
          nextStep: reactivationContact.stage === 'Churned'
            ? 'Test for a respectful win-back conversation with a low-friction checkpoint.'
            : 'Re-open the relationship with a fresh angle and ask for a quick checkpoint.',
          lastAiReviewedAt: new Date().toISOString()
        });
        setCrmWorkspaceInsight(`[AI Reactivation Draft: ${reactivationContact.name}]\n\n${result}`);
        if (selectedContact && normalizeEmail(selectedContact.email) === savedContact.email) {
          openDossier(savedContact);
        }
        showNotification(`Reactivation draft loaded for ${reactivationContact.name}.`);
        setLoading(false);
        return;
      }

      if (actionType === 'customerCheckIn') {
        const customerContact = normalizeContactRecord(options?.contact || selectedContact || {});
        if (!customerContact.email) {
          showNotification('Choose a customer contact first.', 'error');
          setLoading(false);
          return;
        }
        if (customerContact.stage !== 'Customer') {
          showNotification('Customer check-in is designed for customer-stage accounts.', 'error');
          setLoading(false);
          return;
        }

        const threadMessages = threads[customerContact.email]?.messages || [];
        const threadSummary = threadMessages
          .slice(-6)
          .map((message) => `${message.type === 'call' ? 'Call' : message.direction === 'outbound' ? 'Outbound' : 'Inbound'} | ${message.subject || 'No subject'} | ${formatDateKey(message.date) || 'Unknown date'}`)
          .join('\n') || 'No recent interactions.';
        const inboxSignal = options?.inboxEmail ? joinContextBlocks(
          `Latest inbox subject: ${options.inboxEmail.subject || 'No subject'}`,
          options.inboxEmail.aiSummary ? `Inbox insight: ${options.inboxEmail.aiSummary}` : '',
          options.inboxEmail.body ? `Inbox body: ${options.inboxEmail.body}` : ''
        ) : 'No fresh inbox signal.';

        prompt = `Act as an elite account manager and revenue operator. Draft a customer check-in email that protects retention while opening expansion or referral motion.
Return exactly in this format:
SUBJECT: ...
FOLLOW-UP DATE: ...
BODY:
...

Contact:
Name: ${customerContact.name}
Company: ${customerContact.company || 'Unknown'}
Title: ${customerContact.jobTitle || 'Unknown'}
Stage: ${customerContact.stage}
Value: ${customerContact.estimatedValue || 0}
Priority: ${customerContact.priorityScore || 50}
Pain Points: ${customerContact.painPoints || 'Not captured'}
Current Next Step: ${customerContact.nextStep || 'Not defined'}

Relationship Summary:
${customerContact.timelineSummary || customerContact.aiSummary || 'No stored summary.'}

Recent Timeline:
${threadSummary}

Fresh Signal:
${inboxSignal}

Make the email warm, concise, and commercially aware. Reinforce delivered value, ask one smart check-in question, and open the door to the next meeting, expansion, or referral. No emojis.`;

        const result = await callGeminiAPI(prompt);
        const draft = parseStructuredOutreachDraft(result);
        if (!draft.body) {
          throw new Error('Failed to parse the customer check-in draft.');
        }

        const followUpDate = draft.followUpDate || customerContact.nextFollowUpAt || formatFuturePlanningDateKey(14, planningTimeZoneValue);
        let nextBody = draft.body;
        if (config.signature && !nextBody.includes(config.signature.substring(0, 10))) {
          nextBody = `${nextBody}\n\n${config.signature}`;
        }

        setComposerState({
          ...createComposerResetState({ defaultTone: config.defaultTone, defaultLength: config.defaultLength }),
          to: customerContact.email,
          hubspotId: customerContact.hubspotId || null,
          recipientName: customerContact.name,
          companyName: customerContact.company,
          jobTitle: customerContact.jobTitle || '',
          threadHistory: buildHistoryStringFromMessages(threadMessages),
          aiContext: `[AI Customer Check-In: ${customerContact.name}]\n\n${result}`,
          subject: draft.subject || `Quick customer check-in for ${customerContact.company || customerContact.name}`,
          body: nextBody
        });
        setSelectedInboxEmail(options?.inboxEmail || null);
        setSelectedContact(null);
        setActiveTab('outreach');
        setSelectedCalendarDate(followUpDate);
        setActiveCalendarMonth(formatMonthKey(followUpDate));

        const hasActiveCustomerTask = normalizedTasks.some((task) => (
          task.status !== 'completed'
          && normalizeEmail(task.contactEmail || '') === customerContact.email
          && task.source === 'ai-customer-check-in'
        ));
        if (!hasActiveCustomerTask) {
          appendTaskLocally(createEmptyTask({
            id: `customer-check-in-${Date.now()}`,
            title: `Customer check-in with ${customerContact.name}`,
            type: 'follow-up',
            status: 'pending',
            priority: Math.max(customerContact.priorityScore || 76, 76),
            dueDate: followUpDate,
            scheduledDate: followUpDate,
            contact: customerContact.name,
            contactEmail: customerContact.email,
            company: customerContact.company,
            owner: customerContact.owner,
            rationale: customerContact.timelineSummary || customerContact.aiSummary || customerContact.nextStep || '',
            notes: 'AI-generated customer check-in draft is loaded in Outreach.',
            source: 'ai-customer-check-in'
          }));
        }

        const savedContact = await saveContactRecord({
          ...customerContact,
          nextFollowUpAt: followUpDate,
          nextStep: 'Confirm outcomes, uncover expansion or referral signals, and lock the next checkpoint.',
          lastAiReviewedAt: new Date().toISOString()
        });
        setCrmWorkspaceInsight(`[AI Customer Check-In: ${customerContact.name}]\n\n${result}`);
        if (selectedContact && normalizeEmail(selectedContact.email) === savedContact.email) {
          openDossier(savedContact);
        }
        showNotification(`Customer check-in draft loaded for ${customerContact.name}.`);
        setLoading(false);
        return;
      }

      if (actionType === 'salesPatternTracker') {
        if (salesPerformanceSnapshot.outboundCount === 0 && salesPerformanceSnapshot.stageTransitionCount === 0) {
          showNotification('Work a few deals or outreach threads first so AI has enough pattern data.', 'error');
          setLoading(false);
          return;
        }

        const riskLines = atRiskPipelineContacts
          .map(({ contact, attention }) => `${contact.name} | ${contact.stage} | Value ${contact.estimatedValue || 0} | Open Tasks ${attention?.openTasksCount || 0} | Next Step ${contact.nextStep || 'Missing'}`)
          .join('\n') || 'No current at-risk deals.';

        prompt = `Act as a small-business revenue analyst. Review this 30-day sales pattern snapshot and tell the owner what is actually helping deals move versus what is causing losses.
Return:
1. WHAT IS WORKING
2. WHAT IS FAILING
3. WIN SIGNALS
4. LOSS SIGNALS
5. ONE PROCESS FIX
6. ONE MANAGER HABIT TO ENFORCE

Snapshot:
Outbound Messages: ${salesPerformanceSnapshot.outboundCount}
Inbound Replies: ${salesPerformanceSnapshot.inboundCount}
Contacted Accounts: ${salesPerformanceSnapshot.contactedAccounts}
Replied Accounts: ${salesPerformanceSnapshot.repliedAccounts}
Response Rate: ${salesPerformanceSnapshot.responseRate}%
Average Touches Before Reply: ${salesPerformanceSnapshot.averageTouchesBeforeReply}
Proposal Accounts: ${salesPerformanceSnapshot.proposalCount}
Customers Won: ${salesPerformanceSnapshot.customerCount}
Churned / Lost: ${salesPerformanceSnapshot.churnedCount}
Stage Progressions Logged: ${salesPerformanceSnapshot.progressedCount}
Wins Logged: ${salesPerformanceSnapshot.wonCount}
Losses Logged: ${salesPerformanceSnapshot.lostCount}
Stalled Proposals: ${salesPerformanceSnapshot.stalledProposalCount}
Completed Meetings: ${salesPerformanceSnapshot.completedMeetingCount}

Current Risk Queue:
${riskLines}

Be concise, practical, and specific. No emojis.`;

        const result = await callGeminiAPI(prompt);
        setSalesPatternInsight(`[AI Win/Loss Tracker]\n\n${result}`);
        setDashboardPartnerInsight(`[AI Win/Loss Tracker]\n\n${result}`);
        setActiveTab('dashboard');
        showNotification('AI win/loss tracker generated.');
        setLoading(false);
        return;
      }

      if (actionType === 'write') {
        const contextParts = [];
        if (config.companyUrl) contextParts.push(`Our Company Profile: ${config.companyUrl}`);
        if (config.senderName) contextParts.push(`Sender Name: ${config.senderName}`);
        if (composerState.recipientName) contextParts.push(`Recipient Name: ${composerState.recipientName}`);
        if (composerState.jobTitle) contextParts.push(`Recipient Job Title: ${composerState.jobTitle}`);
        if (composerState.companyName) contextParts.push(`Recipient Company: ${composerState.companyName}`);
        if (composerState.threadHistory) contextParts.push(`Thread History (Read this carefully to respond appropriately):\n${composerState.threadHistory}`);
        if (composerState.aiContext) contextParts.push(`User Instructions: ${composerState.aiContext}`);
        if (outreachPlayContext) contextParts.push(outreachPlayContext);

        prompt = `Write a professional B2B cold outreach or follow-up email. Target Recipient Email: ${composerState.to || 'a potential client'}.
        Context & Guidelines: ${contextParts.join('\n\n')}
        Formatting Directives: Tone: ${composerState.tone}, Length: ${composerState.length}
        Instructions: Make it highly relevant. Use the active outreach play if one is provided. Write clearly, compellingly, and end with a soft call to action. Output the subject line first starting with "Subject: ". Do not include a signature, as one will be appended automatically. Remember: NO EMOJIS.`;
        
        const result = await callGeminiAPI(prompt);
        const subjectMatch = result.match(/Subject:\s*(.*)\n/i);
        let newSubject = composerState.subject;
        let newBody = result;
        
        if (subjectMatch) {
          newSubject = subjectMatch[1].trim();
          newBody = result.replace(subjectMatch[0], '').trim();
        }
        
        // Auto-append signature
        if (config.signature && !newBody.includes(config.signature.substring(0, 10))) {
           newBody = `${newBody}\n\n${config.signature}`;
        }
        
          setComposerState(prev => ({ ...prev, subject: newSubject || prev.subject, body: newBody, suggestedSubjects: [], sequenceSteps: [] }));
        showNotification("Draft generated successfully");

      } else if (actionType === 'meeting') {
        const contextParts = [];
        if (config.companyUrl) contextParts.push(`Our Company: ${config.companyUrl}`);
        if (composerState.recipientName) contextParts.push(`Recipient Name: ${composerState.recipientName}`);
        if (composerState.companyName) contextParts.push(`Company: ${composerState.companyName}`);
        if (outreachPlayContext) contextParts.push(outreachPlayContext);
        
        prompt = `Write a highly-converting, short B2B email to schedule a discovery/demo meeting with ${composerState.recipientName || 'the prospect'} at ${composerState.companyName || 'their company'}.
        Context: ${contextParts.join(' | ')}.
        Include a clear CTA for a 15-minute sync next week. Output the subject line first starting with "Subject: ". Do not include a signature. NO EMOJIS.`;
        
        const result = await callGeminiAPI(prompt);
        const subjectMatch = result.match(/Subject:\s*(.*)\n/i);
        let newSubject = composerState.subject;
        let newBody = result;
        if (subjectMatch) {
          newSubject = subjectMatch[1].trim();
          newBody = result.replace(subjectMatch[0], '').trim();
        }
        if (config.signature) newBody += `\n\n${config.signature}`;
        setComposerState(prev => ({ ...prev, subject: newSubject || prev.subject, body: newBody, sequenceSteps: [] }));
        showNotification("Meeting invite generated");

      } else if (actionType === 'suggestSubjects') {
        prompt = `Based on the following email body, generate 3 highly clickable, intriguing, and professional subject lines for a B2B sales context. Return ONLY the 3 subject lines, one per line, with no numbers or bullets. No emojis.\n\nBody:\n${composerState.body}`;
        const result = await callGeminiAPI(prompt);
        const subjects = result.split('\n').map(s => s.trim().replace(/^[-*•\d.)\s]+/, '')).filter(s => s.length > 0);
        setComposerState(prev => ({ ...prev, suggestedSubjects: subjects }));
        showNotification("Subject lines generated");

      } else if (actionType === 'polish') {
         if (!composerState.body) {
          showNotification("Please write a draft to polish first.", "error"); setLoading(false); return;
        }
        prompt = `Act as an elite copywriter. Polish and improve the following sales email draft. Make it sound more natural, improve the flow, ensure it aligns with a ${composerState.tone} tone, and keep it ${composerState.length}. NO EMOJIS.\n\nDraft:\n${composerState.body}`;
        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, body: result, sequenceSteps: [] }));
        showNotification("Draft polished successfully");

      } else if (actionType === 'summarize') {
        prompt = `Summarize the following email thread history concisely for a salesperson preparing to reply. NO EMOJIS.\n\n${composerState.threadHistory}`;
        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, aiContext: result }));
        showNotification("Thread summarized");

      } else if (actionType === 'coach') {
        prompt = `Act as my Virtual Sales Director. Review the prospect details, CRM state, and thread history below. Give me a step-by-step strategic playbook on exactly how to close this deal, what psychological levers to pull, what sequence cadence to use, and what my next exact move should be. NO EMOJIS.\n\nProspect: ${composerState.recipientName}, ${composerState.jobTitle} at ${composerState.companyName}\n${outreachPlayContext || ''}\nThread History:\n${composerState.threadHistory}`;
        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, aiContext: result }));
        showNotification("Director's strategy generated");

      } else if (actionType === 'analyze') {
        if (!composerState.body) {
          showNotification("Please write a draft to analyze first.", "error"); setLoading(false); return;
        }
        prompt = `Analyze the following sales email draft. Provide 3 bullet points on how to improve its conversion rate, tone, and clarity. NO EMOJIS.\n\nDraft:\n${composerState.body}`;
        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, aiContext: result }));
        showNotification("Analysis complete");

      } else if (actionType === 'objection') {
        if (!composerState.objection) {
          showNotification("Please enter the prospect's objection first.", "error"); setLoading(false); return;
        }
        prompt = `Act as an elite Virtual Sales Director. The prospect just gave me this objection: "${composerState.objection}". Based on the thread history, give me a highly persuasive, psychological script to dismantle this objection and pivot to a meeting. CRITICAL: NO EMOJIS.`;
        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, aiContext: `[Objection Crusher Strategy]\n\n${result}` }));
        showNotification("Objection response generated");

      } else if (actionType === 'sequence') {
        const contextParts = [];
        if (config.companyUrl) contextParts.push(`Our Company Profile: ${config.companyUrl}`);
        if (composerState.recipientName) contextParts.push(`Recipient Name: ${composerState.recipientName}`);
        if (composerState.companyName) contextParts.push(`Recipient Company: ${composerState.companyName}`);
        if (config.senderName) contextParts.push(`Sender Name: ${config.senderName}`);
        const relationshipContext = joinContextBlocks(
          outreachPlayContext,
          activeOutreachRelationshipState?.context,
          composerState.aiContext,
          composerState.threadHistory ? `[THREAD HISTORY]\n${composerState.threadHistory}` : ''
        );
        const sequenceStepCount = Math.max(2, Math.min(5, Number(composerState.sequenceStepCount) || DEFAULT_SEQUENCE_STEP_COUNT));
        const cadenceSummary = selectedSequenceCadence.delays
          .map((delay, index) => `Step ${index + 1}: day ${delay}`)
          .join(' | ');
        
        prompt = `Act as an elite Virtual Sales Director. Write a complete ${sequenceStepCount}-step B2B sales email drip sequence for ${composerState.to || 'this prospect'}.
        Context: ${contextParts.join(' | ')} | Tone: ${composerState.tone}
        Relationship Context:
        ${relationshipContext || 'No CRM snapshot is linked yet.'}
        Sequence Cadence: ${selectedSequenceCadence.label} (${cadenceSummary})
        Requirements: tailor the progression to the current stage and playbook. Use ${sequenceStepCount === 2 ? 'two' : sequenceStepCount} steps.
        For each step, output exactly this structure:
        Step X - [Step Name]
        Delay: [number of days after the previous step]
        Goal: [what this step is trying to unlock]
        Subject: [specific subject line]
        Body: [complete, send-ready email copy with greeting, value, and CTA]
        Make the sequence commercially sharp, vary the angle across steps, and use the CRM or inbox context when it helps.
        Write final email copy, not instructions. Do not output placeholders like "Share one..." or "Offer...".
        Do not include signatures. CRITICAL: NO EMOJIS.`;
        
        const result = await callGeminiAPI(prompt);
        const parsedSteps = parseSequenceSteps(result);
        const generatedStepCount = parsedSteps.length || sequenceStepCount;
        setComposerState(prev => ({
          ...prev,
          body: result,
          subject: `${generatedStepCount}-Step Sequence Generated`,
          sequenceSteps: parsedSteps
        }));
        showNotification(
          parsedSteps.length > 0
            ? `${generatedStepCount}-step sequence generated. Use the step loader buttons to copy one email at a time.`
            : `${sequenceStepCount}-step sequence generated successfully`
        );
      } else if (actionType === 'replyFromInbox') {
        const inboxEmail = options?.inboxEmail;
        if (!inboxEmail) {
          showNotification('No inbox email selected for AI Outreach.', 'error');
          setLoading(false);
          return;
        }
        if (!canReplyToInboxEmail(inboxEmail)) {
          showNotification('This email does not include a valid sender address to reply to.', 'error');
          setLoading(false);
          return;
        }

        const replyMetadata = getInboxReplyMetadata(inboxEmail);
        const recipientName = replyMetadata.recipientName;
        const companyName = replyMetadata.companyName;
        const to = replyMetadata.to;
        const subject = replyMetadata.subject;
        const threadHistory = replyMetadata.threadHistory;
        const relationshipState = buildOutreachRelationshipState({
          email: inboxEmail.fromEmail,
          name: inboxEmail.fromName,
          company: inboxEmail.company,
          inboxEmail
        });

        prompt = `Act as an elite Virtual Sales Director and expert growth marketer. Write a highly personalized response to this inbound email that uses persuasive sales psychology, urgency, and a strong value framing. Do not sound generic.
Target Prospect: ${recipientName} at ${companyName}
Prospect Email: ${to}
Original Email Subject: ${inboxEmail.subject}
Original Email Body:
${inboxEmail.body}

Linked CRM and inbox context:
${relationshipState.context || 'No CRM snapshot is linked yet.'}

Output rules:
1) Return the subject line first as "Subject: [subject text]".
2) Return only the email body after that, with no signature.
3) No emojis.
4) Keep it professional, concise, and focused on the next step.
5) Include a brief reason why this response matters in the subject if appropriate.`;

        const resultReply = await callGeminiAPI(prompt);
        const subjectMatch = resultReply.match(/Subject:\s*(.*)\n/i);
        let generatedSubject = subject;
        let generatedBody = resultReply;
        if (subjectMatch) {
          generatedSubject = subjectMatch[1].trim();
          generatedBody = resultReply.replace(subjectMatch[0], '').trim();
        }
        if (config.signature && !generatedBody.includes(config.signature.substring(0, 10))) {
          generatedBody = `${generatedBody}\n\n${config.signature}`;
        }

        setComposerState(buildComposerStateFromInboxEmail({
          email: inboxEmail,
          defaultTone: config.defaultTone,
          defaultLength: config.defaultLength,
          subjectOverride: generatedSubject,
          body: generatedBody,
          aiContext: joinContextBlocks(
            relationshipState.context,
            'This reply was generated from the selected Smart Inbox email. Use it as the draft for follow-up.'
          )
        }));
        setSelectedInboxEmail(inboxEmail);
        setActiveTab('outreach');
        showNotification('AI Outreach reply generated from inbox email.');

      } else if (actionType === 'analyzeInbox') {
        const emailsToAnalyze = inboxEmails.filter((email) => (
          !email.isArchived &&
          email.needsResponse !== false &&
          (email.aiScore == null || !String(email.aiSummary || '').trim())
        ));

        if (emailsToAnalyze.length === 0) {
          showNotification('Inbox is already scored or has no response-worthy emails right now.', 'success');
          setLoading(false);
          return;
        }

        const updates = new Map();
        let analyzedCount = 0;
        let failedCount = 0;

        for (const email of emailsToAnalyze) {
          try {
            const parsed = await analyzeInboxEmailInsight(email, { abortPrevious: false });
            updates.set(email.id, parsed);
            analyzedCount += 1;
          } catch {
            failedCount += 1;
          }
        }

        if (updates.size > 0) {
          setInboxEmails(prev => prev.map((email) => {
            const parsed = updates.get(email.id);
            return parsed ? { ...email, aiScore: parsed.score, aiSummary: parsed.summary } : email;
          }));
        }

        if (analyzedCount === 0) {
          throw new Error('Inbox analysis failed for every email in the current queue.');
        }

        showNotification(
          failedCount > 0
            ? `Inbox analysis completed for ${analyzedCount} email${analyzedCount === 1 ? '' : 's'}. ${failedCount} email${failedCount === 1 ? '' : 's'} could not be scored.`
            : `Inbox successfully analyzed and scored for ${analyzedCount} email${analyzedCount === 1 ? '' : 's'}.`
        );

      } else if (actionType === 'researchContact') {
        const contact = options?.contact;
        if (!contact) { showNotification("No contact selected.", "error"); setLoading(false); return; }
        prompt = `Act as an elite B2B sales intelligence analyst. Research this contact and provide a concise, actionable dossier:

Name: ${contact.name}
Email: ${contact.email}
Company: ${contact.company || 'Unknown'}
Job Title: ${contact.jobTitle || 'Unknown'}
LinkedIn: ${contact.linkedin || 'Not provided'}

Provide:
1. ROLE ANALYSIS: What this person likely cares about based on their title and company
2. PAIN POINTS: 3 likely business pain points for someone in this role
3. CONVERSATION STARTERS: 3 personalized opening angles for outreach
4. BEST APPROACH: Recommended tone, timing, and channel for first contact
5. DEAL POTENTIAL: Assessment of decision-making authority (Champion, Influencer, or Decision Maker)

Keep it concise and actionable. CRITICAL: NO EMOJIS.`;
        
        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, aiContext: `[AI Research: ${contact.name}]\n\n${result}` }));
        setSelectedContact(null);
        setActiveTab('outreach');
        showNotification(`AI research loaded into Outreach for ${contact.name}.`);

      } else if (actionType === 'aiContactPlan') {
        const contact = options?.contact;
        if (!contact) { showNotification('No contact selected.', 'error'); setLoading(false); return; }
        const normalizedContact = normalizeContactRecord(contact);
        const relatedTasks = normalizedTasks.filter((task) => normalizeEmail(task.contactEmail || '') === normalizedContact.email);
        const threadHistory = threads[normalizedContact.email]?.messages || [];
        const threadSummary = threadHistory.slice(-4).map((message) => `${message.direction || 'activity'} | ${message.subject || 'No subject'} | ${new Date(message.date).toLocaleDateString()}`).join('\n') || 'No recent interactions.';

        prompt = `Act as a sharp small-business revenue operator. Review this contact and create an actionable commercial plan.
Return the answer using these exact labels, one per line:
SUMMARY: ...
PRIORITY: ...
VALUE: ...
NEXT STEP: ...
FOLLOW-UP DATE: ...
TASK TYPE: ...
TASK TITLE: ...
OPENER: ...
CHANNEL: ...
ROLE: ...
PAIN POINTS: ...

Contact:
Name: ${normalizedContact.name}
Company: ${normalizedContact.company || 'Unknown'}
Title: ${normalizedContact.jobTitle || 'Unknown'}
Stage: ${normalizedContact.stage}
Current Priority: ${normalizedContact.priorityScore || 50}
Current Value: ${normalizedContact.estimatedValue || 0}
Current Next Step: ${normalizedContact.nextStep || 'Not set'}
Open Tasks: ${relatedTasks.length}
Thread Summary:
${threadSummary}

No emojis.`;

        const result = await callGeminiAPI(prompt);
        const plan = parseAiContactPlan(result);
        const updatedContact = await saveContactRecord({
          ...normalizedContact,
          aiSummary: plan.summary || normalizedContact.aiSummary,
          nextStep: plan.nextStep || normalizedContact.nextStep,
          nextFollowUpAt: plan.followUpDate || normalizedContact.nextFollowUpAt,
          priorityScore: plan.priority || normalizedContact.priorityScore,
          estimatedValue: plan.estimatedValue ?? normalizedContact.estimatedValue,
          preferredChannel: plan.channel || normalizedContact.preferredChannel,
          buyingRole: plan.role || normalizedContact.buyingRole,
          painPoints: plan.painPoints || normalizedContact.painPoints,
          lastAiReviewedAt: new Date().toISOString()
        });
        void refreshContactTimelineSummary(updatedContact, { preferHeuristic: true });

        const nextTask = createTaskFromContactPlan(updatedContact, plan);
        if (!normalizedTasks.some((task) => normalizeEmail(task.contactEmail || '') === updatedContact.email && (task.title || '').toLowerCase() === nextTask.title.toLowerCase() && task.status !== 'completed')) {
          appendTaskLocally(nextTask);
        }

        setCrmWorkspaceInsight(`[AI Contact Plan: ${updatedContact.name}]\n\n${result}`);
        if (selectedContact && normalizeEmail(selectedContact.email) === updatedContact.email) {
          openDossier(updatedContact);
        }
        showNotification(`AI plan created for ${updatedContact.name}.`);

      } else if (actionType === 'preSendCheck') {
        if (!composerState.body) { showNotification("Write a draft first.", "error"); setLoading(false); return; }
        prompt = `Act as a senior sales email QA analyst. Review this email BEFORE it gets sent and provide a quick pre-send checklist:

To: ${composerState.to || 'Unknown'}
Subject: ${composerState.subject || 'No subject'}
Body:
${composerState.body}

Evaluate on these dimensions and give a score for each (1-10):
1. CLARITY: Is the message clear and easy to understand?
2. PERSONALIZATION: Does it feel personalized or generic?
3. CTA STRENGTH: Is there a clear, compelling call to action?
4. TONE MATCH: Does it match a ${composerState.tone} tone?
5. SPAM RISK: Any words/patterns that might trigger spam filters?
6. OVERALL SEND READINESS: Overall score (1-10)

Then provide 1-2 quick fixes if score is below 8. Keep response concise.
CRITICAL: NO EMOJIS.`;

        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, aiContext: `[Pre-Send Analysis]\n\n${result}` }));
        showNotification("Pre-send analysis complete. Check Director's Insight.");

      } else if (actionType === 'suggestFollowUp') {
        const contact = options?.contact;
        if (!contact) { showNotification("No contact selected.", "error"); setLoading(false); return; }
        const contactEmail = normalizeEmail(contact.email);
        const threadHistory = threads[contactEmail]?.messages || [];
        const historyText = threadHistory.length > 0
          ? threadHistory.map(m => `[${new Date(m.date).toLocaleDateString()}] ${m.direction}: ${m.subject}`).join('\n')
          : 'No previous interactions recorded.';

        prompt = `Act as an elite Virtual Sales Director. Based on this interaction history, suggest the PERFECT next follow-up action:

Contact: ${contact.name} (${contact.jobTitle || 'Unknown title'}) at ${contact.company || 'Unknown company'}
Stage: ${contact.stage || 'Lead'}
Interaction History:
${historyText}

Provide:
1. URGENCY LEVEL: Hot/Warm/Cold follow-up needed
2. BEST TIMING: When to follow up (e.g., "Tomorrow morning", "In 3 days")
3. RECOMMENDED ACTION: Call, email, LinkedIn message, or meeting request
4. SUGGESTED OPENER: The exact first sentence to use
5. STRATEGIC ANGLE: What approach will resonate most

Keep it sharp and actionable. CRITICAL: NO EMOJIS.`;

        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, aiContext: `[Follow-Up Strategy: ${contact.name}]\n\n${result}` }));
        setSelectedContact(null);
        setActiveTab('outreach');
        showNotification(`Follow-up strategy loaded into Outreach for ${contact.name}.`);
      }

    } catch (err) {
      if (err?.message !== 'AI request cancelled.') {
        showNotification(err.message || "An error occurred during AI generation", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAIAction = (actionType, options = {}) => {
    const label = humanizeActionLabel(actionType);
    void enqueueAiOperation(label, () => runAIAction(actionType, options), { notifyOnQueue: true }).catch((error) => {
      if (error?.message !== 'AI queue cleared.') {
        console.error('AI action queue failed:', error);
      }
    });
  };

  const handleHubSpotSync = async () => {
    if (!config.hubspotToken && !getApiBaseUrl()) {
      showNotification("Please configure your HubSpot Access Token in Settings first.", "error");
      return;
    }
    if (!user) {
      showNotification("Storage not initialized yet.", "error");
      return;
    }
    setLoading(true);
    try {
      const properties = 'firstname,lastname,company,email,hs_lead_status,jobtitle,phone,lifecyclestage';
      const data = await callHubSpotAPI({
        resource: 'contacts',
        method: 'GET',
        query: `properties=${encodeURIComponent(properties)}`
      });

      if (data.results && data.results.length > 0) {
        const mappedContacts = data.results.map(c => ({
          hubspotId: c.id,
          name: `${c.properties.firstname || ''} ${c.properties.lastname || ''}`.trim() || 'Unknown',
          company: c.properties.company || 'Unknown',
          jobTitle: c.properties.jobtitle || '',
          email: normalizeEmail(c.properties.email || ''),
          phone: c.properties.phone || '',
          stage: c.properties.lifecyclestage || 'Lead',
          status: c.properties.hs_lead_status || 'New',
          source: 'HubSpot',
          priorityScore: c.properties.lifecyclestage === 'opportunity' ? 80 : 55,
          linkedin: '',
          notes: ''
        })).filter(c => c.email);

        if (IS_LOCAL_DEV_MODE || !db) {
          setContacts(prev => normalizeContacts([...prev, ...mappedContacts]));
        } else {
          for (const c of mappedContacts) {
            const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', c.email);
            await setDoc(docRef, c, { merge: true });
          }
        }

        showNotification(`Successfully synced and saved ${mappedContacts.length} contacts from HubSpot`);
      } else {
        showNotification("No contacts found in HubSpot.", "error");
      }
    } catch (error) {
      console.error("HubSpot Sync Error:", error);
      showNotification(error.message || "Failed to connect to HubSpot. Check CORS / Token.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!user) return;
    setLoading(true);

    (async () => {
      try {
        const csvText = await file.text();
        const lines = splitCsvRows(csvText);

        if (lines.length < 2) {
          showNotification('CSV appears empty or missing data rows.', 'error');
          return;
        }

        const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
        if (!headers.includes('email') && !headers.includes('e-mail')) {
          showNotification('CSV is missing an email column.', 'error');
          return;
        }

        const contactsToImport = lines
          .slice(1)
          .map(line => parseCsvLine(line))
          .map(values => toContactFromRow(headers, values))
          .filter(Boolean);

        const uniqueContacts = Array.from(new Map(contactsToImport.map(c => [c.email, c])).values());

        if (uniqueContacts.length === 0) {
          showNotification('No valid contacts found in CSV. Ensure an email column exists.', 'error');
          return;
        }

        if (IS_LOCAL_DEV_MODE || !db) {
          setContacts(prev => normalizeContacts([...prev, ...uniqueContacts.map(contact => ({ ...contact, source: contact.source || 'Import' }))]));
        } else {
          for (const c of uniqueContacts) {
            const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', c.email);
            await setDoc(docRef, c, { merge: true });
          }
        }

        showNotification(`Successfully imported and saved ${uniqueContacts.length} contacts from CSV`);
      } catch (err) {
        showNotification('Failed to parse or save CSV contacts.', 'error');
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    })();
  };

  const handleSendEmail = async (optionsOrEvent = {}) => {
    const sendOptions = optionsOrEvent?.nativeEvent ? {} : optionsOrEvent;
    const { markHandled = false, archiveOriginal = false, createFollowUpTask = false } = sendOptions;
    const recipientEmail = normalizeEmail(composerState.to || '');
    const selectedInboxMatchesRecipient = selectedInboxEmail
      ? normalizeEmail(selectedInboxEmail.fromEmail || '') === recipientEmail
      : false;

    if (composerErrors.to) {
      showNotification(composerErrors.to, 'error');
      return;
    }
    if (!recipientEmail || !composerState.body) {
      showNotification("Please specify a recipient and message body.", "error");
      return;
    }
    if (!isValidEmail(recipientEmail)) {
      showNotification("Please enter a valid recipient email address.", "error");
      return;
    }
    if ((markHandled || createFollowUpTask) && (!selectedInboxEmail || !selectedInboxMatchesRecipient)) {
      showNotification('The current draft no longer matches the selected inbox email. Open the source again before marking it handled.', 'error');
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const notificationParts = [];
      const partialIssues = [];

      // --- Attempt actual email delivery via SMTP or Graph ---
      const useGraph =
        String(config.useGraphApi) === 'true' &&
        normalizeOAuthProvider(config.oauth2Provider) === 'microsoft';
      const desktopApi = window.salesDirectorDesktop;

      if (useGraph && desktopApi?.graph?.sendEmail) {
        try {
          await desktopApi.graph.sendEmail({
            oauth2ClientId: config.imapOAuth2ClientId || '',
            oauth2TenantId: config.imapOAuth2TenantId || '',
            user: (config.imapUser || config.smtpUser || '').trim(),
            to: recipientEmail,
            subject: composerState.subject || '',
            body: composerState.body || '',
            contentType: 'Text',
            replyTo: config.replyTo || '',
            bcc: config.autoBcc || ''
          });
          notificationParts.push('Email sent via Graph API and thread saved.');
        } catch (graphErr) {
          partialIssues.push(`Graph send failed: ${graphErr?.message || 'Unknown error'}`);
        }
      } else if (desktopApi?.smtp?.sendEmail && config.smtpHost && config.smtpUser) {
        const smtpConfig = getSmtpSendConfig();
        const bodyWithSig = config.signature ? `${composerState.body}\n\n${config.signature}` : composerState.body;
        try {
          await desktopApi.smtp.sendEmail({
            ...smtpConfig,
            from: config.senderName ? `"${config.senderName}" <${config.smtpUser}>` : config.smtpUser,
            to: recipientEmail,
            subject: composerState.subject || '',
            text: bodyWithSig,
            replyTo: config.replyTo || '',
            bcc: config.autoBcc || '',
            inReplyTo: selectedInboxEmail?.messageId || '',
            references: selectedInboxEmail?.messageId || ''
          });
          notificationParts.push('Email sent via SMTP and thread saved.');
        } catch (smtpErr) {
          partialIssues.push(`SMTP send failed: ${smtpErr?.message || 'Unknown error'}`);
        }
      } else {
        notificationParts.push('Email saved to thread (SMTP not configured — not delivered).');
      }

      const inboxThreadMessages = selectedInboxMatchesRecipient && selectedInboxEmail
        ? [buildThreadMessageFromInboxEmail(selectedInboxEmail)]
        : [];
      const newMessage = {
        date: new Date().toISOString(),
        subject: composerState.subject,
        body: composerState.body,
        direction: 'outbound'
      };

      const existingThread = threads[recipientEmail]?.messages || [];
      const nextThreadMessages = mergeThreadMessages(existingThread, [...inboxThreadMessages, newMessage]);
      await persistThreadMessages(recipientEmail, nextThreadMessages);

      const savedContact = await ensureContactFromActivity({
        email: recipientEmail,
        name: composerState.recipientName || selectedInboxEmail?.fromName || 'Unknown',
        company: composerState.companyName || selectedInboxEmail?.company || formatCompanyFromEmail(recipientEmail),
        jobTitle: composerState.jobTitle || '',
        source: selectedInboxEmail ? 'Inbox' : 'Manual',
        stage: 'Contact',
        lastContactedAt: formatDateKey(newMessage.date),
        priorityScore: selectedInboxEmail?.aiScore || undefined,
        aiSummary: selectedInboxEmail?.aiSummary || undefined
      });

      if ((config.hubspotToken || getApiBaseUrl()) && composerState.hubspotId) {
        try {
          await callHubSpotAPI({
            resource: 'emails',
            method: 'POST',
            body: {
              properties: {
                hs_timestamp: new Date().toISOString(),
                hs_email_direction: 'EMAIL',
                hs_email_status: 'SENT',
                hs_email_subject: composerState.subject,
                hs_email_text: composerState.body,
              },
              associations: [
                {
                  to: { id: composerState.hubspotId },
                  types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 198 }]
                }
              ]
            }
          });
          notificationParts.push('Logged in HubSpot.');
        } catch {
          partialIssues.push('Failed to log in HubSpot.');
        }
      }

      if (markHandled && selectedInboxEmail) {
        try {
          const handledEmail = await markInboxEmailHandled(selectedInboxEmail, { archiveOriginal });
          if (archiveOriginal && handledEmail && !selectedInboxEmail.isArchived) {
            notificationParts.push('Source email marked handled and archived.');
          } else {
            notificationParts.push('Source email marked handled.');
          }
          setArchiveSelectedInboxAfterSend(false);
        } catch (error) {
          partialIssues.push(error.message || 'Failed to mark the source email handled.');
        }
      }

      if (createFollowUpTask && selectedInboxEmail) {
        const followUpTask = addFollowUpTaskFromInboxEmail(selectedInboxEmail);
        if (followUpTask) {
          notificationParts.push('Created follow-up task.');
        }
      }
      
      const historyString = buildHistoryStringFromMessages(nextThreadMessages);
        
      setComposerState(prev => ({ 
        ...prev, body: '', subject: '', threadHistory: historyString, sequenceSteps: []
      }));
      void refreshContactTimelineSummary(savedContact || {
        email: recipientEmail,
        name: composerState.recipientName,
        company: composerState.companyName
      }, { messages: nextThreadMessages, preferHeuristic: false });
      try { window.localStorage.removeItem('salesdirector.draft.v1'); } catch { /* ignore */ }

      showNotification(
        [...notificationParts, ...partialIssues].join(' '),
        partialIssues.length > 0 ? 'error' : 'success'
      );
    } catch (err) {
      showNotification("Error saving thread to database.", "error");
    } finally {
      setArchiveSelectedInboxAfterSend(false);
      setLoading(false);
    }
  };

  const selectedInboxMatchesComposer = selectedInboxEmail
    ? normalizeEmail(composerState.to || '') === normalizeEmail(selectedInboxEmail.fromEmail || '')
    : false;
  const currentUrgentQueueIndex = selectedInboxEmail ? urgentInboxQueueIds.indexOf(selectedInboxEmail.id) : -1;
  const urgentQueueLabel = currentUrgentQueueIndex >= 0 ? `${currentUrgentQueueIndex + 1}/${urgentInboxQueueIds.length}` : '';
  const hasMoreUrgentReplies = currentUrgentQueueIndex >= 0 && currentUrgentQueueIndex < urgentInboxQueueIds.length - 1;
  const selectedInboxStatusLabel = selectedInboxEmail
    ? (selectedInboxEmail.needsResponse ? 'Needs Response' : 'Handled')
    : '';
  const sendDisabled = loading || Boolean(composerErrors.to) || !normalizeEmail(composerState.to || '') || !composerState.body;

  // --- Views ---

  const renderDashboard = () => {
    const todayKey = currentPlanningDateKey;
    const pendingTasks = normalizedTasks.filter(t => t.status === 'pending');
    const outboundMessages = Object.values(threads).flatMap(thread =>
      (thread?.messages || [])
        .filter(message => message.direction === 'outbound')
        .map(message => ({ ...message, to: message.to || thread?.contactEmail || '' }))
    );

    const outboundTodayCount = outboundMessages.filter(message => {
      const sentAt = new Date(message.date);
      return !Number.isNaN(sentAt.getTime()) && formatDateKeyInTimeZone(sentAt, planningTimeZoneValue) === todayKey;
    }).length;

    const meetingsBookedCount = normalizedTasks.filter(task =>
      task.status === 'completed' && /meeting|call|demo/i.test(task.type || '')
    ).length;

    const dashboardStats = [
      { label: 'Contacts', value: normalizedContacts.length, icon: Users },
      { label: 'Pending Tasks', value: pendingTasks.length, icon: Activity },
      { label: 'Needs Response', value: inboxEmails.filter(email => email.needsResponse).length, icon: Mail },
      { label: 'Sent Today', value: outboundTodayCount, icon: Send },
      { label: 'Meetings Booked', value: meetingsBookedCount, icon: CheckCircle },
    ];

    const recentActivity = outboundMessages
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3);

    return (
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto w-full">
        <h2 className="text-2xl font-bold text-black dark:text-white transition-colors">Sales Command Center</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {dashboardStats.map((stat, idx) => (
            <div key={idx} className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col transition-colors">
              <div className="flex items-center text-zinc-500 dark:text-zinc-400 mb-2">
                <stat.icon className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">{stat.label}</span>
              </div>
              <span className="text-3xl font-bold text-black dark:text-white">{stat.value}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-zinc-50 via-white to-amber-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-black dark:text-white flex items-center">
                <Wand2 className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-500" />
                AI Operating Partner
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 max-w-3xl">
                Use AI as the working chief of staff for the business: get a commercial brief, rescue at-risk deals, and turn raw ideas into CRM notes, tasks, and outreach angles.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleAIAction('dailyRevenueBrief')}
                className="flex items-center bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50 font-bold text-sm shadow-sm"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Revenue Brief
              </button>
              <button
                onClick={() => handleAIAction('rescuePipeline')}
                disabled={atRiskPipelineContacts.length === 0}
                className="flex items-center bg-amber-400 text-black px-4 py-2 rounded-lg hover:bg-amber-300 transition disabled:opacity-50 font-bold text-sm shadow-sm"
              >
                <ShieldAlert className="w-4 h-4 mr-2" />
                Rescue At-Risk Deals
              </button>
              <button
                onClick={() => handleAIAction('salesPatternTracker')}
                disabled={salesPerformanceSnapshot.outboundCount === 0 && salesPerformanceSnapshot.stageTransitionCount === 0}
                className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition disabled:opacity-50 font-bold text-sm shadow-sm"
              >
                <TrendingUp className="w-4 h-4 mr-2 text-blue-900 dark:text-blue-500" />
                Win/Loss Tracker
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/70 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-black dark:text-white">Partner Brief</h4>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Commercial guidance across CRM, inbox, tasks, and outreach.</p>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-full font-bold border bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
                  {atRiskPipelineContacts.length} at risk
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4 min-h-[10rem]">
                {dashboardPartnerInsight ? (
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{dashboardPartnerInsight}</p>
                ) : (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Run the revenue brief for a fast daily operating view, or rescue the current opportunity and proposal accounts that are most likely to slip.
                  </p>
                )}
              </div>

              <div className="mt-4">
                <h5 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">Closing Queue</h5>
                <div className="space-y-3">
                  {atRiskPipelineContacts.slice(0, 3).map(({ contact, attention }) => (
                    <div key={contact.email || contact.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-black dark:text-white">{contact.name}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">{contact.company || 'Unknown company'} · {contact.stage}</p>
                        </div>
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold border bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-900 dark:text-amber-300">
                          {formatCurrencyCompact(contact.estimatedValue)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2">
                        {contact.nextStep || contact.timelineSummary || 'No next step defined.'}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-zinc-500 dark:text-zinc-400">Open tasks: {attention?.openTasksCount || 0}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAIAction('aiContactPlan', { contact })}
                            className="font-bold text-blue-900 dark:text-blue-500 hover:text-black dark:hover:text-white transition disabled:opacity-50"
                          >
                            AI Plan
                          </button>
                          <button
                            onClick={() => openDossier(contact)}
                            className="font-bold text-black dark:text-white hover:text-blue-900 dark:hover:text-blue-400 transition"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {atRiskPipelineContacts.length === 0 && (
                    <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-4 text-sm text-zinc-500 dark:text-zinc-400">
                      No obvious at-risk opportunity or proposal deals right now.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/70 p-5">
              <h4 className="text-sm font-bold text-black dark:text-white">Idea Inbox</h4>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Paste a founder note, objection, customer request, or campaign idea. AI will turn it into tasks, attach it to the right contact when possible, and load an outreach angle for later drafting.
              </p>
              <textarea
                value={ideaCaptureInput}
                onChange={(event) => setIdeaCaptureInput(event.target.value)}
                rows="8"
                placeholder="Example: HVAC prospects keep asking about quote turnaround. We should tighten follow-up and build a simple speed-to-quote pitch for operators."
                className="mt-4 w-full border border-zinc-300 dark:border-zinc-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors resize-none"
              />
              <button
                onClick={() => handleAIAction('organizeIdea')}
                disabled={!ideaCaptureInput.trim()}
                className="mt-4 w-full flex items-center justify-center bg-blue-900 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-800 transition disabled:opacity-50"
              >
                <Layers className="w-4 h-4 mr-2" /> Turn Into Plan
              </button>
              <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Quick outcome: creates up to 3 tasks for {selectedCalendarDateLabel}, updates CRM notes when a known contact matches, and loads the best outreach angle into the AI outreach context.
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/70 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h4 className="text-sm font-bold text-black dark:text-white">Win/Loss Pattern Tracker</h4>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">AI reads outreach volume, replies, stage movement, and stalled proposals to surface what is actually moving revenue.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 px-3 py-2">
                  <p className="text-zinc-500 dark:text-zinc-400">Response Rate</p>
                  <p className="mt-1 font-bold text-black dark:text-white">{salesPerformanceSnapshot.responseRate}%</p>
                </div>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 px-3 py-2">
                  <p className="text-zinc-500 dark:text-zinc-400">Wins</p>
                  <p className="mt-1 font-bold text-emerald-600 dark:text-emerald-400">{salesPerformanceSnapshot.wonCount}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 px-3 py-2">
                  <p className="text-zinc-500 dark:text-zinc-400">Losses</p>
                  <p className="mt-1 font-bold text-blue-900 dark:text-blue-400">{salesPerformanceSnapshot.lostCount}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 px-3 py-2">
                  <p className="text-zinc-500 dark:text-zinc-400">Stalled Proposals</p>
                  <p className="mt-1 font-bold text-amber-600 dark:text-amber-400">{salesPerformanceSnapshot.stalledProposalCount}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4 min-h-[8rem]">
              {salesPatternInsight ? (
                <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{salesPatternInsight}</p>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Run the tracker to see whether your current sales process is winning through better follow-up, enough touches before reply, and clean progression from opportunity to proposal to closed business.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
          <div className="md:col-span-2 bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col transition-colors">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-black dark:text-white flex items-center">
                <Calendar className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-700" />
                Smart Action Plan
              </h3>
              <button
                onClick={() => { setActiveTab('tasks'); }}
                className="flex items-center text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
              >
                Open Smart Calendar <ChevronRight className="w-3 h-3 ml-1" />
              </button>
            </div>
            <div className="flex-1 space-y-3">
              {pendingTasks.slice(0, 4).map(task => (
                <div key={task.id} className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-black dark:text-white">{task.contact} <span className="text-zinc-500 dark:text-zinc-400 font-normal">({task.company})</span></span>
                    <span className="text-xs text-blue-900 dark:text-blue-500 font-medium mt-1">{task.title || task.type}</span>
                  </div>
                  <button
                    onClick={() => {
                      const matchedContact = normalizedContacts.find(c => normalizeEmail(c.email) === normalizeEmail(task.contactEmail || '')) || normalizedContacts.find(c => c.name === task.contact) || {};
                      setComposerState(prev => ({
                        ...prev,
                        recipientName: task.contact,
                        companyName: task.company,
                        to: matchedContact.email || task.contactEmail || ''
                      }));
                      setActiveTab('outreach');
                    }}
                    className="bg-black dark:bg-white text-white dark:text-black text-xs px-3 py-1.5 rounded hover:bg-zinc-800 dark:hover:bg-zinc-200 transition font-bold"
                  >
                    Execute
                  </button>
                </div>
              ))}
              {pendingTasks.length === 0 && (
                <p className="text-sm text-zinc-500 p-4 text-center">No pending tasks for today.</p>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
            <h3 className="text-lg font-semibold text-black dark:text-white mb-4">Recent Activity</h3>
            <div className="space-y-4">
              {recentActivity.map((activity, idx) => {
                const sentAt = new Date(activity.date);
                const sentAtLabel = Number.isNaN(sentAt.getTime()) ? 'Unknown date' : sentAt.toLocaleString();
                return (
                  <div key={`${activity.date || 'activity'}-${idx}`} className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-blue-900 dark:bg-blue-700 rounded-full mr-3"></div>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        Sent <strong className="text-black dark:text-white">{activity.subject || 'No subject'}</strong> to {activity.to || 'recipient'}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">{sentAtLabel}</span>
                  </div>
                );
              })}
              {recentActivity.length === 0 && (
                <p className="text-sm text-zinc-500">No recent outbound activity yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTasks = () => (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex flex-col">
      <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white transition-colors">Smart Agenda & Tasks</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Turn tasks into a real working day with focus windows, due dates, and AI-backed scheduling.</p>
        </div>
        <div className="flex space-x-3 flex-wrap">
          <button 
            onClick={() => handleAIAction('generateTasks')}
            className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition font-bold text-sm shadow-sm"
          >
            <Sparkles className="w-4 h-4 mr-2 text-blue-900 dark:text-blue-500" />
            Generate from CRM
          </button>
          <button 
            onClick={() => handleAIAction('prioritizeTasks')}
            disabled={tasks.filter(t => t.status === 'pending').length === 0}
            className="flex items-center bg-blue-900 text-white px-4 py-2 rounded-lg hover:bg-blue-950 dark:hover:bg-blue-800 transition disabled:opacity-50 font-bold text-sm shadow-sm"
          >
            <CalendarDays className="w-4 h-4 mr-2" />
            AI Auto-Schedule
          </button>
          <button 
            onClick={() => handleAIAction('planFocusDay')}
            disabled={filteredTasks.filter((task) => task.status !== 'completed').length === 0}
            className="flex items-center bg-amber-400 text-black px-4 py-2 rounded-lg hover:bg-amber-300 transition disabled:opacity-50 font-bold text-sm shadow-sm"
          >
            <Clock className="w-4 h-4 mr-2" />
            Plan Focus Day
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 text-xs">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <p className="text-zinc-500 dark:text-zinc-400">Overdue</p>
          <p className="mt-2 text-xl font-bold text-blue-900 dark:text-blue-400">{taskSummary.overdueCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <p className="text-zinc-500 dark:text-zinc-400">Due Today</p>
          <p className="mt-2 text-xl font-bold text-black dark:text-white">{taskSummary.dueTodayCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <p className="text-zinc-500 dark:text-zinc-400">Focus Day</p>
          <p className="mt-2 text-xl font-bold text-amber-600 dark:text-amber-400">{taskSummary.selectedDayCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <p className="text-zinc-500 dark:text-zinc-400">Unscheduled</p>
          <p className="mt-2 text-xl font-bold text-zinc-700 dark:text-zinc-300">{taskSummary.unscheduledCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <p className="text-zinc-500 dark:text-zinc-400">Completed</p>
          <p className="mt-2 text-xl font-bold text-emerald-600 dark:text-emerald-400">{taskSummary.completedCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[1.2fr_0.8fr] gap-4 mb-6">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-sm font-bold text-black dark:text-white">Recurring Task Templates</h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 max-w-2xl">
                Load repeatable operating rhythms straight into {selectedCalendarDateLabel} so the day starts with proven workflow blocks instead of manual setup.
              </p>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wide px-3 py-1 rounded-full border bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
              Planner Day: {selectedCalendarDateLabel}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {TASK_TEMPLATE_DEFINITIONS.map((template) => {
              const isActiveForDay = normalizedTasks.some((task) => (
                task.status !== 'completed' &&
                task.templateId === template.id &&
                (task.scheduledDate || '') === selectedCalendarDate
              ));

              return (
                <div key={template.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-bold text-black dark:text-white">{template.label}</h4>
                    <span className="text-[10px] px-2 py-1 rounded-full font-bold border bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-900 dark:text-amber-300">
                      {template.recurrenceLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{template.description}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{template.tasks.length} task{template.tasks.length === 1 ? '' : 's'}</span>
                    <button
                      onClick={() => applyTaskTemplate(template.id)}
                      disabled={isActiveForDay}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition ${isActiveForDay ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 cursor-not-allowed' : 'bg-black dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200'}`}
                    >
                      {isActiveForDay ? 'Already Added' : 'Apply Template'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-amber-50 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-black dark:text-white">Meeting Prep Queue</h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Build prep packs for the accounts most likely to need live-call preparation, agenda work, and next-step planning.
              </p>
            </div>
            <Briefcase className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
          </div>
          <div className="mt-4 space-y-3">
            {plannerPrepCandidates.map((contact) => (
              <div key={contact.email || contact.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-black dark:text-white">{contact.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{contact.company || 'Unknown company'} · {contact.stage}</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full font-bold border bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
                    {formatCurrencyCompact(contact.estimatedValue)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2">
                  {contact.timelineSummary || contact.nextStep || contact.aiSummary || 'No prep context stored yet.'}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-zinc-500 dark:text-zinc-400">Follow-up: {formatFriendlyDate(contact.nextFollowUpAt)}</span>
                  <button
                    onClick={() => createMeetingPrepPackForContact(contact)}
                    className="px-3 py-2 rounded-lg bg-amber-400 text-black hover:bg-amber-300 transition font-bold"
                  >
                    Create Prep Pack
                  </button>
                </div>
              </div>
            ))}
            {plannerPrepCandidates.length === 0 && (
              <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-4 text-sm text-zinc-500 dark:text-zinc-400">
                No strong prep candidates yet. Promote an opportunity in the pipeline or add a follow-up date to surface one here.
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)] gap-4 items-start">
        {/* Left: Task List */}
        <div className="min-w-0 flex flex-col bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors min-h-[300px]">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 space-y-3">
            <form onSubmit={addTask} className="w-full flex relative">
              <input 
                type="text" 
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                placeholder="Add a quick task..." 
                className="w-full pl-4 pr-12 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-900 text-black dark:text-white transition-colors"
              />
              <button type="submit" className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 bg-black dark:bg-white text-white dark:text-black rounded hover:bg-zinc-800 dark:hover:bg-zinc-200 transition">
                <Plus className="w-4 h-4" />
              </button>
            </form>
            <div className="flex gap-3 flex-wrap items-center">
              <div className="relative flex-1 min-w-[140px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={taskSearchQuery}
                  onChange={(e) => setTaskSearchQuery(e.target.value)}
                  placeholder="Search tasks, contacts, notes..."
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-900 text-black dark:text-white transition-colors"
                />
              </div>
              <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs font-bold">
                {[
                  { id: 'active', label: 'Active' },
                  { id: 'focus-day', label: 'Focus Day' },
                  { id: 'overdue', label: 'Overdue' },
                  { id: 'unscheduled', label: 'Unscheduled' },
                  { id: 'waiting', label: 'Waiting' },
                  { id: 'completed', label: 'Completed' }
                ].map((filterOption) => (
                  <button
                    key={filterOption.id}
                    onClick={() => setTaskStatusFilter(filterOption.id)}
                    className={`px-3 py-2 transition-colors ${taskStatusFilter === filterOption.id ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                  >
                    {filterOption.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredTasks.map(task => {
              const taskBucket = getTaskBucket(task, selectedCalendarDate);
              const isCompleted = task.status === 'completed';
              const scheduleState = getTaskScheduleState(task);
              return (
              <div key={task.id} className={`flex items-start p-4 rounded-lg border transition-colors ${isCompleted ? 'bg-zinc-50 dark:bg-zinc-950/30 border-transparent opacity-60' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                <button 
                  onClick={() => toggleTaskStatus(task.id)}
                  className={`mt-1 flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border transition-colors ${isCompleted ? 'bg-blue-900 border-blue-900 text-white' : 'border-zinc-300 dark:border-zinc-600 hover:border-blue-900 dark:hover:border-blue-500 text-transparent'}`}
                >
                  <Check className="w-3 h-3" />
                </button>
                
                <div className="ml-4 flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className={`text-sm font-bold ${isCompleted ? 'line-through text-zinc-500 dark:text-zinc-500' : 'text-black dark:text-white'}`}>
                        {task.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] font-bold uppercase tracking-wide">
                        <span className="px-2 py-0.5 rounded-full border bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">{task.type}</span>
                        <span className={`px-2 py-0.5 rounded-full border ${taskBucket === 'overdue' ? 'bg-blue-100 border-blue-200 text-blue-900 dark:bg-blue-900/30 dark:border-blue-900 dark:text-blue-400' : taskBucket === 'selected' ? 'bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-900 dark:text-amber-400' : 'bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300'}`}>
                          {taskBucket === 'selected' ? 'Focus Day' : taskBucket}
                        </span>
                        <span className="px-2 py-0.5 rounded-full border bg-blue-100 border-blue-200 text-blue-900 dark:bg-blue-900/30 dark:border-blue-900 dark:text-blue-400">{task.status}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {task.dueDate && !isCompleted && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border bg-blue-100 border-blue-200 text-blue-900 dark:bg-blue-900/30 dark:border-blue-900 dark:text-blue-400">
                          Due: {formatFriendlyDate(task.dueDate, 'No due date')}
                        </span>
                      )}
                      {task.priority && !isCompleted && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          task.priority >= 80 ? 'bg-blue-100 border-blue-200 text-blue-900 dark:bg-blue-900/30 dark:border-blue-900 dark:text-blue-400' : 
                          task.priority >= 50 ? 'bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-900 dark:text-amber-400' : 
                          'bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400'
                        }`}>
                          Priority: {task.priority}
                        </span>
                      )}
                      {!isCompleted && task.time && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border bg-emerald-100 border-emerald-200 text-emerald-900 dark:bg-emerald-900/30 dark:border-emerald-900 dark:text-emerald-400">
                          {formatTaskTimeRangeLabel(task)}
                        </span>
                      )}
                      {!isCompleted && scheduleState.hasConflict && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border bg-blue-100 border-blue-200 text-blue-900 dark:bg-blue-900/30 dark:border-blue-900 dark:text-blue-400">
                          {scheduleState.hasOverlap ? 'Overlap' : 'Needs Buffer'}
                        </span>
                      )}
                      {!isCompleted && scheduleState.outsideActiveHours && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-900 dark:text-amber-400">
                          Outside Hours
                        </span>
                      )}
                      <button onClick={() => openEditTask(task)} className="text-zinc-400 hover:text-black dark:hover:text-white transition" title="Edit Task">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteTask(task.id)} className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition" title="Delete task" aria-label="Delete task">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-1 flex items-center text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400 font-medium">For: <strong className="text-black dark:text-white">{task.contact}</strong> ({task.company})</span>
                    {!isCompleted && (
                       <button 
                         onClick={() => {
                           const matchedContact = normalizedContacts.find(c => normalizeEmail(c.email) === normalizeEmail(task.contactEmail || '')) || normalizedContacts.find(c => c.name === task.contact) || {};
                           setComposerState(prev => ({ ...prev, recipientName: task.contact, companyName: task.company, to: matchedContact.email || task.contactEmail || '', sequenceSteps: [] }));
                           setActiveTab('outreach');
                         }}
                         className="ml-3 text-blue-900 dark:text-blue-500 hover:underline font-bold flex items-center"
                       >
                         Execute <ChevronRight className="w-3 h-3 ml-0.5" />
                       </button>
                    )}
                  </div>

                  {!isCompleted && (scheduleState.hasConflict || scheduleState.outsideActiveHours || scheduleState.invalidTime) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {scheduleState.hasConflict && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 font-bold text-blue-900 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-300">
                          {scheduleState.hasOverlap
                            ? `Overlaps with ${scheduleState.overlapIssues.length} scheduled task${scheduleState.overlapIssues.length === 1 ? '' : 's'}`
                            : `Needs ${scheduleBufferMinutes} minutes of buffer before the next booking`}
                        </span>
                      )}
                      {scheduleState.outsideActiveHours && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
                          Outside active hours {config.activeHoursStart}-{config.activeHoursEnd}
                        </span>
                      )}
                      {scheduleState.invalidTime && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 font-bold text-blue-900 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-300">
                          Invalid start time format
                        </span>
                      )}
                    </div>
                  )}

                  {!isCompleted && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => markTaskInProgress(task.id)}
                        className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 rounded font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                      >
                        Start Work
                      </button>
                      <button
                        onClick={() => scheduleTaskForSelectedDay(task.id)}
                        className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-300 px-3 py-1.5 rounded font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition"
                      >
                        Move to {selectedCalendarDateLabel}
                      </button>
                      {task.scheduledDate && (
                        <button
                          onClick={() => clearPlannerScheduleForTask(task.id)}
                          className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 rounded font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                        >
                          Unschedule
                        </button>
                      )}
                    </div>
                  )}

                  {(task.rationale || task.notes) && !isCompleted && (
                    <div className="mt-3 p-2 bg-zinc-50 dark:bg-zinc-950/50 rounded border border-zinc-100 dark:border-zinc-800 flex items-start">
                       <Sparkles className="w-3 h-3 text-blue-900 dark:text-blue-600 mr-2 mt-0.5 shrink-0" />
                       <span className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{task.rationale || task.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            )})}
            {filteredTasks.length === 0 && (
              <div className="p-10 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40">
                <CheckSquare className="w-8 h-8 mx-auto mb-3 text-zinc-400" />
                <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">No tasks for this view</p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">Generate a focus plan from CRM, apply a day template, or add a task manually to get the day moving.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Schedule Timeline & Calendar */}
        <div className="hidden xl:flex min-w-0 flex-col gap-4 transition-colors">

          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-5 flex-shrink-0">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-black dark:text-white">Upcoming Calls & Meetings</h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Prepare the next live conversation with AI before it happens.</p>
              </div>
              <button
                onClick={() => handleAIAction('callPrep', { task: upcomingMeetingQueue[0]?.task, contact: upcomingMeetingQueue[0]?.contact })}
                disabled={upcomingMeetingQueue.length === 0}
                className="text-xs bg-black dark:bg-white text-white dark:text-black px-3 py-2 rounded-lg font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50"
              >
                Prep Next
              </button>
            </div>

            <div className="space-y-3">
              {upcomingMeetingQueue.slice(0, 3).map((item) => {
                const scheduleState = getTaskScheduleState(item.task);
                return (
                <div key={item.task.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-black dark:text-white">{item.contact?.name || item.task.contact || 'Meeting task'}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.contact?.company || item.task.company || 'Unknown company'} · {item.task.type}</p>
                    </div>
                    <span className="text-[10px] px-2 py-1 rounded-full font-bold border bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
                      {formatFriendlyDate(item.dateKey, 'Unscheduled')}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2">{item.task.title}</p>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-zinc-500 dark:text-zinc-400">{formatTaskTimeRangeLabel(item.task)}{item.isToday ? ' · Today' : ''}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAIAction('callPrep', { task: item.task, contact: item.contact })}
                        className="font-bold text-blue-900 dark:text-blue-500 hover:text-black dark:hover:text-white transition disabled:opacity-50"
                      >
                        AI Call Prep
                      </button>
                      {item.contact && (
                        <button
                          onClick={() => createMeetingPrepPackForContact(item.contact, { scheduledDate: item.dateKey || selectedCalendarDate })}
                          className="font-bold text-black dark:text-white hover:text-amber-600 dark:hover:text-amber-400 transition"
                        >
                          Prep Pack
                        </button>
                      )}
                    </div>
                  </div>
                  {(scheduleState.hasConflict || scheduleState.outsideActiveHours) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {scheduleState.hasConflict && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 font-bold text-blue-900 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-300">{scheduleState.hasOverlap ? 'Conflict on calendar' : `Needs ${scheduleBufferMinutes}m buffer`}</span>}
                      {scheduleState.outsideActiveHours && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">Outside active hours</span>}
                    </div>
                  )}
                </div>
              )})}
              {upcomingMeetingQueue.length === 0 && (
                <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-4 text-sm text-zinc-500 dark:text-zinc-400">
                  No upcoming meeting or call tasks yet. Create one, then use AI call prep to walk in with a sharper plan.
                </div>
              )}
            </div>
          </div>
          
          {/* Mini Calendar */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-5 flex-shrink-0">
            <div className="flex justify-between items-center mb-4">
               <h3 className="font-bold text-black dark:text-white">
                 {activeCalendarMonthLabel}
               </h3>
               <div className="flex space-x-2">
                 <button onClick={() => setActiveCalendarMonth(prev => shiftMonthKey(prev, -1))} className="p-1 text-zinc-400 hover:text-black dark:hover:text-white transition"><ChevronRight className="w-4 h-4 rotate-180" /></button>
                 <button onClick={() => setActiveCalendarMonth(prev => shiftMonthKey(prev, 1))} className="p-1 text-zinc-400 hover:text-black dark:hover:text-white transition"><ChevronRight className="w-4 h-4" /></button>
               </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="text-[10px] font-bold text-zinc-400 uppercase">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                if (day.isPlaceholder) {
                  return <div key={day.key} className="h-10"></div>;
                }
                return (
                  <button
                    key={day.key}
                    onClick={() => setSelectedCalendarDate(day.dateKey)}
                    className={`h-9 w-9 mx-auto flex flex-col items-center justify-center rounded-xl text-xs font-bold transition-colors cursor-pointer border ${day.isSelected ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-md' : day.isToday ? 'bg-blue-900 text-white border-blue-900 shadow-md' : 'text-zinc-700 dark:text-zinc-300 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                  >
                    <span>{day.dayNumber}</span>
                    {day.taskCount > 0 && <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${day.urgentCount > 0 ? 'bg-amber-300' : day.completedCount === day.taskCount ? 'bg-emerald-300' : 'bg-zinc-400'}`}></span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Daily Schedule */}
          <div className="flex flex-col bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden min-h-[240px]">
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex justify-between items-center">
              <h3 className="font-bold text-black dark:text-white flex items-center text-sm">
                 <Clock className="w-4 h-4 mr-2 text-blue-900 dark:text-blue-500" /> {selectedCalendarDateLabel}
              </h3>
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 dark:text-zinc-400">
                <span>{selectedDayOpenTasks.length} task{selectedDayOpenTasks.length === 1 ? '' : 's'}</span>
                {selectedDayScheduleIssueCount > 0 && (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-blue-900 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-300">
                    {selectedDayScheduleIssueCount} schedule issue{selectedDayScheduleIssueCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
            <div className="p-3">
              <div className="relative border-l-2 border-zinc-200 dark:border-zinc-800 ml-2 space-y-5">
                {selectedDayOpenTasks.map((task, idx) => {
                  const scheduleState = getTaskScheduleState(task);
                  return (
                  <div key={idx} className="relative pl-5">
                    <div className="absolute -left-[7px] top-1 w-3.5 h-3.5 rounded-full bg-blue-900 dark:bg-blue-600 border-[3px] border-white dark:border-zinc-900"></div>
                    <h4 className="text-xs font-bold text-blue-900 dark:text-blue-500 mb-1">{formatTaskTimeRangeLabel(task)}</h4>
                    <div className="bg-zinc-50 dark:bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <p className="text-sm font-bold text-black dark:text-white leading-snug">{task.title}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{task.contact}</p>
                      {(scheduleState.hasConflict || scheduleState.outsideActiveHours) && (
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          {scheduleState.hasConflict && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 font-bold text-blue-900 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-300">{scheduleState.hasOverlap ? 'Overlapping booking' : `Needs ${scheduleBufferMinutes}m buffer`}</span>}
                          {scheduleState.outsideActiveHours && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">Outside active hours</span>}
                        </div>
                      )}
                      {task.rationale && <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1.5 leading-relaxed">{task.rationale}</p>}
                    </div>
                  </div>
                )})}
                {selectedDayOpenTasks.length === 0 && (
                  <div className="pl-6 text-sm text-zinc-500 dark:text-zinc-400">
                    Pick a day and use "Plan Focus Day" to build a realistic work plan.
                  </div>
                )}
              </div>
              {taskPlannerInsight && (
                <div className="mt-6 p-4 bg-zinc-50 dark:bg-zinc-950/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">AI Planner Notes</h4>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{taskPlannerInsight}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderInbox = () => (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-black dark:text-white transition-colors">Smart Inbox</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleImapInboxSync}
            disabled={loading || inboxSyncBusy.imap}
            className="flex items-center bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50 font-bold text-sm shadow-sm"
            title="Pull recent emails directly from your IMAP mailbox"
          >
            {inboxSyncBusy.imap ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Inbox className="w-4 h-4 mr-2" />}
            {inboxSyncBusy.imap ? 'Syncing Mailbox...' : 'Sync Mailbox'}
          </button>
          <button
            onClick={handleHubSpotInboxSync}
            disabled={loading || inboxSyncBusy.hubspot}
            className="flex items-center bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 px-4 py-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-50 font-bold text-sm shadow-sm"
            title="Pull email activity records from HubSpot"
          >
            {inboxSyncBusy.hubspot ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
            {inboxSyncBusy.hubspot ? 'Syncing HubSpot...' : 'Sync HubSpot Inbox'}
          </button>
          <button 
            onClick={() => handleAIAction('analyzeInbox')}
            className="flex items-center bg-blue-900 text-white px-4 py-2 rounded-lg hover:bg-blue-950 dark:hover:bg-blue-800 transition disabled:opacity-50 font-bold text-sm shadow-sm"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Analyze & Score Inbox
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50">
          <p className="font-bold text-black dark:text-white">Mailbox (IMAP)</p>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Auto sync: {String(config.imapAutoSyncEnabled) === 'true' ? `On every ${config.imapAutoSyncMinutes || '10'} min` : 'Off'} · Startup sync: {String(config.imapSyncOnStartup) === 'true' ? 'On' : 'Off'}
          </p>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">
            {inboxSyncStatus.imap.lastRunAt
              ? `Last sync: ${new Date(inboxSyncStatus.imap.lastRunAt).toLocaleString()} · Imported ${inboxSyncStatus.imap.fetchedCount}`
              : 'No IMAP sync yet.'}
          </p>
          {inboxSyncStatus.imap.error && (
            <p className="text-blue-700 dark:text-blue-400 mt-1">{inboxSyncStatus.imap.error}</p>
          )}
        </div>
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50">
          <p className="font-bold text-black dark:text-white">HubSpot Inbox</p>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">
            {inboxSyncStatus.hubspot.lastRunAt
              ? `Last sync: ${new Date(inboxSyncStatus.hubspot.lastRunAt).toLocaleString()} · Imported ${inboxSyncStatus.hubspot.fetchedCount}`
              : 'No HubSpot inbox sync yet.'}
          </p>
          {inboxSyncStatus.hubspot.error && (
            <p className="text-blue-700 dark:text-blue-400 mt-1">{inboxSyncStatus.hubspot.error}</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-r from-amber-50 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-bold text-black dark:text-white">Bulk Triage</h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 max-w-2xl">
              Work the hottest replies first, convert the best opportunities into follow-up tasks, and clear low-priority noise without losing context.
            </p>
            <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px]">
              <span className="px-2.5 py-1 rounded-full border bg-blue-100 border-blue-200 text-blue-900 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300 font-bold">
                Hot Leads: {urgentInboxCandidates.length}
              </span>
              <span className="px-2.5 py-1 rounded-full border bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300 font-bold">
                Low Priority: {lowPriorityInboxCandidates.length}
              </span>
              <span className="px-2.5 py-1 rounded-full border bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 font-bold">
                Unscored: {unscoredActionableInboxCount}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap lg:justify-end">
            <button
              onClick={openTopUrgentInboxReplies}
              disabled={loading || urgentInboxCandidates.length === 0}
              className="flex items-center bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50 font-bold text-sm shadow-sm"
              title="Open the top urgent replies in Outreach queue"
            >
              <Zap className="w-4 h-4 mr-2" />
              Open Top 3 Urgent
            </button>
            <button
              onClick={createTasksFromHottestInboxEmails}
              disabled={loading || urgentInboxCandidates.length === 0}
              className="flex items-center bg-amber-500 text-black px-4 py-2 rounded-lg hover:bg-amber-400 transition disabled:opacity-50 font-bold text-sm shadow-sm"
              title="Create follow-up tasks from the hottest scored inbox leads"
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Create Tasks From Hottest
            </button>
            <button
              onClick={markLowPriorityInboxHandled}
              disabled={loading || lowPriorityInboxCandidates.length === 0}
              className="flex items-center bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 px-4 py-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-50 font-bold text-sm shadow-sm"
              title="Mark low-score inbox emails handled so the team can focus on real opportunities"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark Low-Score Handled
            </button>
          </div>
        </div>
      </div>

      {/* Inbox Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={inboxSearch}
            onChange={(e) => setInboxSearch(e.target.value)}
            placeholder="Search by sender, subject, or company..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-900 text-black dark:text-white transition-colors"
          />
        </div>
        <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          {[
            { id: 'all', label: 'All' },
            { id: 'unread', label: 'Unread' },
            { id: 'needsResponse', label: 'Needs Response' },
            { id: 'archived', label: 'Archived' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setInboxFilter(f.id)}
              className={`px-4 py-2 text-xs font-bold transition-colors ${inboxFilter === f.id ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors">
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {filteredInboxEmails.map((email) => {
            const relationshipState = buildOutreachRelationshipState({
              email: email.fromEmail,
              name: email.fromName,
              company: email.company,
              inboxEmail: email
            });
            const contactActionPlan = relationshipState.matchedContact
              ? getContactActionPlan(relationshipState.matchedContact, relationshipState.attention)
              : null;
            const inboxPrimaryAction = contactActionPlan?.primaryAction || {
              key: 'review-crm-draft',
              label: 'Review CRM draft',
              detail: 'Create a CRM record before this thread loses shared context across inbox, CRM, and outreach.'
            };
            const inboxActionReasons = contactActionPlan?.actionReasons?.slice(0, 3) || [
              'No CRM record',
              Number(email.aiScore || 0) >= 70 ? 'High-intent inbox signal' : 'Shared context missing'
            ];

            return (
            <div key={email.id} className={`p-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${email.isRead ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {!email.isRead && <span className="w-2 h-2 bg-blue-900 dark:bg-blue-500 rounded-full flex-shrink-0"></span>}
                    <h4 className="text-sm font-bold text-black dark:text-white truncate">{email.fromName} <span className="text-zinc-500 font-normal">({email.company})</span></h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide ${getInboxSourceBadgeClasses(email.source)}`}>
                      {email.source || 'manual'}
                    </span>
                  </div>
                  <h5 className="text-md font-bold text-blue-900 dark:text-blue-500 mt-1">{email.subject}</h5>
                </div>
                <div className="flex flex-col items-end ml-4">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">{email.date}</span>
                  {email.aiScore !== null && (
                    <div className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      email.aiScore >= 80 ? 'bg-blue-100 border-blue-200 text-blue-900 dark:bg-blue-900/30 dark:border-blue-900 dark:text-blue-400' : 
                      email.aiScore >= 40 ? 'bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-900 dark:text-amber-400' : 
                      'bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400'
                    }`}>
                      Score: {email.aiScore}/100
                    </div>
                  )}
                </div>
              </div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-4 line-clamp-2">{email.body}</p>
              
              {email.aiSummary && (
                <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-lg flex items-start">
                  <Sparkles className="w-4 h-4 mr-2 text-blue-900 dark:text-blue-600 shrink-0 mt-0.5" />
                  <span className="text-sm text-zinc-800 dark:text-zinc-200 font-medium">AI Summary: {email.aiSummary}</span>
                </div>
              )}

              <div className="mb-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">CRM Link & Next Best Action</p>
                    {relationshipState.matchedContact ? (
                      <>
                        <p className="mt-1 text-sm font-bold text-black dark:text-white">{relationshipState.matchedContact.name} · {relationshipState.matchedContact.stage}</p>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{relationshipState.matchedContact.company || email.company || 'Unknown company'} · Open tasks: {relationshipState.attention?.openTasksCount || 0}</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-sm font-bold text-black dark:text-white">No CRM contact yet</p>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Create this sender as a CRM record so Inbox, outreach, and tasks share the same account context.</p>
                      </>
                    )}
                    <p className="mt-2 text-xs font-bold text-black dark:text-white">{inboxPrimaryAction.label}</p>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 max-w-xl">{inboxPrimaryAction.detail}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => runInboxPrimaryAction(email, relationshipState)}
                      className="text-xs bg-black dark:bg-white text-white dark:text-black px-3 py-2 rounded font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
                    >
                      {inboxPrimaryAction.label}
                    </button>
                    <button
                      onClick={() => openOrCreateContactFromInboxEmail(email)}
                      className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white px-3 py-2 rounded font-bold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition"
                    >
                      {relationshipState.matchedContact ? 'Open CRM' : 'Review CRM'}
                    </button>
                    <button
                      onClick={() => addFollowUpTaskFromInboxEmail(email)}
                      className="text-xs bg-amber-400 text-black px-3 py-2 rounded font-bold hover:bg-amber-300 transition"
                    >
                      Add Task
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {inboxActionReasons.map((reason) => (
                    <span key={`${email.id}-${reason}`} className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {reason}
                    </span>
                  ))}
                </div>
                {relationshipState.matchedContact && relationshipState.matchedContact.nextStep && (
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">Next step: {relationshipState.matchedContact.nextStep}</p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                    <button 
                      onClick={() => prepareComposerFromInboxEmail(email)}
                      disabled={!canReplyToInboxEmail(email)}
                      className="text-xs bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50"
                      title={canReplyToInboxEmail(email) ? 'Load this email into Outreach' : 'This email does not include a valid sender address'}
                    >
                      Use in Outreach
                    </button>
                    <button
                      onClick={() => handleAIAction('replyFromInbox', { inboxEmail: email })}
                      disabled={!canReplyToInboxEmail(email)}
                      className="text-xs bg-blue-900 text-white px-4 py-2 rounded font-bold hover:bg-blue-950 dark:hover:bg-blue-800 transition disabled:opacity-50"
                      title={canReplyToInboxEmail(email) ? 'Generate an AI reply for this email and open it in Outreach' : 'This email does not include a valid sender address'}
                    >
                      AI Reply
                    </button>
                    <button
                      onClick={() => handleAnalyzeInboxEmail(email)}
                      className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                      title="Analyze this email with sales and marketing psychology"
                    >
                      AI Insight
                    </button>
                <button
                  onClick={() => toggleInboxRead(email.id)}
                  className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-3 py-2 rounded font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition flex items-center"
                  title={email.isRead ? 'Mark unread' : 'Mark read'}
                >
                  {email.isRead ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                  {email.isRead ? 'Unread' : 'Read'}
                </button>
                <button
                  onClick={() => toggleInboxNeedsResponse(email.id)}
                  className={`text-xs px-3 py-2 rounded font-medium transition flex items-center ${email.needsResponse ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-400 hover:bg-amber-200' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                >
                  <Star className="w-3 h-3 mr-1" />
                  {email.needsResponse ? 'Flagged' : 'Flag'}
                </button>
                <button
                  onClick={() => toggleInboxArchived(email.id)}
                  className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-3 py-2 rounded font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition flex items-center"
                >
                  <Archive className="w-3 h-3 mr-1" />
                  {email.isArchived ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  onClick={() => deleteInboxEmail(email.id)}
                  className="text-xs text-zinc-400 hover:text-red-600 dark:hover:text-red-400 px-2 py-2 rounded transition"
                  title="Delete email"
                  aria-label="Delete email"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )})}
          {filteredInboxEmails.length === 0 && (
            <div className="p-12 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40">
              <Inbox className="w-8 h-8 mx-auto mb-3 text-zinc-400" />
              <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                {inboxSearch ? 'No emails match your search' : inboxFilter === 'archived' ? 'No archived emails' : 'Inbox is empty'}
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                {inboxSearch
                  ? 'Try a different sender, subject, or company keyword.'
                  : inboxFilter === 'archived'
                    ? 'Archived messages will show up here after you clear or archive them.'
                    : 'Sync IMAP or HubSpot in Settings, then pull mail with Sync Inbox to start scoring leads.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderContacts = () => (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white transition-colors">CRM & Contacts</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Track deal value, next steps, ownership, and follow-up timing instead of keeping your CRM as a simple address book.</p>
        </div>
        <div className="flex space-x-3 flex-wrap">
          <button 
            onClick={openAddContact}
            className="flex items-center bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition font-bold text-sm shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </button>
          <label className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer font-medium text-sm">
            <UploadCloud className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
            Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} disabled={loading} />
          </label>
          <button 
            onClick={handleHubSpotSync}
            disabled={loading}
            className="flex items-center bg-blue-900 text-white px-4 py-2 rounded-lg hover:bg-blue-950 dark:hover:bg-blue-800 transition disabled:opacity-50 font-medium text-sm shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Sync from HubSpot
          </button>
          <button 
            onClick={() => handleAIAction('crmWorkspace')}
            disabled={normalizedContacts.length === 0}
            className="flex items-center bg-amber-400 text-black px-4 py-2 rounded-lg hover:bg-amber-300 transition disabled:opacity-50 font-bold text-sm shadow-sm"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            AI CRM Review
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <p className="text-zinc-500 dark:text-zinc-400">Pipeline Value</p>
          <p className="mt-2 text-xl font-bold text-black dark:text-white">{formatCurrencyCompact(crmOverview.pipelineValue)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <p className="text-zinc-500 dark:text-zinc-400">Follow-Ups Due</p>
          <p className="mt-2 text-xl font-bold text-amber-600 dark:text-amber-400">{crmOverview.followUpsDueCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <p className="text-zinc-500 dark:text-zinc-400">Hot Contacts</p>
          <p className="mt-2 text-xl font-bold text-blue-900 dark:text-blue-400">{crmOverview.hotContactsCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <p className="text-zinc-500 dark:text-zinc-400">Open Pipeline</p>
          <p className="mt-2 text-xl font-bold text-black dark:text-white">{crmOverview.openPipelineCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <p className="text-zinc-500 dark:text-zinc-400">Stale Contacts</p>
          <p className="mt-2 text-xl font-bold text-zinc-700 dark:text-zinc-300">{crmOverview.staleContactsCount}</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-bold text-black dark:text-white">Pipeline Board</h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 max-w-2xl">
              Drag accounts across stages to keep the forecast honest. Each column rolls up live value and stage-weighted revenue automatically.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs lg:min-w-[18rem]">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3">
              <p className="text-zinc-500 dark:text-zinc-400">Board Total</p>
              <p className="mt-2 text-lg font-bold text-black dark:text-white">{formatCurrencyCompact(pipelineOverview.totalValue)}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3">
              <p className="text-zinc-500 dark:text-zinc-400">Weighted Forecast</p>
              <p className="mt-2 text-lg font-bold text-amber-600 dark:text-amber-400">{formatCurrencyCompact(pipelineOverview.weightedForecast)}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          {pipelineOverview.stages.map((stageGroup) => (
            <div
              key={stageGroup.stage}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const draggedContact = normalizedContacts.find((contact) => normalizeEmail(contact.email) === draggedPipelineContactEmail);
                if (draggedContact) {
                  void moveContactToStage(draggedContact, stageGroup.stage);
                }
              }}
              className={`rounded-xl border p-3 flex flex-col min-h-[18rem] ${draggedPipelineContactEmail ? 'border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-900/10' : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-black dark:text-white">{stageGroup.stage}</h4>
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{stageGroup.itemCount} account{stageGroup.itemCount === 1 ? '' : 's'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-black dark:text-white">{formatCurrencyCompact(stageGroup.totalValue)}</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Weighted {formatCurrencyCompact(stageGroup.weightedValue)}</p>
                </div>
              </div>

              <div className="mt-3 space-y-3 overflow-y-auto max-h-[26rem] pr-1">
                {stageGroup.contacts.map((contact) => {
                  const attention = contactAttentionMap.get(contact.email || contact.id);
                  const isDragging = draggedPipelineContactEmail === normalizeEmail(contact.email || '');

                  return (
                    <div
                      key={contact.email || contact.id}
                      draggable={Boolean(contact.email)}
                      onDragStart={() => setDraggedPipelineContactEmail(normalizeEmail(contact.email || ''))}
                      onDragEnd={() => setDraggedPipelineContactEmail('')}
                      className={`rounded-xl border p-3 shadow-sm cursor-grab active:cursor-grabbing transition ${isDragging ? 'opacity-50 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-black dark:text-white">{contact.name}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">{contact.company || 'Unknown company'}</p>
                        </div>
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold border bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
                          {formatCurrencyCompact(contact.estimatedValue)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-3">
                        {contact.timelineSummary || contact.nextStep || contact.aiSummary || 'No active relationship pulse recorded yet.'}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-zinc-500 dark:text-zinc-400">P{contact.priorityScore || 50} · {attention?.openTasksCount || 0} open</span>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            openDossier(contact);
                          }}
                          className="font-bold text-blue-900 dark:text-blue-500 hover:text-black dark:hover:text-white transition"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  );
                })}
                {stageGroup.contacts.length === 0 && (
                  <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-4 text-sm text-zinc-500 dark:text-zinc-400">
                    Drop accounts here to move them into {stageGroup.stage.toLowerCase()}.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-r from-zinc-50 via-white to-amber-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-bold text-black dark:text-white">Attention Queue</h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 max-w-2xl">These are the accounts most likely to need action because of deal value, timing, follow-up debt, or open work.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full lg:w-auto">
            {crmOverview.attentionContacts.map((item) => {
              const actionPlan = getContactActionPlan(item.contact, item);
              const showOpenDossierButton = !isReviewDossierAction(actionPlan);

              return (
              <div
                key={item.contact.email || item.contact.id}
                className="text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/70 hover:border-amber-400 dark:hover:border-amber-500 transition"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-black dark:text-white">{item.contact.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.contact.company || 'Unknown company'} · {item.contact.stage}</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full font-bold border bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-900 dark:text-amber-300">{item.urgencyScore}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300 line-clamp-2">{item.contact.nextStep || item.contact.aiSummary || 'Needs a defined next step.'}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {actionPlan.actionReasons.slice(0, 3).map((reason) => (
                    <span key={`${item.contact.email || item.contact.id}-${reason}`} className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {reason}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={(event) => runContactPrimaryAction(item.contact, item, event)}
                    className="text-xs bg-black dark:bg-white text-white dark:text-black px-3 py-2 rounded font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
                  >
                    {actionPlan.primaryAction.label}
                  </button>
                  {showOpenDossierButton && (
                    <button
                      onClick={() => openDossier(item.contact)}
                      className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white px-3 py-2 rounded font-bold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition"
                    >
                      Open Dossier
                    </button>
                  )}
                </div>
              </div>
            )})}
          </div>
        </div>
      </div>
      
      {/* Stage Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-zinc-400" />
        {['all', ...CONTACT_STAGE_OPTIONS].map(stage => (
          <button
            key={stage}
            onClick={() => setContactStageFilter(stage)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${contactStageFilter === stage ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
          >
            {stage === 'all' ? 'All Stages' : stage}
          </button>
        ))}
        <div className="relative flex-1 min-w-[140px] max-w-sm ml-auto">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={contactSearchQuery}
            onChange={(e) => setContactSearchQuery(e.target.value)}
            placeholder="Search company, owner, next step..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-900 text-black dark:text-white transition-colors"
          />
        </div>
        {contactStageFilter !== 'all' && (
          <span className="text-xs text-zinc-500 ml-2">{filteredContacts.length} of {contacts.length} contacts</span>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-x-auto transition-colors">
        <table className="w-full text-left border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-zinc-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 text-sm border-b border-zinc-200 dark:border-zinc-800">
              <th className="p-4 font-medium text-black dark:text-white">Name</th>
              <th className="p-4 font-medium text-black dark:text-white">Account</th>
              <th className="p-4 font-medium text-black dark:text-white">Flow</th>
              <th className="p-4 font-medium text-black dark:text-white">Value & Owner</th>
              <th className="p-4 font-medium text-right text-black dark:text-white">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredContacts.map(contact => {
              const attention = contactAttentionMap.get(contact.email || contact.id);
              const actionPlan = getContactActionPlan(contact, attention);
              const showViewButton = !isReviewDossierAction(actionPlan);
              return (
              <tr key={contact.id || contact.email} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer" onClick={() => openDossier(contact)}>
                <td className="p-4 text-sm text-zinc-600 dark:text-zinc-300">
                  <div className="font-bold text-black dark:text-white">{contact.name}</div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-wide font-bold">
                    <span className="px-2 py-0.5 rounded-full bg-black dark:bg-white text-white dark:text-black">{contact.stage}</span>
                    <span className={`px-2 py-0.5 rounded-full ${contact.leadTemperature === 'Hot' ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-300' : contact.leadTemperature === 'Warm' ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'}`}>{contact.leadTemperature}</span>
                    {contact.source && <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{contact.source}</span>}
                  </div>
                </td>
                <td className="p-4 text-sm text-zinc-600 dark:text-zinc-300">
                  {contact.jobTitle && <span className="block text-xs font-bold text-zinc-500 dark:text-zinc-400">{contact.jobTitle}</span>}
                  <span className="block font-medium text-black dark:text-white">{contact.company || 'Unknown company'}</span>
                  <span className="block text-xs mt-1">{contact.email}</span>
                  {contact.phone && <span className="flex items-center text-xs mt-1 text-zinc-500 dark:text-zinc-400"><Phone className="w-3 h-3 mr-1" /> {contact.phone}</span>}
                </td>
                <td className="p-4 text-sm">
                  <div className="space-y-2">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">Next step</div>
                    <div className="text-sm font-medium text-black dark:text-white line-clamp-2">{contact.nextStep || 'No next step defined yet.'}</div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>Follow-up: {formatFriendlyDate(contact.nextFollowUpAt)}</span>
                      <span>Open tasks: {attention?.openTasksCount || 0}</span>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/40">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Next best action</div>
                      <div className="mt-1 text-xs font-bold text-black dark:text-white">{actionPlan.primaryAction.label}</div>
                      <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{actionPlan.primaryAction.detail}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {actionPlan.actionReasons.slice(0, 3).map((reason) => (
                        <span key={`${contact.email || contact.id}-${reason}`} className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                </td>
                <td className="p-4 text-sm text-zinc-600 dark:text-zinc-300">
                  <div className="font-bold text-black dark:text-white">{formatCurrencyCompact(contact.estimatedValue)}</div>
                  <div className="text-xs mt-1">Owner: {contact.owner || 'Unassigned'}</div>
                  <div className="text-xs mt-1">Priority: {contact.priorityScore || 50}</div>
                </td>
                <td className="p-4 text-sm text-right">
                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={(event) => runContactPrimaryAction(contact, attention, event)}
                      className="text-xs bg-black dark:bg-white text-white dark:text-black px-3 py-2 rounded font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
                    >
                      {actionPlan.primaryAction.label}
                    </button>
                    <div className="flex items-center justify-end space-x-2">
                      <button onClick={(e) => openEditContact(contact, e)} className="p-1.5 text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 rounded transition" title="Edit Contact">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setContactToDelete(contact); }} className="p-1.5 text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 bg-zinc-100 dark:bg-zinc-800 rounded transition" title="Delete Contact" aria-label="Delete contact">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); createTaskForContact(contact); }} className="p-1.5 text-zinc-500 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-400 bg-zinc-100 dark:bg-zinc-800 rounded transition" title="Create follow-up task">
                        <CheckSquare className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleAIAction('aiContactPlan', { contact }); }} className="p-1.5 text-zinc-500 hover:text-blue-900 dark:text-zinc-400 dark:hover:text-blue-400 bg-zinc-100 dark:bg-zinc-800 rounded transition disabled:opacity-50" title="Create AI contact plan">
                        <Sparkles className="w-4 h-4" />
                      </button>
                      {contact.stage === 'Proposal' && (
                        <button onClick={(e) => { e.stopPropagation(); handleAIAction('proposalFollowUp', { contact }); }} className="p-1.5 text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 rounded transition disabled:opacity-50" title="Draft proposal follow-up">
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                      {showViewButton && (
                        <button onClick={(e) => { e.stopPropagation(); openDossier(contact); }} className="text-blue-900 dark:text-blue-500 hover:text-black dark:hover:text-white font-bold text-sm flex items-center ml-2 transition-colors">
                          View <ChevronRight className="w-4 h-4 ml-0.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )})}
            {filteredContacts.length === 0 && (
               <tr>
                 <td colSpan="5" className="p-10 text-center">
                   <Users className="w-8 h-8 mx-auto mb-3 text-zinc-400" />
                   <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                     {contactStageFilter !== 'all' ? `No contacts in “${contactStageFilter}”` : 'No contacts yet'}
                   </p>
                   <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                     {contactStageFilter !== 'all'
                       ? 'Switch stage filter to All, or move contacts into this stage from the pipeline board.'
                       : 'Sync HubSpot, import a CSV, or add a contact manually to start building your pipeline.'}
                   </p>
                 </td>
               </tr>
            )}
          </tbody>
        </table>
      </div>

      {crmWorkspaceInsight && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-black dark:text-white flex items-center"><Sparkles className="w-4 h-4 mr-2 text-blue-900 dark:text-blue-500" /> AI CRM Guidance</h3>
          <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{crmWorkspaceInsight}</p>
        </div>
      )}
    </div>
  );

  const renderOutreach = () => (
    <div className="flex min-h-full w-full max-w-7xl mx-auto flex-col xl:h-full xl:flex-row">
      {/* Thread/Context Sidebar */}
      <div className="w-full xl:w-[34%] 2xl:w-[30%] border-b xl:border-b-0 xl:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex min-h-0 flex-col overflow-hidden transition-colors max-h-[45vh] xl:max-h-full">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex justify-between items-center transition-colors">
          <h3 className="font-semibold text-black dark:text-white flex items-center">
            <SlidersHorizontal className="w-4 h-4 mr-2 text-zinc-500 dark:text-zinc-400" />
            AI Strategy Settings
          </h3>
        </div>
        
        <div className="p-4 flex-1 min-h-0 overflow-y-auto space-y-6">
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Inbox Email Selector</span>
                <button
                  type="button"
                  onClick={clearWorkspace}
                  className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-3 py-2 rounded-lg font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                >
                  Clear Workspace
                </button>
              </div>
              <select
                value={selectedInboxEmail?.id || ''}
                onChange={(e) => {
                  const email = inboxEmails.find(item => item.id === e.target.value);
                  if (email) selectInboxEmailForOutreach(email);
                }}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-900 focus:border-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
              >
                <option value="">Choose a recent inbox email...</option>
                {inboxEmails.filter(item => !item.isArchived && canReplyToInboxEmail(item)).slice(0, 8).map((email) => (
                  <option key={email.id} value={email.id}>
                    {`${email.fromName || email.fromEmail} — ${email.subject}`.slice(0, 80)}
                  </option>
                ))}
              </select>
              {selectedInboxEmail && (
                <div className="mt-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 text-xs text-zinc-800 dark:text-zinc-200">
                  <div className="font-semibold truncate">{selectedInboxEmail.fromName || selectedInboxEmail.fromEmail}</div>
                  <div className="truncate">{selectedInboxEmail.subject}</div>
                  <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{selectedInboxEmail.date}</div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-4 space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Outreach Play</span>
                  {recommendedOutreachStrategy.playbookId && selectedPlaybook?.id !== recommendedOutreachStrategy.playbookId && (
                    <button
                      type="button"
                      onClick={() => setComposerState((prev) => ({
                        ...prev,
                        selectedPlaybookId: recommendedOutreachStrategy.playbookId,
                        sequenceCadenceId: recommendedOutreachStrategy.cadenceId || prev.sequenceCadenceId || DEFAULT_SEQUENCE_CADENCE_ID
                      }))}
                      className="text-[11px] font-bold text-blue-900 dark:text-blue-400 hover:underline"
                    >
                      Use Recommended
                    </button>
                  )}
                </div>
                <select
                  name="selectedPlaybookId"
                  value={composerState.selectedPlaybookId}
                  onChange={handleComposerChange}
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-900 focus:border-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                >
                  <option value="">Auto-select based on CRM stage</option>
                  {OUTREACH_PLAYBOOKS.map((playbook) => (
                    <option key={playbook.id} value={playbook.id}>{playbook.label}</option>
                  ))}
                </select>
                {(selectedPlaybook || recommendedOutreachStrategy.playbookId) && (
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    {(selectedPlaybook || OUTREACH_PLAYBOOKS.find((playbook) => playbook.id === recommendedOutreachStrategy.playbookId))?.description}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">Cadence</label>
                  <select
                    name="sequenceCadenceId"
                    value={composerState.sequenceCadenceId}
                    onChange={handleComposerChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-900 focus:border-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    {SEQUENCE_CADENCE_OPTIONS.map((cadence) => (
                      <option key={cadence.id} value={cadence.id}>{cadence.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">Sequence Steps</label>
                  <select
                    name="sequenceStepCount"
                    value={composerState.sequenceStepCount}
                    onChange={handleComposerChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-900 focus:border-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    {[2, 3, 4, 5].map((count) => (
                      <option key={count} value={count}>{count} steps</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 text-xs text-zinc-700 dark:text-zinc-300">
                <div className="font-bold text-black dark:text-white">Current cadence: {selectedSequenceCadence.label}</div>
                <div className="mt-1 leading-relaxed">{selectedSequenceCadence.description}</div>
                <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {selectedSequenceCadence.delays.map((delay, index) => `Step ${index + 1}: day ${delay}`).join(' | ')}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2">Tone</label>
                <select 
                  name="tone"
                  value={composerState.tone}
                  onChange={handleComposerChange}
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-900 focus:border-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                >
                  <option value="Professional">Professional</option>
                  <option value="Persuasive">Persuasive</option>
                  <option value="Friendly">Friendly</option>
                  <option value="Direct">Direct & Urgent</option>
                  <option value="Consultative">Consultative</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2">Length</label>
                <select 
                  name="length"
                  value={composerState.length}
                  onChange={handleComposerChange}
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-900 focus:border-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                >
                  <option value="Concise">Concise (Short)</option>
                  <option value="Standard">Standard</option>
                  <option value="Detailed">Detailed</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2">Thread History Context</label>
            <textarea
              name="threadHistory"
              value={composerState.threadHistory}
              onChange={handleComposerChange}
              rows="4"
              className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-900 bg-zinc-50 dark:bg-zinc-950/50 outline-none text-zinc-800 dark:text-zinc-200 transition-colors"
              placeholder="Paste previous emails here to provide context..."
            ></textarea>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button 
              onClick={() => handleAIAction('coach')}
              disabled={!composerState.recipientName && !composerState.threadHistory}
              className="flex items-center justify-center w-full bg-blue-900 border border-blue-950 text-white px-4 py-2 rounded-lg hover:bg-blue-800 transition text-sm font-bold shadow-sm disabled:opacity-50"
            >
              <Briefcase className="w-4 h-4 mr-2" />
              Ask Director For Strategy
            </button>
            
            {/* Objection Crusher */}
            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 transition-colors">
              <label className="block text-xs font-bold text-blue-900 dark:text-blue-500 uppercase tracking-wider mb-2 flex items-center">
                <ShieldAlert className="w-3 h-3 mr-1" /> Objection Crusher
              </label>
              <input 
                type="text"
                name="objection"
                value={composerState.objection}
                onChange={handleComposerChange}
                placeholder="E.g., It's too expensive..."
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 mb-2 transition-colors"
              />
              <button 
                onClick={() => handleAIAction('objection')}
                disabled={!composerState.objection}
                className="flex items-center justify-center w-full bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition text-xs font-bold disabled:opacity-50"
              >
                Crush Objection
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 transition-colors">
              <button 
                onClick={() => handleAIAction('summarize')}
                className="flex items-center justify-center w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition text-xs font-medium"
              >
                <ListChecks className="w-4 h-4 mr-1 text-zinc-500 dark:text-zinc-400" />
                Summarize Context
              </button>
              <button 
                onClick={() => handleAIAction('analyze')}
                disabled={!composerState.body}
                className="flex items-center justify-center w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition text-xs font-medium disabled:opacity-50"
              >
                <Activity className="w-4 h-4 mr-1 text-zinc-500 dark:text-zinc-400" />
                Analyze Draft
              </button>
            </div>
          </div>

          {composerState.aiContext && (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm mt-4 transition-colors">
              <h4 className="text-xs font-bold text-black dark:text-white uppercase mb-2 flex items-center">
                <TrendingUp className="w-4 h-4 mr-1 text-blue-900 dark:text-blue-600" /> Director's Insight
              </h4>
              <p className="text-sm text-zinc-800 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {composerState.aiContext}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Main Composer Area */}
      <div className="w-full xl:w-[66%] 2xl:w-[70%] flex flex-col bg-zinc-50 dark:bg-zinc-950 transition-colors min-h-0 flex-1">
        <div className="p-6 flex-1 min-h-0 flex flex-col">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col min-h-0 xl:h-full overflow-hidden transition-colors">
            {selectedInboxEmail && (
              <div className="border-b border-zinc-200 dark:border-zinc-800 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">Working From</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide ${getInboxSourceBadgeClasses(selectedInboxEmail.source)}`}>
                        {selectedInboxEmail.source || 'manual'}
                      </span>
                      {urgentQueueLabel && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide bg-black text-white border-black dark:bg-white dark:text-black dark:border-white">
                          Queue {urgentQueueLabel}
                        </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide ${selectedInboxEmail.needsResponse ? 'bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300' : 'bg-emerald-100 border-emerald-200 text-emerald-900 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300'}`}>
                        {selectedInboxStatusLabel}
                      </span>
                      {selectedInboxEmail.isArchived && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-bold text-black dark:text-white truncate">{selectedInboxEmail.subject}</p>
                    <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300 truncate">
                      Reply target: {selectedInboxEmail.fromName || selectedInboxEmail.fromEmail}
                      {selectedInboxEmail.fromEmail ? ` <${selectedInboxEmail.fromEmail}>` : ''}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      {selectedInboxEmail.date} · {selectedInboxEmail.company || formatCompanyFromEmail(selectedInboxEmail.fromEmail)}
                    </p>
                    {!selectedInboxMatchesComposer && (
                      <p className="mt-2 text-xs text-blue-700 dark:text-blue-400">
                        The current recipient no longer matches the selected inbox source. Open the source again before using Send & Mark Handled.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {urgentQueueLabel && (
                      <button
                        type="button"
                        onClick={openNextUrgentInboxReply}
                        className="text-xs bg-amber-500 text-black px-3 py-2 rounded-lg font-bold hover:bg-amber-400 transition flex items-center"
                      >
                        <ChevronRight className="w-3 h-3 mr-1" />
                        {hasMoreUrgentReplies ? 'Next Urgent Reply' : 'Finish Queue'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={changeInboxSource}
                      className="text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 px-3 py-2 rounded-lg font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition flex items-center"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Change Source
                    </button>
                    <button
                      type="button"
                      onClick={openSelectedInboxEmailInInbox}
                      className="text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 px-3 py-2 rounded-lg font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition flex items-center"
                    >
                      <Inbox className="w-3 h-3 mr-1" />
                      Open Original
                    </button>
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={archiveSelectedInboxAfterSend}
                    onChange={(e) => setArchiveSelectedInboxAfterSend(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-blue-900 focus:ring-blue-900"
                  />
                  Archive original after send
                </label>
              </div>
            )}
            
            {/* Headers & Personalization */}
            <div className="border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 items-center bg-zinc-50 dark:bg-zinc-950/50">
                <span className="text-zinc-500 dark:text-zinc-400 w-24 text-xs font-bold uppercase">Personalize:</span>
                <input 
                  type="text" name="recipientName" value={composerState.recipientName} onChange={handleComposerChange}
                  className="w-1/4 bg-transparent outline-none text-xs text-black dark:text-white border-r border-zinc-200 dark:border-zinc-700 mr-3 pr-3 placeholder-zinc-400 dark:placeholder-zinc-600" 
                  placeholder="Name"
                />
                <input 
                  type="text" name="jobTitle" value={composerState.jobTitle} onChange={handleComposerChange}
                  className="w-1/4 bg-transparent outline-none text-xs text-black dark:text-white border-r border-zinc-200 dark:border-zinc-700 mr-3 pr-3 placeholder-zinc-400 dark:placeholder-zinc-600" 
                  placeholder="Job Title"
                />
                <input 
                  type="text" name="companyName" value={composerState.companyName} onChange={handleComposerChange}
                  className="flex-1 bg-transparent outline-none text-xs text-black dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600" 
                  placeholder="Company Name"
                />
              </div>

              <div className="flex px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 items-start">
                <span className="text-zinc-500 dark:text-zinc-400 w-20 text-sm font-bold">To:</span>
                <div className="flex-1">
                  <input 
                    type="text" name="to" value={composerState.to} onChange={handleComposerChange}
                    className="w-full outline-none text-sm text-black dark:text-white bg-transparent" 
                    placeholder="recipient@example.com"
                  />
                  {composerErrors.to && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{composerErrors.to}</p>}
                </div>
              </div>

              <div className="flex px-4 py-3 items-center relative">
                <span className="text-zinc-500 dark:text-zinc-400 w-20 text-sm font-bold">Subject:</span>
                <input 
                  type="text" name="subject" value={composerState.subject} onChange={handleComposerChange}
                  className="flex-1 outline-none text-sm font-bold text-black dark:text-white bg-transparent" 
                  placeholder="Your subject line"
                />
                <button 
                  onClick={() => handleAIAction('suggestSubjects')}
                  disabled={!composerState.body}
                  className="text-xs text-white hover:bg-blue-800 font-bold px-3 py-1.5 rounded bg-blue-900 disabled:opacity-50 transition"
                  title="Generate subject lines based on email body"
                >
                  Suggest Subjects
                </button>
              </div>
              
              {/* Suggested Subjects Dropdown */}
              {composerState.suggestedSubjects.length > 0 && (
                <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-2">
                  <span className="text-xs font-bold text-black dark:text-white py-1">Suggestions:</span>
                  {composerState.suggestedSubjects.map((sub, idx) => (
                    <button 
                      key={idx}
                      onClick={() => setComposerState(prev => ({ ...prev, subject: sub, suggestedSubjects: [] }))}
                      className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 px-2 py-1 rounded-md hover:border-black dark:hover:border-white transition truncate max-w-xs"
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              )}

              {composerState.sequenceSteps.length > 0 && (
                <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-xs font-bold text-black dark:text-white uppercase tracking-wide">Sequence Steps</span>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Load one step into Subject + Body or push the sequence into the planner.</span>
                      <button
                        onClick={createSequenceTasksFromComposer}
                        className="text-xs bg-amber-400 text-black px-3 py-1.5 rounded-md font-bold hover:bg-amber-300 transition"
                      >
                        Create Follow-Up Tasks
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2 lg:grid-cols-3">
                    {composerState.sequenceSteps.map((step) => (
                      <div
                        key={`sequence-step-${step.stepNumber}`}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Step {step.stepNumber}</p>
                            <p className="text-sm font-bold text-black dark:text-white">{step.stepTitle || `Step ${step.stepNumber}`}</p>
                          </div>
                          <span className="text-[10px] px-2 py-1 rounded-full border bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
                            {step.delayLabel || (step.stepNumber === 1 ? 'Send now' : '3 days')}
                          </span>
                        </div>
                        {step.goal && (
                          <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">Goal: {step.goal}</p>
                        )}
                        <p className="mt-2 text-xs font-medium text-blue-900 dark:text-blue-400 line-clamp-2">{step.subject}</p>
                        <button
                          onClick={() => loadSequenceStepToComposer(step)}
                          className="mt-3 text-xs bg-black dark:bg-zinc-800 text-white px-3 py-1.5 rounded-md font-bold hover:bg-zinc-800 dark:hover:bg-zinc-700 transition"
                          title={`${step.stepTitle}: ${step.subject}`}
                        >
                          Load Into Composer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Context + Draft Workspace */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center px-4 py-2 border-b border-zinc-800 bg-zinc-900 dark:bg-black flex-wrap gap-2">
                 <span className="text-xs text-zinc-500 uppercase font-bold mr-2">Merge Tags:</span>
                 <button onClick={() => insertMergeTag('[First Name]')} className="text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded transition">Name</button>
                 <button onClick={() => insertMergeTag('[Company Name]')} className="text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded transition">Company</button>
                 <button onClick={() => insertMergeTag('[Meeting Link]')} className="text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded transition">Link</button>
              </div>
              <div
                ref={outreachWorkspaceRef}
                style={{ '--outreach-context-width': `${outreachContextWidth}px` }}
                className="flex-1 min-h-0 grid grid-cols-1 2xl:[grid-template-columns:minmax(320px,var(--outreach-context-width))_12px_minmax(0,1fr)]"
              >
                <div className="flex flex-col border-b border-zinc-800 2xl:border-b-0 bg-zinc-900 dark:bg-black transition-colors min-h-0">
                  <div className="p-3 flex flex-col gap-3 flex-1 min-h-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-zinc-400">
                      <div className="flex items-center gap-2">
                        <Wand2 className="w-4 h-4 text-blue-900 dark:text-blue-600" />
                        <span>AI Context Workspace</span>
                      </div>
                      <span className="text-[11px] font-medium normal-case tracking-normal text-zinc-500">CRM research, follow-up strategy, and AI notes stay visible here while you draft.</span>
                    </div>
                    {(activeOutreachRelationshipState?.matchedContact || normalizeEmail(composerState.to || '')) && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                              {activeOutreachRelationshipState?.matchedContact ? 'Linked CRM Contact' : 'CRM Opportunity'}
                            </p>
                            {activeOutreachRelationshipState?.matchedContact ? (
                              <>
                                <p className="mt-1 text-sm font-bold text-white">{activeOutreachRelationshipState.matchedContact.name} · {activeOutreachRelationshipState.matchedContact.stage}</p>
                                <p className="mt-1 text-xs text-zinc-400">{activeOutreachRelationshipState.matchedContact.company || 'Unknown company'} · Next step: {activeOutreachRelationshipState.matchedContact.nextStep || 'Not defined yet'}</p>
                              </>
                            ) : (
                              <>
                                <p className="mt-1 text-sm font-bold text-white">No CRM contact linked to this draft yet</p>
                                <p className="mt-1 text-xs text-zinc-400">Create the recipient in CRM so outreach can inherit stage, value, next step, and follow-up timing.</p>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={injectCurrentRelationshipContext}
                              disabled={!activeOutreachRelationshipState?.context}
                              className="text-xs bg-zinc-800 text-zinc-100 px-3 py-1.5 rounded-md font-medium hover:bg-zinc-700 transition disabled:opacity-50"
                            >
                              Load CRM Snapshot
                            </button>
                            {activeOutreachRelationshipState?.matchedContact && (
                              <button
                                onClick={() => createTaskForContact(activeOutreachRelationshipState.matchedContact)}
                                className="text-xs bg-amber-400 text-black px-3 py-1.5 rounded-md font-bold hover:bg-amber-300 transition"
                              >
                                Add Task
                              </button>
                            )}
                            <button
                              onClick={openOrCreateOutreachContact}
                              className="text-xs bg-white text-black px-3 py-1.5 rounded-md font-bold hover:bg-zinc-200 transition"
                            >
                              {activeOutreachRelationshipState?.matchedContact ? 'Open CRM' : 'Create CRM Contact'}
                            </button>
                          </div>
                        </div>
                        {activeOutreachRelationshipState?.matchedContact && (
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 font-bold text-zinc-300">
                              Open tasks: {activeOutreachRelationshipState.attention?.openTasksCount || 0}
                            </span>
                            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 font-bold text-zinc-300">
                              Follow-up: {activeOutreachRelationshipState.matchedContact.nextFollowUpAt || 'Not set'}
                            </span>
                            {activeOutreachRelationshipState.attention?.followUpDue && (
                              <span className="rounded-full border border-amber-800 bg-amber-950/40 px-2 py-1 font-bold text-amber-300">
                                Follow-up due
                              </span>
                            )}
                            {activeOutreachRelationshipState.attention?.isStale && (
                              <span className="rounded-full border border-blue-800 bg-blue-950/40 px-2 py-1 font-bold text-blue-300">
                                Relationship is stale
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <textarea
                      name="aiContext"
                      value={composerState.aiContext}
                      onChange={handleComposerChange}
                      rows={7}
                      placeholder="Instruct AI or review CRM intelligence here. Example: Pitch our new CRM integration..."
                      className="w-full flex-1 min-h-[220px] 2xl:min-h-0 2xl:max-h-none resize-y 2xl:resize-none rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm leading-relaxed text-white outline-none transition placeholder-zinc-500 focus:border-zinc-600"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleAIAction('write');
                        }
                      }}
                    ></textarea>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-500">Press Ctrl/Cmd + Enter to draft from this context.</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button 
                          onClick={() => handleAIAction('polish')}
                          disabled={!composerState.body}
                          className="bg-zinc-800 text-zinc-100 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-zinc-700 transition disabled:opacity-50 flex items-center border border-zinc-700"
                          title="Polish Draft"
                        >
                          <Sparkles className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={() => handleAIAction('meeting')}
                          className="bg-zinc-800 text-zinc-100 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-zinc-700 transition disabled:opacity-50 flex items-center border border-zinc-700"
                          title="Schedule Meeting Script"
                        >
                          <Clock className="w-3 h-3 mr-1" /> Pitch Meeting
                        </button>
                        <button 
                          onClick={() => handleAIAction('sequence')}
                          className="bg-black dark:bg-zinc-800 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-700 transition disabled:opacity-50 shadow-sm flex items-center"
                        >
                          <Layers className="w-3 h-3 mr-1" /> Sequence
                        </button>
                        <button 
                          onClick={() => handleAIAction('write')}
                          className="bg-blue-900 text-white px-4 py-1.5 rounded-md text-sm font-bold hover:bg-blue-800 transition disabled:opacity-50 shadow-sm"
                        >
                          {aiQueueStatus.running ? 'Working...' : 'Draft'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="Resize AI context workspace"
                  onPointerDown={startOutreachSplitDrag}
                  onDoubleClick={resetOutreachContextWidth}
                  onKeyDown={handleOutreachSplitKeyDown}
                  className={`hidden 2xl:flex items-center justify-center border-x border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 text-zinc-400 dark:text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-col-resize focus:outline-none focus:bg-zinc-100 dark:focus:bg-zinc-900 ${isOutreachSplitDragging ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300' : ''}`}
                  title="Drag to resize the AI context workspace. Double-click to reset."
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                <div className="flex flex-col min-h-0 bg-white dark:bg-zinc-900 transition-colors">
                  <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex items-center justify-between gap-2 flex-wrap transition-colors">
                    <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Email Draft</span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Keep the AI context visible while composing. Drag the divider on wide screens to rebalance both panes.</span>
                  </div>
                  <textarea
                    name="body"
                    value={composerState.body}
                    onChange={handleComposerChange}
                    className="flex-1 w-full min-h-[320px] 2xl:min-h-0 p-6 outline-none text-black dark:text-white resize-none leading-relaxed text-sm bg-white dark:bg-zinc-900 transition-colors"
                    placeholder="Write your email, insert merge tags above, or instruct the AI..."
                  ></textarea>
                </div>
              </div>
            </div>

            {/* Footer / Actions */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex justify-between items-center gap-3 flex-wrap transition-colors">
              <div className="flex items-center gap-4">
                <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center font-bold">
                  <Server className="w-4 h-4 mr-1" />
                  SMTP: {config.smtpHost ? 'Configured' : 'Not Configured'}
                </div>
                {(composerState.body || composerState.subject) && (
                  <div className="text-xs text-green-600 dark:text-green-400 flex items-center font-medium">
                    <Save className="w-3 h-3 mr-1" />
                    Draft auto-saved
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button 
                  onClick={() => handleAIAction('preSendCheck')}
                  disabled={!composerState.body}
                  className="flex items-center bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white px-4 py-2 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-700 transition font-bold text-sm disabled:opacity-50"
                  title="AI will analyze your email for tone, clarity, and effectiveness before sending"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Pre-Send Check
                </button>
                {selectedInboxEmail && (
                  <button
                    onClick={() => handleSendEmail({ markHandled: true, archiveOriginal: archiveSelectedInboxAfterSend })}
                    disabled={sendDisabled || !selectedInboxMatchesComposer}
                    className="flex items-center bg-blue-900 text-white px-4 py-2 rounded-lg hover:bg-blue-800 transition font-bold text-sm disabled:opacity-50 shadow-sm"
                    title={selectedInboxMatchesComposer ? 'Send this reply and mark the source email handled' : 'Re-open the source email before marking it handled'}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Send & Mark Handled
                  </button>
                )}
                {selectedInboxEmail && (
                  <button
                    onClick={() => handleSendEmail({ markHandled: true, archiveOriginal: archiveSelectedInboxAfterSend, createFollowUpTask: true })}
                    disabled={sendDisabled || !selectedInboxMatchesComposer}
                    className="flex items-center bg-amber-500 text-black px-4 py-2 rounded-lg hover:bg-amber-400 transition font-bold text-sm disabled:opacity-50 shadow-sm"
                    title={selectedInboxMatchesComposer ? 'Send this reply, mark the source handled, and create a follow-up task' : 'Re-open the source email before using the follow-up workflow'}
                  >
                    <CalendarDays className="w-4 h-4 mr-2" />
                    Send, Handle & Follow-Up
                  </button>
                )}
                <button 
                  onClick={() => handleSendEmail()}
                  disabled={sendDisabled}
                  className={`flex items-center px-6 py-2 rounded-lg transition font-bold disabled:opacity-50 shadow-sm ${selectedInboxEmail ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white hover:bg-zinc-300 dark:hover:bg-zinc-700 text-sm' : 'bg-black dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200'}`}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {selectedInboxEmail ? 'Send Only' : 'Send Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => {
    const normalizedOAuthProvider = normalizeOAuthProvider(config.oauth2Provider);
    const normalizedImapAuthMethod = normalizeMailAuthMethod(config.imapAuthMethod);
    const normalizedSmtpAuthMethod = normalizeMailAuthMethod(config.smtpAuthMethod);
    const graphModeEnabled =
      String(config.useGraphApi) === 'true' &&
      normalizedOAuthProvider === 'microsoft';
    const selectedAiProvider = getSelectedAiProvider();
    const selectedAiRuntime = getAiProviderRuntime(selectedAiProvider);
    const selectedAiLabel = selectedAiRuntime.label;
    const selectedAiReady = selectedAiRuntime.ready;
    const selectedAiUsesProxy = selectedAiRuntime.usingProxy;
    const aiProviderStatuses = AI_PROVIDER_OPTIONS.map((option) => ({
      ...getAiProviderRuntime(option.value),
      testResult: aiProviderTestResults[option.value] || null
    }));
    const aiReadyCount = aiProviderStatuses.filter((provider) => provider.ready).length;
    const aiSupportedCount = aiProviderStatuses.filter((provider) => provider.supported).length;
    const aiLocalKeyCount = aiProviderStatuses.filter((provider) => provider.hasApiKey).length;
    const aiPassedCount = aiProviderStatuses.filter((provider) => provider.testResult?.status === 'passed').length;
    const hasSenderProfile = Boolean(
      String(config.senderName || '').trim()
      && isValidEmail(String(config.replyTo || config.smtpUser || '').trim())
    );
    const hasContactsLoaded = normalizedContacts.length > 0;
    const hasMailboxSetup = Boolean(
      graphModeEnabled
        ? (config.imapOAuth2ClientId && (config.imapUser || config.smtpUser))
        : (config.smtpHost && config.smtpUser && (
          normalizedSmtpAuthMethod === 'oauth2'
            ? imapOAuth2Status.authenticated
            : config.smtpPass
        ))
    );
    const firstRunSetupItems = [
      {
        label: 'Create or unlock your local database',
        ok: !IS_LOCAL_DEV_MODE || (localDbBackend === 'electron-encrypted-file' && localDbUnlocked),
        detail: !IS_LOCAL_DEV_MODE
          ? 'Cloud-backed mode is active, so local encrypted storage is optional.'
          : 'In Settings, enter a passphrase and click Create and Unlock.'
      },
      {
        label: 'Add your name and reply email',
        ok: hasSenderProfile,
        detail: 'Use Sender & Signature Details. Fill in Your Name and Reply-To Email Address.'
      },
      {
        label: 'Connect AI',
        ok: selectedAiReady,
        detail: selectedAiUsesProxy
          ? 'Add the Proxy Base URL. If your proxy uses a secret, enter that too.'
          : selectedAiProvider === 'openai_compatible'
            ? 'Choose Local / OpenAI-compatible, set base URL + model (desktop recommended for localhost).'
            : selectedAiProvider === 'openrouter'
              ? 'Choose OpenRouter, paste your OpenRouter key, and set a model id.'
              : 'Choose your AI provider and paste its API key in Settings.'
      },
      {
        label: 'Load contacts',
        ok: hasContactsLoaded,
        detail: 'Open CRM & Contacts and either import a CSV or click Sync HubSpot.'
      },
      {
        label: 'Optional: connect your mailbox',
        ok: hasMailboxSetup,
        detail: 'Only needed if you want Smart Inbox, IMAP, SMTP, or Graph mail sync.'
      }
    ];
    const requiredFirstRunCount = firstRunSetupItems.slice(0, 4).filter((item) => item.ok).length;
    const isFirstRunReady = requiredFirstRunCount === 4;

    const diagnostics = [
      {
        label: 'Auth Session',
        ok: Boolean(user),
        detail: user ? `Connected (${user.uid.slice(0, 8)}...)` : 'Not signed in yet'
      },
      {
        label: 'Local Encrypted DB',
        ok: !IS_LOCAL_DEV_MODE || (localDbBackend === 'electron-encrypted-file' && localDbUnlocked),
        detail: !IS_LOCAL_DEV_MODE
          ? 'Using Firebase-backed storage'
          : (localDbBackend !== 'electron-encrypted-file'
            ? 'Desktop runtime required for encrypted local database'
            : (localDbUnlocked
              ? `Unlocked and autosaving (${localDbBackend})`
              : (localDbHasEncryptedData ? `Locked - passphrase required (${localDbBackend})` : `Not initialized yet (${localDbBackend})`)))
      },
      {
        label: 'Proxy Mode',
        ok: Boolean(getApiBaseUrl()),
        detail: getApiBaseUrl() ? `Routing via ${getApiBaseUrl()}` : 'Not configured (direct API mode)'
      },
      {
        label: `${selectedAiLabel} AI Access`,
        ok: selectedAiReady,
        detail: selectedAiUsesProxy
          ? `Handled by proxy (${selectedAiLabel}) when configured server-side`
          : (selectedAiRuntime.hasApiKey
            ? (selectedAiRuntime.supported
              ? `Key loaded for this session via ${selectedAiRuntime.routeLabel}`
              : selectedAiRuntime.supportDetail)
            : `Missing ${selectedAiLabel} key`)
      },
      {
        label: 'AI Queue',
        ok: true,
        detail: aiQueueStatus.running
          ? `${aiQueueStatus.activeLabel || 'AI task'} running${aiQueueStatus.pendingCount ? `, ${aiQueueStatus.pendingCount} queued` : ''}`
          : 'Idle'
      },
      {
        label: 'HubSpot Integration',
        ok: Boolean(config.hubspotToken) || Boolean(getApiBaseUrl()),
        detail: getApiBaseUrl() ? 'Handled by proxy when configured server-side' : (config.hubspotToken ? 'Token configured' : 'Token missing')
      },
      {
        label: 'SMTP Readiness',
        ok: Boolean(config.smtpHost && config.smtpUser && (
          normalizedSmtpAuthMethod === 'oauth2'
            ? (normalizedImapAuthMethod === 'oauth2' && (
                normalizedOAuthProvider === 'google' ? config.googleOAuth2ClientId : config.imapOAuth2ClientId
              ))
            : (config.smtpPass)
        )) || (graphModeEnabled && config.imapOAuth2ClientId),
        detail: graphModeEnabled
          ? (config.imapOAuth2ClientId ? 'Sending via Graph API' : 'Graph API — Client ID missing')
          : (config.smtpHost && config.smtpUser
            ? (normalizedSmtpAuthMethod === 'oauth2'
              ? 'SMTP sending via OAuth2 token'
              : (config.smtpPass ? 'Host/user/password present' : 'Password missing'))
            : 'Missing required fields')
      },
      {
        label: 'IMAP Readiness',
        ok: Boolean(
          graphModeEnabled
            ? (config.imapOAuth2ClientId && (config.imapUser || config.smtpUser))
            : (config.imapHost && config.imapPort && (config.imapUser || config.smtpUser) && (
              normalizedImapAuthMethod === 'oauth2'
                ? (normalizedOAuthProvider === 'google' ? config.googleOAuth2ClientId : config.imapOAuth2ClientId)
                : (config.imapPass || config.smtpPass)
            ))
        ),
        detail: graphModeEnabled
          ? (config.imapOAuth2ClientId
            ? (imapOAuth2Status.authenticated ? `Graph API — signed in as ${imapOAuth2Status.user}` : 'Graph API configured — sign in required')
            : 'Graph API — Client ID missing')
          : (config.imapHost && config.imapPort
            ? ((config.imapUser || config.smtpUser)
              ? (normalizedImapAuthMethod === 'oauth2'
                ? ((normalizedOAuthProvider === 'google' ? config.googleOAuth2ClientId : config.imapOAuth2ClientId)
                  ? (imapOAuth2Status.authenticated ? `OAuth2 — signed in as ${imapOAuth2Status.user}` : 'OAuth2 configured — sign in required')
                  : 'OAuth2 selected — Client ID missing')
                : ((config.imapPass || config.smtpPass) ? 'Host, port, and credentials present' : 'Host/port set, password missing'))
              : 'Host/port set, username missing')
            : 'Missing host or port')
      }
    ];

    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white mb-6 flex items-center">
            Integrations & Settings
            {configSaveStatus === 'saved' && (
              <span className="ml-3 flex items-center text-sm font-medium text-emerald-600 dark:text-emerald-400 animate-fade-in-up">
                <CheckCircle className="w-4 h-4 mr-1" />
                Settings saved
              </span>
            )}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm md:col-span-2 transition-colors">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center text-black dark:text-white">
                  <CheckSquare className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-600" />
                  <div>
                    <h3 className="text-lg font-bold">First-Time Setup</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Use this checklist if you are setting up SalesDirector for the first time on this Mac.</p>
                  </div>
                </div>
                <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${isFirstRunReady ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                  {requiredFirstRunCount}/4 required steps complete
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {firstRunSetupItems.map((item) => (
                  <div key={item.label} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex items-start">
                    {item.ok ? (
                      <CheckCircle className="w-4 h-4 mr-2 mt-0.5 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mr-2 mt-0.5 text-amber-600" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-black dark:text-white">{item.label}</p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <p className="text-sm font-bold text-black dark:text-white">First success test</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">When the first four steps are green, open CRM & Contacts, select one contact, click Draft Outreach, then generate one draft in AI Outreach.</p>
              </div>
            </div>

            {/* System Health */}
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm md:col-span-2 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center text-black dark:text-white">
                  <Activity className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-600" />
                  <h3 className="text-lg font-bold">System Health</h3>
                </div>
                <button
                  onClick={clearSavedPreferences}
                  className="text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 px-3 py-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                >
                  Clear Saved Local Settings
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {diagnostics.map((item) => (
                  <div key={item.label} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex items-start">
                    {item.ok ? (
                      <CheckCircle className="w-4 h-4 mr-2 mt-0.5 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mr-2 mt-0.5 text-amber-600" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-black dark:text-white">{item.label}</p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-4">
                Security note: provider keys, tokens, proxy settings, and mail credentials persist locally on this device until cleared. Use proxy mode when vendor secrets must stay server-side.
              </p>

              <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                {IS_LOCAL_DEV_MODE && (
                  <div className="mb-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                    <h4 className="text-sm font-bold text-black dark:text-white mb-2 flex items-center">
                      <Lock className="w-4 h-4 mr-1 text-blue-900 dark:text-blue-600" />
                      Encrypted Local Database
                    </h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                      Data is saved on this device and encrypted with your passphrase. The passphrase is never stored.
                      {localDbBackend === 'electron-encrypted-file'
                        ? ' Running on Electron encrypted file storage.'
                        : ' Electron desktop runtime is required (browser preview cannot access desktop encrypted storage).'}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Passphrase</label>
                        <input
                          type="password"
                          value={localDbPassphraseInput}
                          onChange={(e) => setLocalDbPassphraseInput(e.target.value)}
                          className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                          placeholder="Minimum 8 characters"
                        />
                      </div>
                      <button
                        onClick={unlockLocalEncryptedDatabase}
                        disabled={loading || localDbBackend !== 'electron-encrypted-file'}
                        className="h-10 bg-black dark:bg-white text-white dark:text-black rounded-md text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50"
                      >
                        {localDbHasEncryptedData ? 'Unlock Database' : 'Create & Unlock'}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={lockLocalEncryptedDatabase}
                        disabled={!localDbUnlocked || localDbBackend !== 'electron-encrypted-file'}
                        className="text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 px-3 py-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-50"
                      >
                        Lock Database
                      </button>
                      <button
                        onClick={resetLocalEncryptedDatabase}
                        disabled={localDbBackend !== 'electron-encrypted-file'}
                        className="text-xs bg-white dark:bg-zinc-900 border border-blue-900 text-blue-900 dark:text-blue-500 px-3 py-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-zinc-800 transition disabled:opacity-50"
                      >
                        Reset Encrypted Database
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">{localDbStatusMessage}</p>
                  </div>
                )}

                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                  Integrations run against configured proxy/live providers.
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="text-sm font-bold text-black dark:text-white mb-3">Secure Proxy Routing</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Proxy Base URL</label>
                    <input
                      type="text"
                      name="apiBaseUrl"
                      value={config.apiBaseUrl}
                      onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                      placeholder="http://localhost:8787"
                    />
                    {configErrors.apiBaseUrl && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.apiBaseUrl}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Proxy Shared Secret (Optional)</label>
                    <input
                      type="password"
                      name="proxySecret"
                      value={config.proxySecret}
                      onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                      placeholder="Matches PROXY_SHARED_SECRET"
                    />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Persisted locally on this device until cleared from Settings.</p>
                  </div>
                </div>
              </div>
            </div>
          {/* Company Profile Config */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm md:col-span-2 transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <Globe className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-600" />
              <h3 className="text-lg font-bold">Company Profile</h3>
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Company Website URL</label>
              <input 
                type="url"
                name="companyUrl"
                value={config.companyUrl}
                onChange={handleConfigChange}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                placeholder="https://yourcompany.com"
              />
              {configErrors.companyUrl && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.companyUrl}</p>}
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Providing your website helps the AI model understand your company, products, and value proposition for better email generation.</p>
            </div>
          </div>

          {/* Sender Profile Config */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm md:col-span-2 transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <User className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-600" />
              <h3 className="text-lg font-bold">Sender & Signature Details</h3>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Your Name</label>
                  <input 
                    type="text"
                    name="senderName"
                    value={config.senderName}
                    onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    placeholder="e.g., Jane Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Reply-To Email Address</label>
                  <input 
                    type="email"
                    name="replyTo"
                    value={config.replyTo}
                    onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    placeholder="e.g., jane@yourcompany.com"
                  />
                  {configErrors.replyTo && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.replyTo}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Auto-BCC (CRM)</label>
                  <input 
                    type="email"
                    name="autoBcc"
                    value={config.autoBcc}
                    onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    placeholder="bcc@hubspot.com"
                  />
                  {configErrors.autoBcc && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.autoBcc}</p>}
                </div>
              </div>
              <div>
                 <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Email Signature</label>
                 <textarea
                   name="signature"
                   value={config.signature}
                   onChange={handleConfigChange}
                   rows="4"
                   className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors resize-none"
                   placeholder="Your signature block..."
                 ></textarea>
                 <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">This signature will be automatically appended to the bottom of your generated drafts.</p>
              </div>
            </div>
          </div>

          {/* CRM Config */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <Database className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-600" />
              <h3 className="text-lg font-bold">HubSpot CRM</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Private App Access Token</label>
                <input 
                  type="password"
                  name="hubspotToken"
                  value={config.hubspotToken}
                  onChange={handleConfigChange}
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  placeholder="pat-na1-..."
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Required to sync contacts and log emails.</p>
              </div>
            </div>
          </div>

          {/* Email Server Config */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <Server className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-600" />
              <h3 className="text-lg font-bold">Email Server & Security (IMAP/SMTP)</h3>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">SMTP Host</label>
                  <input 
                    type="text" name="smtpHost" value={config.smtpHost} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" placeholder="smtp.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Port</label>
                  <input 
                    type="text" name="smtpPort" value={config.smtpPort} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Security</label>
                  <select 
                    name="smtpSecure" value={config.smtpSecure} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    <option value="none">None</option>
                    <option value="tls">STARTTLS</option>
                    <option value="ssl">SSL/TLS</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">SMTP Username</label>
                  <input 
                    type="text" name="smtpUser" value={config.smtpUser} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" placeholder="user@example.com"
                  />
                  {configErrors.smtpUser && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.smtpUser}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">SMTP Auth Method</label>
                  <select
                    name="smtpAuthMethod" value={normalizeMailAuthMethod(config.smtpAuthMethod)} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    <option value="basic">Password / App Password</option>
                    <option value="oauth2">OAuth2 (uses IMAP OAuth2 token)</option>
                  </select>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">OAuth2 reuses the IMAP OAuth2 credentials above for SMTP sending.</p>
                </div>
              </div>
              {normalizeMailAuthMethod(config.smtpAuthMethod) === 'basic' && (
                <div className="mt-2">
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">SMTP Password</label>
                  <input 
                    type="password" name="smtpPass" value={config.smtpPass} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" placeholder="••••••••"
                  />
                </div>
              )}

              {/* Connection Test Buttons */}
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button" onClick={handleTestSmtpConnection}
                  className="px-3 py-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Test SMTP Connection
                </button>
                <button
                  type="button" onClick={handleTestImapConnection}
                  className="px-3 py-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Test IMAP Connection
                </button>
                {connectionTestResult.smtp && (
                  <span className={`text-xs font-medium ${connectionTestResult.smtp.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`}>
                    {connectionTestResult.smtp.message}
                  </span>
                )}
                {connectionTestResult.imap && (
                  <span className={`text-xs font-medium ${connectionTestResult.imap.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`}>
                    {connectionTestResult.imap.message}
                  </span>
                )}
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">IMAP Host</label>
                    <input 
                      type="text" name="imapHost" value={config.imapHost} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" placeholder="imap.example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Port</label>
                    <input 
                      type="text" name="imapPort" value={config.imapPort} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    />
                    {configErrors.imapPort && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.imapPort}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">IMAP Username</label>
                    <input
                      type="text" name="imapUser" value={config.imapUser} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                      placeholder="mailbox@example.com"
                    />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">If blank, SMTP username is used as fallback.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Authentication Method</label>
                    <select
                      name="imapAuthMethod" value={config.imapAuthMethod} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    >
                      <option value="basic">Password / App Password (Basic Auth)</option>
                      <option value="oauth2">OAuth2 (Microsoft or Google)</option>
                    </select>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      {normalizeMailAuthMethod(config.imapAuthMethod) === 'oauth2'
                        ? 'Required for Office 365 / Gmail tenants that have disabled Basic Auth.'
                        : 'Works with most IMAP servers. Office 365 / Gmail may require OAuth2.'}
                    </p>
                  </div>
                </div>

                {normalizeMailAuthMethod(config.imapAuthMethod) === 'oauth2' ? (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="mb-3">
                      <label className="block text-sm font-bold text-blue-800 dark:text-blue-300 mb-1">OAuth2 Provider</label>
                      <select
                        name="oauth2Provider" value={normalizeOAuthProvider(config.oauth2Provider)} onChange={handleConfigChange}
                        className="w-full border border-blue-200 dark:border-blue-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                      >
                        <option value="microsoft">Microsoft (Office 365 / Outlook)</option>
                        <option value="google">Google (Gmail / Google Workspace)</option>
                      </select>
                    </div>

                    {normalizeOAuthProvider(config.oauth2Provider) === 'microsoft' ? (
                      <>
                        <p className="text-xs text-blue-700 dark:text-blue-400 mb-3">
                          Register an app in <a href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Microsoft Entra (Azure AD)</a> with redirect URI <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">http://localhost</code> and IMAP.AccessAsUser.All + SMTP.Send permissions.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-bold text-blue-800 dark:text-blue-300 mb-1">Application (Client) ID</label>
                            <input
                              type="text" name="imapOAuth2ClientId" value={config.imapOAuth2ClientId} onChange={handleConfigChange}
                              className="w-full border border-blue-200 dark:border-blue-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-blue-800 dark:text-blue-300 mb-1">Directory (Tenant) ID</label>
                            <input
                              type="text" name="imapOAuth2TenantId" value={config.imapOAuth2TenantId} onChange={handleConfigChange}
                              className="w-full border border-blue-200 dark:border-blue-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx or common"
                            />
                            <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">Use &quot;common&quot; for multi-tenant or personal accounts.</p>
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="block text-xs font-bold text-blue-800 dark:text-blue-300 mb-1">Use Microsoft Graph API (instead of IMAP/SMTP)</label>
                          <select
                            name="useGraphApi" value={config.useGraphApi || 'false'} onChange={handleConfigChange}
                            className="w-full border border-blue-200 dark:border-blue-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                          >
                            <option value="false">No — use IMAP/SMTP with OAuth2 tokens</option>
                            <option value="true">Yes — use Graph API for inbox sync and sending</option>
                          </select>
                          <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">Graph API bypasses IMAP/SMTP entirely. Requires Mail.ReadWrite and Mail.Send permissions on your app.</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-blue-700 dark:text-blue-400 mb-3">
                          Create a <span className="font-semibold">Desktop app</span> OAuth client in <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Google Cloud Console</a>, enable the Gmail API, then enter the client ID and secret below. SalesDirector opens your default browser and completes sign-in through a temporary localhost callback automatically.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-bold text-blue-800 dark:text-blue-300 mb-1">Desktop Client ID</label>
                            <input
                              type="text" name="googleOAuth2ClientId" value={config.googleOAuth2ClientId} onChange={handleConfigChange}
                              className="w-full border border-blue-200 dark:border-blue-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                              placeholder="xxxx.apps.googleusercontent.com"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-blue-800 dark:text-blue-300 mb-1">Desktop Client Secret</label>
                            <input
                              type="password" name="googleOAuth2ClientSecret" value={config.googleOAuth2ClientSecret} onChange={handleConfigChange}
                              className="w-full border border-blue-200 dark:border-blue-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                              placeholder="GOCSPX-xxxxxxxxxx"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex items-center gap-3 mt-3">
                      {imapOAuth2Status.authenticated ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                            Signed in{imapOAuth2Status.user ? ` as ${imapOAuth2Status.user}` : ''}
                            {imapOAuth2Status.expired && <span className="text-amber-600 dark:text-amber-400 ml-1">(token expired — will refresh on next sync)</span>}
                          </span>
                          <button
                            type="button" onClick={handleOAuth2Logout}
                            className="px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                          >
                            Disconnect
                          </button>
                          <button
                            type="button" onClick={handleOAuth2Login}
                            className="px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                          >
                            Re-authenticate
                          </button>
                        </>
                      ) : (
                        <button
                          type="button" onClick={handleOAuth2Login}
                          className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center gap-2"
                        >
                          <Mail className="w-4 h-4" />
                          Sign in with {normalizeOAuthProvider(config.oauth2Provider) === 'google' ? 'Google' : 'Microsoft'}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 mt-3">
                    <div>
                      <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">IMAP Password / App Password</label>
                      <input
                        type="password" name="imapPass" value={config.imapPass} onChange={handleConfigChange}
                        className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                        placeholder="••••••••"
                      />
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Persisted in local storage for faster reconnects. For Office 365, use an App Password or switch to OAuth2.</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2 mt-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Mailbox Folder</label>
                    <input
                      type="text" name="imapFolder" value={config.imapFolder} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                      placeholder="INBOX"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Lookback Days</label>
                    <input
                      type="number" name="imapLookbackDays" value={config.imapLookbackDays} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    />
                    {configErrors.imapLookbackDays && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.imapLookbackDays}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Fetch Limit</label>
                    <input
                      type="number" name="imapSyncLimit" value={config.imapSyncLimit} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    />
                    {configErrors.imapSyncLimit && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.imapSyncLimit}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Archive Folder</label>
                    <input
                      type="text" name="imapArchiveFolder" value={config.imapArchiveFolder} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                      placeholder="Archive"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Auto Sync</label>
                    <select
                      name="imapAutoSyncEnabled" value={config.imapAutoSyncEnabled} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    >
                      <option value="false">Off</option>
                      <option value="true">On</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Auto Interval (min)</label>
                    <input
                      type="number" name="imapAutoSyncMinutes" value={config.imapAutoSyncMinutes} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    />
                    {configErrors.imapAutoSyncMinutes && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.imapAutoSyncMinutes}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Sync On App Startup</label>
                    <select
                      name="imapSyncOnStartup" value={config.imapSyncOnStartup} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    >
                      <option value="true">On</option>
                      <option value="false">Off</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Unread Only</label>
                    <select
                      name="imapUnreadOnly" value={config.imapUnreadOnly} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    >
                      <option value="false">No - include read and unread</option>
                      <option value="true">Yes - unread only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Sync Read/Archive/Flag Back To Mailbox</label>
                    <select
                      name="imapSyncFlagChanges" value={config.imapSyncFlagChanges} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    >
                      <option value="true">On - keep mailbox state in sync</option>
                      <option value="false">Off - local only</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                  Security tip: Use provider app passwords for mailbox sync instead of your primary account password.
                </p>
              </div>
            </div>
          </div>

          {/* Sending Limits & Safety */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <Shield className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-600" />
              <h3 className="text-lg font-bold">Sending Safety & Limits</h3>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Max Daily Emails</label>
                  <input 
                    type="number" name="maxDailyEmails" value={config.maxDailyEmails} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                  {configErrors.maxDailyEmails && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.maxDailyEmails}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Send Delay (sec)</label>
                  <input 
                    type="number" name="sendDelay" value={config.sendDelay} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                  {configErrors.sendDelay && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.sendDelay}</p>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Start Time</label>
                  <input 
                    type="time" name="activeHoursStart" value={config.activeHoursStart} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                  {configErrors.activeHoursStart && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.activeHoursStart}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">End Time</label>
                  <input 
                    type="time" name="activeHoursEnd" value={config.activeHoursEnd} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                  {configErrors.activeHoursEnd && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.activeHoursEnd}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Timezone</label>
                  <select 
                    name="timezone" value={config.timezone} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    <option value={SYSTEM_TIMEZONE_VALUE}>System ({SYSTEM_TIMEZONE_LABEL})</option>
                    {TIMEZONE_PRESET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Current planning clock: {currentPlanningDateTimeLabel} ({planningTimeZoneLabel}). Calendar highlights, task sorting, and AI scheduling prompts use this timezone.
              </p>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Minimum Buffer Between Timed Tasks (min)</label>
                <input 
                  type="number" name="scheduleBufferMinutes" value={config.scheduleBufferMinutes} onChange={handleConfigChange}
                  min="0" max="120"
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                />
                {configErrors.scheduleBufferMinutes && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.scheduleBufferMinutes}</p>}
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Protect travel, prep, and follow-up time by requiring a minimum gap between timed bookings.</p>
              </div>
            </div>
          </div>

          {/* Global AI Preferences */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <SlidersHorizontal className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-600" />
              <h3 className="text-lg font-bold">AI Defaults</h3>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Default Tone</label>
                  <select 
                    name="defaultTone" value={config.defaultTone} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    <option value="Professional">Professional</option>
                    <option value="Persuasive">Persuasive</option>
                    <option value="Friendly">Friendly</option>
                    <option value="Direct">Direct & Urgent</option>
                    <option value="Consultative">Consultative</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Default Length</label>
                  <select 
                    name="defaultLength" value={config.defaultLength} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    <option value="Concise">Concise (Short)</option>
                    <option value="Standard">Standard</option>
                    <option value="Detailed">Detailed</option>
                  </select>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">Shared Generation Profile</p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Applied across Gemini, OpenAI, Anthropic, and xAI to keep sampling behavior closer from provider to provider.</p>
                  </div>
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{formatAiGenerationProfileSummary(aiGenerationProfile)}</span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Temperature</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1.5"
                      name="aiTemperature"
                      value={config.aiTemperature}
                      onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    />
                    {configErrors.aiTemperature && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.aiTemperature}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Top-p</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      name="aiTopP"
                      value={config.aiTopP}
                      onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    />
                    {configErrors.aiTopP && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.aiTopP}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Max Output Tokens</label>
                    <input
                      type="number"
                      step="64"
                      min="256"
                      max={AI_MAX_OUTPUT_TOKENS_LIMIT}
                      name="aiMaxOutputTokens"
                      value={config.aiMaxOutputTokens}
                      onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    />
                    {configErrors.aiMaxOutputTokens && <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">{configErrors.aiMaxOutputTokens}</p>}
                  </div>
                </div>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">These preferences will be automatically applied when you open the composer or draft a new sequence.</p>
            </div>
          </div>

          {/* AI Providers Config */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm md:col-span-2 transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <Key className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-600" />
              <h3 className="text-lg font-bold">AI Routing & Provider Keys</h3>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              Choose the active AI provider, then add credentials and model settings below. Cloud providers work in browser or desktop mode. OpenRouter routes through OpenRouter’s OpenAI-compatible API. Local / OpenAI-compatible covers Ollama, LM Studio, and any server that exposes `/v1/chat/completions` (desktop recommended for localhost).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Active AI Provider</label>
                <select
                  name="selectedAI"
                  value={selectedAiProvider}
                  onChange={handleAiProviderChange}
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                >
                  {aiProviderStatuses.map((provider) => (
                    <option key={provider.provider} value={provider.provider} disabled={!provider.supported}>{provider.label}</option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                  Current route: {selectedAiRuntime.routeLabel}
                  {selectedAiRuntime.model ? ` · model ${selectedAiRuntime.model}` : ''}
                </p>
                {aiStartupReadiness.key && (
                  <div className={`mt-3 rounded-lg border p-3 text-xs ${aiStartupReadiness.level === 'error'
                    ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-200'
                    : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200'}`}>
                    <p className="font-bold">Startup self-check: {aiStartupReadiness.title}</p>
                    <p className="mt-1">{aiStartupReadiness.message}</p>
                  </div>
                )}
                {!selectedAiRuntime.supported && (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
                    <p className="font-bold">Current selection is unavailable in this mode.</p>
                    <p className="mt-1">{selectedAiRuntime.supportDetail}</p>
                    <button
                      onClick={switchToFirstSupportedAiProvider}
                      className="mt-3 rounded-md bg-amber-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
                    >
                      Use a supported provider
                    </button>
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4 text-sm text-zinc-600 dark:text-zinc-300">
                <p className="font-bold text-zinc-900 dark:text-white">Queue behavior</p>
                <p className="mt-2">
                  AI actions now run one at a time. If you click another AI button while one is running, it is queued instead of being dropped or cancelling the current job.
                </p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Supported: Gemini, OpenAI, Anthropic, xAI, OpenRouter, and local OpenAI-compatible servers (Ollama, LM Studio, etc.).
                </p>
              </div>
            </div>

            <div className="mb-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">AI Readiness Report</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Live status, local configuration, supported runtime paths, and provider checks are summarized here before you hand real workflow actions to the selected AI.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => queueAiProviderHealthCheck(selectedAiProvider)}
                    disabled={aiProviderTestBusy}
                    className="rounded-md bg-black px-3 py-2 text-xs font-bold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    {aiProviderTestBusy ? 'Testing...' : 'Test Active Provider'}
                  </button>
                  <button
                    onClick={queueAllAiProviderHealthChecks}
                    disabled={aiProviderTestBusy}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-800 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Test All Providers
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { label: 'Ready To Call', value: `${aiReadyCount}/${aiProviderStatuses.length}` },
                  { label: 'Supported Here', value: `${aiSupportedCount}/${aiProviderStatuses.length}` },
                  { label: 'Local Keys Saved', value: `${aiLocalKeyCount}/${aiProviderStatuses.length}` },
                  { label: 'Live Checks Passed', value: `${aiPassedCount}/${aiProviderStatuses.length}` }
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{item.label}</p>
                    <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-white">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold text-zinc-900 dark:text-white">Selected provider summary</p>
                    <p className="mt-1">{selectedAiLabel}: {selectedAiRuntime.routeLabel}</p>
                  </div>
                  <div className="font-medium text-zinc-500 dark:text-zinc-400">
                    Shared profile: {formatAiGenerationProfileSummary(aiGenerationProfile)}
                  </div>
                </div>
                <p className="mt-2">Credential source: {selectedAiUsesProxy
                  ? 'Proxy-managed on the server'
                  : (selectedAiRuntime.requiresApiKey
                    ? (selectedAiRuntime.hasApiKey ? 'Saved locally on this device' : 'Missing local key')
                    : (selectedAiRuntime.hasApiKey ? 'Optional local key saved' : 'No API key required for this endpoint'))}</p>
                {(selectedAiRuntime.model || selectedAiRuntime.baseUrl) && (
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {selectedAiRuntime.model ? `Model: ${selectedAiRuntime.model}` : 'Model not set'}
                    {selectedAiRuntime.baseUrl ? ` · Endpoint: ${selectedAiRuntime.baseUrl}` : ''}
                  </p>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {aiProviderStatuses.map((provider) => {
                  const testResult = provider.testResult;
                  const status = testResult?.status || (!provider.supported ? 'unsupported' : (provider.ready ? 'ready' : 'blocked'));
                  const badgeClass = status === 'passed'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : status === 'running'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : status === 'failed'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        : status === 'unsupported'
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300'
                          : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
                  const isSelectedProvider = provider.provider === selectedAiProvider;
                  const cardRingClass = isSelectedProvider
                    ? 'ring-2 ring-blue-900/30 dark:ring-blue-500/40 border-blue-300 dark:border-blue-800'
                    : 'border-zinc-200 dark:border-zinc-800';
                  const statusLabel = status === 'passed'
                    ? 'Passed'
                    : status === 'running'
                      ? 'Running'
                      : status === 'failed'
                        ? 'Failed'
                        : status === 'unsupported'
                          ? 'Unsupported here'
                          : provider.ready
                            ? 'Ready'
                            : 'Needs setup';
                  const detail = testResult?.message
                    || (!provider.supported
                      ? provider.supportDetail
                      : (provider.ready
                        ? `Ready via ${provider.routeLabel}.`
                        : provider.supportDetail || `Finish ${provider.label} setup to verify direct mode.`));

                  return (
                    <div key={provider.provider} className={`rounded-lg border bg-white p-4 text-sm dark:bg-zinc-900 transition-shadow ${cardRingClass}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            {provider.label}
                            {isSelectedProvider && (
                              <span className="rounded-full bg-blue-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-blue-500 dark:text-zinc-950">
                                Active
                              </span>
                            )}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{provider.routeLabel}</p>
                          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                            {provider.usingProxy
                              ? 'Proxy-managed credentials'
                              : provider.requiresApiKey
                                ? (provider.hasApiKey ? 'Local key saved' : 'Local key missing')
                                : (provider.hasApiKey ? 'Optional key saved' : 'API key optional')}
                            {provider.model ? ` · ${provider.model}` : ''}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${badgeClass}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">{detail}</p>
                      {testResult?.checkedAt && (
                        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                          Last check: {new Date(testResult.checkedAt).toLocaleTimeString()}
                        </p>
                      )}
                      {testResult?.preview && status === 'passed' && (
                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                          Response: {truncateAiPreview(testResult.preview)}
                        </p>
                      )}
                      <button
                        onClick={() => queueAiProviderHealthCheck(provider.provider)}
                        disabled={aiProviderTestBusy || !provider.supported}
                        className="mt-3 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-bold text-zinc-800 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Test {provider.label}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { label: 'Gemini API Key (Google AI Studio)', name: 'geminiKey', placeholder: 'AIza...' },
                { label: 'OpenAI API Key (ChatGPT)', name: 'openaiKey', placeholder: 'sk-...' },
                { label: 'Anthropic API Key (Claude)', name: 'anthropicKey', placeholder: 'sk-ant-...' },
                { label: 'xAI API Key (Grok)', name: 'xaiKey', placeholder: 'xai-...' },
                { label: 'OpenRouter API Key', name: 'openrouterKey', placeholder: 'sk-or-...' },
              ].map((provider) => (
                <div key={provider.name}>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">{provider.label}</label>
                  <input 
                    type="password"
                    name={provider.name}
                    value={config[provider.name]}
                    onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    placeholder={provider.placeholder}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>

            <div className={`mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 rounded-xl p-4 transition-colors ${
              selectedAiProvider === 'openrouter'
                ? 'border border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/20'
                : 'border border-transparent'
            }`}>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  OpenRouter Model
                  {selectedAiProvider === 'openrouter' && (
                    <span className="ml-2 rounded-full bg-blue-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-blue-500 dark:text-zinc-950">
                      Active path
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  name="openrouterModel"
                  value={config.openrouterModel}
                  onChange={handleConfigChange}
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors font-mono"
                  placeholder={OPENROUTER_DEFAULT_MODEL}
                  autoComplete="off"
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Use any OpenRouter model id (for example <code className="font-mono">anthropic/claude-3.5-sonnet</code> or <code className="font-mono">meta-llama/llama-3.1-8b-instruct:free</code>).
                </p>
              </div>
            </div>

            <div className={`mt-6 rounded-xl border p-5 space-y-4 transition-colors ${
              selectedAiProvider === 'openai_compatible'
                ? 'border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/20'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40'
            }`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h4 className="text-sm font-bold text-black dark:text-white flex items-center gap-2">
                    Local / OpenAI-compatible endpoint
                    {selectedAiProvider === 'openai_compatible' && (
                      <span className="rounded-full bg-blue-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-blue-500 dark:text-zinc-950">
                        Active path
                      </span>
                    )}
                  </h4>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-2xl">
                    Point SalesDirector at Ollama, LM Studio, vLLM, LocalAI, or any OpenAI-compatible server. Localhost endpoints work best in the desktop app.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {OPENAI_COMPATIBLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyOpenAiCompatiblePreset(preset.id)}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Base URL</label>
                  <input
                    type="url"
                    name="openaiCompatibleBaseUrl"
                    value={config.openaiCompatibleBaseUrl}
                    onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors font-mono"
                    placeholder="http://127.0.0.1:11434/v1"
                    autoComplete="off"
                  />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Should end with <code className="font-mono">/v1</code>. Ollama default is <code className="font-mono">http://127.0.0.1:11434/v1</code>; LM Studio is often <code className="font-mono">http://127.0.0.1:1234/v1</code>.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Model ID</label>
                  <input
                    type="text"
                    name="openaiCompatibleModel"
                    value={config.openaiCompatibleModel}
                    onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    placeholder="llama3.2"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">API Key (optional)</label>
                  <input
                    type="password"
                    name="openaiCompatibleKey"
                    value={config.openaiCompatibleKey}
                    onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    placeholder="Leave blank for Ollama / many local servers"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
    );
  };

  const renderAbout = () => {
    const platformLabel = desktopAppInfo
      ? `${desktopAppInfo.platform} (${desktopAppInfo.arch})`
      : 'Browser preview';
    const runtimeLabel = desktopAppInfo
      ? `Electron ${desktopAppInfo.electronVersion} · Node ${desktopAppInfo.nodeVersion} · Chrome ${desktopAppInfo.chromeVersion}`
      : 'Browser preview';
    const storageLabel = !IS_LOCAL_DEV_MODE
      ? 'Firebase-backed storage'
      : (localDbBackend !== 'electron-encrypted-file'
        ? 'Desktop runtime required for encrypted local storage'
        : (localDbUnlocked
          ? 'Electron encrypted file storage (unlocked)'
          : (localDbHasEncryptedData
            ? 'Electron encrypted file storage (locked)'
            : 'Electron encrypted file storage ready')));
    const aboutFacts = [
      { label: 'Application', value: desktopAppInfo?.productName || 'SalesDirector' },
      { label: 'Version', value: desktopAppInfo?.version || 'Browser preview' },
      { label: 'Platform', value: platformLabel },
      { label: 'Runtime', value: runtimeLabel },
      { label: 'Storage Backend', value: storageLabel },
      { label: 'Operating Mode', value: IS_LOCAL_DEV_MODE ? 'Local development fallback' : 'Firebase-backed connected mode' }
    ];

    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-900 dark:text-blue-500 mb-2">About & Diagnostics</p>
            <h2 className="text-3xl font-bold text-black dark:text-white">SalesDirector Desktop</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 max-w-2xl">
              Build details, runtime diagnostics, and support information for this installation.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 shadow-sm transition-colors">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Current Build</p>
            <p className="mt-1 text-2xl font-bold text-black dark:text-white">{desktopAppInfo?.version || 'Preview'}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{platformLabel}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-8">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
            <div className="flex items-center text-black dark:text-white mb-5">
              <Activity className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-600" />
              <h3 className="text-lg font-bold">Runtime Diagnostics</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {aboutFacts.map((item) => (
                <div key={item.label} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-4 transition-colors">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">{item.label}</p>
                  <p className="mt-2 text-sm font-semibold text-black dark:text-white leading-6">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-black dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-800 shadow-sm transition-colors text-zinc-100">
            <div className="flex items-center mb-5">
              <Briefcase className="w-5 h-5 mr-2 text-blue-500" />
              <h3 className="text-lg font-bold text-white">Credits & Support</h3>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Built By</p>
                <p className="mt-2 text-xl font-bold text-white">{AKITA_CREDITS.companyName}</p>
                <p className="mt-2 text-sm text-zinc-300 leading-6">{AKITA_CREDITS.origin}</p>
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Support Email</p>
                  <a
                    href={`mailto:${AKITA_CREDITS.supportEmail}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center text-sm font-semibold text-white hover:text-blue-400 transition-colors"
                  >
                    <Mail className="w-4 h-4 mr-2 text-blue-500" />
                    {AKITA_CREDITS.supportEmail}
                  </a>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Website</p>
                  <a
                    href={AKITA_CREDITS.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center text-sm font-semibold text-white hover:text-blue-400 transition-colors"
                  >
                    <Globe className="w-4 h-4 mr-2 text-blue-500" />
                    {AKITA_CREDITS.websiteLabel}
                  </a>
                </div>
              </div>

              <p className="text-xs text-zinc-400 leading-6">
                Need build or deployment help? Reach out to Akita Engineering for support on desktop distribution,
                infrastructure, and rollout.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`flex min-h-screen xl:h-screen font-sans overflow-x-hidden xl:overflow-hidden transition-colors ${isDarkMode ? 'dark bg-zinc-950' : 'bg-white'}`}>
      
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 xl:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar Navigation */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] bg-black dark:bg-zinc-900 text-zinc-300 flex min-h-0 flex-col border-r border-zinc-800 overflow-hidden shadow-2xl transition-transform duration-200 xl:static xl:translate-x-0 xl:w-64 xl:shadow-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white flex items-center">
            <div className="w-8 h-8 bg-blue-900 rounded-lg flex items-center justify-center mr-3 flex-shrink-0">
              <Mail className="w-5 h-5 text-white" />
            </div>
            Sales Director
          </h1>
          <button onClick={() => setSidebarOpen(false)} className="xl:hidden p-1 text-zinc-400 hover:text-white transition-colors" aria-label="Close navigation">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
          {[
            { id: 'dashboard', icon: Activity, label: 'Dashboard' },
            { id: 'inbox', icon: Inbox, label: 'Smart Inbox' },
            { id: 'tasks', icon: CheckSquare, label: 'Tasks & Calendar' },
            { id: 'contacts', icon: Users, label: 'CRM & Contacts' },
            { id: 'outreach', icon: Edit3, label: 'AI Outreach' },
            { id: 'settings', icon: Settings, label: 'Settings' },
            { id: 'about', icon: FileText, label: 'About' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors duration-150 ${
                activeTab === item.id 
                  ? 'bg-zinc-800 dark:bg-zinc-800 text-white font-bold shadow-sm' 
                  : 'hover:bg-zinc-900 dark:hover:bg-zinc-800 hover:text-white font-bold'
              }`}
            >
              <item.icon className={`w-5 h-5 mr-3 ${activeTab === item.id ? 'text-blue-900 dark:text-blue-500' : 'text-zinc-400'}`} />
              {item.label}
              {activeTab === item.id && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
            </button>
          ))}
        </nav>
        
        <div className="shrink-0 p-4 border-t border-zinc-800 text-xs text-zinc-500 text-center flex flex-col items-center">
          <p className="mb-1 font-medium">Proudly built by</p>
          <a href={AKITA_CREDITS.website} target="_blank" rel="noopener noreferrer" className="text-blue-900 dark:text-blue-600 hover:text-blue-700 dark:hover:text-blue-400 font-bold text-sm mb-1 transition-colors">
            {AKITA_CREDITS.companyName}
          </a>
          <a href={`mailto:${AKITA_CREDITS.supportEmail}`} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-200 font-medium text-[10px] transition-colors">
            {AKITA_CREDITS.supportEmail}
          </a>
          <p className="text-zinc-600 dark:text-zinc-500 font-medium text-[10px] mt-1">{AKITA_CREDITS.websiteLabel}</p>
          <p className="text-zinc-600 dark:text-zinc-500 font-medium text-[10px] mt-1">{AKITA_CREDITS.origin}</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 min-h-screen xl:min-h-0 flex flex-col relative overflow-hidden bg-white dark:bg-zinc-950 transition-colors">
        {/* Header bar */}
        <header className="min-h-16 xl:h-16 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8 z-10 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="xl:hidden p-2 -ml-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" aria-label="Open navigation">
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-black dark:text-white truncate">
              {TAB_LABELS[activeTab] || activeTab}
            </h2>
          </div>
          <div className="ml-auto flex items-center gap-2 md:gap-4 flex-wrap justify-end">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400" />
              <input 
                type="search"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setGlobalSearch(''); }}
                placeholder="Search leads..."
                aria-label="Search contacts"
                className="pl-9 pr-4 py-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full text-sm outline-none focus:ring-2 focus:ring-blue-900 w-32 sm:w-40 md:w-56 xl:w-64 transition-all text-black dark:text-white"
              />
              {globalSearchResults && globalSearchResults.length > 0 && (
                <div className="absolute top-full mt-2 right-0 w-[min(20rem,calc(100vw-2rem))] sm:w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 px-2">{globalSearchResults.length} result{globalSearchResults.length !== 1 ? 's' : ''}</span>
                  </div>
                  {globalSearchResults.map(c => (
                    <button
                      key={c.id || c.email}
                      onClick={() => { openDossier(c); setGlobalSearch(''); }}
                      className="w-full flex items-center p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-900/10 dark:bg-blue-900/30 text-blue-900 dark:text-blue-400 flex items-center justify-center font-bold text-xs mr-3 flex-shrink-0">
                        {(c.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-black dark:text-white truncate">{c.name}</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{c.company}{c.jobTitle ? ` · ${c.jobTitle}` : ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {globalSearchResults && globalSearchResults.length === 0 && (
                <div className="absolute top-full mt-2 right-0 w-[min(16rem,calc(100vw-2rem))] sm:w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl z-50 p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No contacts found.
                </div>
              )}
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-sm shadow-sm" title={config.senderName || 'User'}>
              {(config.senderName || 'SD').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <main className="flex min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white dark:bg-zinc-950 transition-colors">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'inbox' && renderInbox()}
          {activeTab === 'tasks' && renderTasks()}
          {activeTab === 'contacts' && renderContacts()}
          {activeTab === 'outreach' && renderOutreach()}
          {activeTab === 'settings' && renderSettings()}
          {activeTab === 'about' && renderAbout()}
        </main>

        {/* Global toast notifications */}
        {notification && (
          <div className="fixed bottom-6 right-6 left-6 sm:left-auto z-[100] animate-fade-in-up" role="status" aria-live="polite">
            <div className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl border max-w-md ml-auto ${
              notification.type === 'error' 
                ? 'bg-red-50 dark:bg-red-950/90 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200 font-semibold'
                : 'bg-zinc-900 dark:bg-white border-zinc-800 dark:border-zinc-200 text-white dark:text-black font-semibold'
            }`}>
              {notification.type === 'error' 
                ? <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
                : <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-emerald-400 dark:text-emerald-600" />
              }
              <span className="text-sm leading-snug flex-1">{notification.message}</span>
              <button
                type="button"
                onClick={dismissNotification}
                className={`p-1 rounded-md flex-shrink-0 transition-colors ${
                  notification.type === 'error'
                    ? 'text-red-700/70 hover:text-red-900 dark:text-red-300/70 dark:hover:text-red-100'
                    : 'text-white/60 hover:text-white dark:text-black/50 dark:hover:text-black'
                }`}
                aria-label="Dismiss notification"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CRM Create/Edit Modal Overlay */}
      {isContactModalOpen && editingContact && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingContact._isNew ? 'Add Contact' : 'Edit Contact'}
          onClick={(e) => { if (e.target === e.currentTarget) closeContactModal(); }}
        >
          <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-fade-in-up">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950/50">
              <h2 className="text-xl font-bold text-black dark:text-white">{editingContact._isNew ? 'Add Contact' : 'Edit Contact'}</h2>
              <button onClick={closeContactModal} className="text-zinc-400 hover:text-black dark:hover:text-white transition" aria-label="Close">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {editingContactInsights?.actionPlan && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Operator Guidance</p>
                      <p className="mt-1 text-sm font-bold text-black dark:text-white">{editingContactInsights.actionPlan.primaryAction.label}</p>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 max-w-2xl">{editingContactInsights.actionPlan.primaryAction.detail}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {editingContactInsights.actionPlan.actionReasons.slice(0, 4).map((reason) => (
                          <span key={`contact-guidance-${reason}`} className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap lg:justify-end">
                      <button onClick={() => applyEditingContactGuidance('all')} className="text-xs bg-black dark:bg-white text-white dark:text-black px-3 py-2 rounded font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition">
                        Apply stage defaults
                      </button>
                      <button onClick={() => applyEditingContactGuidance('next-step')} className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white px-3 py-2 rounded font-bold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition">
                        Use suggested next step
                      </button>
                      <button onClick={() => applyEditingContactGuidance('follow-up')} className="text-xs bg-amber-400 text-black px-3 py-2 rounded font-bold hover:bg-amber-300 transition">
                        Set follow-up date
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {editingContactInsights?.duplicateContact && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-900/20">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-bold text-amber-900 dark:text-amber-300">Existing CRM record found for this email.</p>
                      <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200">Open the existing record, keep your new details, and save updates instead of creating a duplicate.</p>
                    </div>
                    <button onClick={openExistingDuplicateContact} className="text-xs bg-amber-500 text-black px-3 py-2 rounded font-bold hover:bg-amber-400 transition">
                      Review existing record
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Full Name</label>
                  <input type="text" name="name" value={editingContact.name} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                  {editingContactInsights?.missingName && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">A clear contact name makes outreach prompts and CRM search more reliable.</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Email <span className="text-blue-900">*</span></label>
                  <input type="email" name="email" disabled={!editingContact._isNew} value={editingContact.email} onChange={handleContactFormChange} className={`w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white transition-colors ${!editingContact._isNew ? 'bg-zinc-100 dark:bg-zinc-950 opacity-70' : 'bg-white dark:bg-zinc-800'}`} />
                  {editingContact.email && !editingContactInsights?.hasValidEmail && <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">Enter a valid email so this record can link Inbox, CRM, and Outreach automatically.</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Company</label>
                  <input type="text" name="company" value={editingContact.company} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Job Title</label>
                  <input type="text" name="jobTitle" value={editingContact.jobTitle} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Phone</label>
                  <input type="text" name="phone" value={editingContact.phone} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Website</label>
                  <input type="url" name="website" value={editingContact.website || ''} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Stage</label>
                  <select name="stage" value={editingContact.stage} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors">
                    {CONTACT_STAGE_OPTIONS.map((stageOption) => (
                      <option key={stageOption} value={stageOption}>{stageOption}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Lead Temperature</label>
                  <select name="leadTemperature" value={editingContact.leadTemperature || 'Cold'} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors">
                    {CONTACT_TEMPERATURE_OPTIONS.map((temperature) => (
                      <option key={temperature} value={temperature}>{temperature}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Owner</label>
                  <input type="text" name="owner" value={editingContact.owner || ''} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Source</label>
                  <select name="source" value={editingContact.source || 'Manual'} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors">
                    {CONTACT_SOURCE_OPTIONS.map((sourceOption) => (
                      <option key={sourceOption} value={sourceOption}>{sourceOption}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Estimated Deal Value</label>
                  <input type="number" name="estimatedValue" value={editingContact.estimatedValue || ''} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Priority Score</label>
                  <input type="number" name="priorityScore" min="1" max="100" value={editingContact.priorityScore || ''} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Next Follow-Up Date</label>
                  <input type="date" name="nextFollowUpAt" value={editingContact.nextFollowUpAt || ''} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Last Contacted</label>
                  <input type="date" name="lastContactedAt" value={editingContact.lastContactedAt || ''} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">LinkedIn URL</label>
                <input type="url" name="linkedin" value={editingContact.linkedin} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Next Step</label>
                <textarea name="nextStep" value={editingContact.nextStep || ''} onChange={handleContactFormChange} rows="2" className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors resize-none"></textarea>
                {editingContactInsights?.actionPlan?.suggestedNextStep && !editingContact.nextStep && (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Suggested: {editingContactInsights.actionPlan.suggestedNextStep}</p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">AI Summary</label>
                  <textarea name="aiSummary" value={editingContact.aiSummary || ''} onChange={handleContactFormChange} rows="3" className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors resize-none"></textarea>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Pain Points</label>
                  <textarea name="painPoints" value={editingContact.painPoints || ''} onChange={handleContactFormChange} rows="3" className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors resize-none"></textarea>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Notes</label>
                <textarea name="notes" value={editingContact.notes} onChange={handleContactFormChange} rows="4" className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors resize-none"></textarea>
              </div>
            </div>
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex justify-end space-x-3">
              <button onClick={closeContactModal} className="px-4 py-2 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition">Cancel</button>
              <button onClick={saveContact} disabled={loading} className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50">{editingContact._isNew ? 'Save Contact' : 'Save Updates'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Task Edit Modal */}
      {isTaskModalOpen && editingTask && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Edit Task"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsTaskModalOpen(false);
              setEditingTask(null);
            }
          }}
        >
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-fade-in-up">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-black dark:text-white">Edit Task</h2>
              <button onClick={() => { setIsTaskModalOpen(false); setEditingTask(null); }} className="text-zinc-400 hover:text-black dark:hover:text-white transition" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Task</label>
                <input 
                  type="text" name="title" value={editingTask.title || editingTask.text || ''} onChange={handleTaskFormChange}
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Type</label>
                  <select name="type" value={editingTask.type || 'follow-up'} onChange={handleTaskFormChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    {TASK_TYPE_OPTIONS.map((typeOption) => (
                      <option key={typeOption} value={typeOption}>{typeOption}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Priority (1-100)</label>
                  <input 
                    type="number" name="priority" value={editingTask.priority || 50} onChange={handleTaskFormChange}
                    min="1" max="100"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Due Date</label>
                  <input 
                    type="date" name="dueDate" value={editingTask.dueDate || ''} onChange={handleTaskFormChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Planner Day</label>
                  <input 
                    type="date" name="scheduledDate" value={editingTask.scheduledDate || ''} onChange={handleTaskFormChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Contact</label>
                  <input 
                    type="text" name="contact" value={editingTask.contact || ''} onChange={handleTaskFormChange}
                    placeholder="Contact name"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Contact Email</label>
                  <input 
                    type="email" name="contactEmail" value={editingTask.contactEmail || ''} onChange={handleTaskFormChange}
                    placeholder="contact@example.com"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Start Time</label>
                  <input 
                    type="text" name="time" value={editingTask.time || ''} onChange={handleTaskFormChange}
                    placeholder="09:00 AM"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Duration (min)</label>
                  <input 
                    type="number" name="durationMinutes" value={editingTask.durationMinutes || 30} onChange={handleTaskFormChange}
                    min="5" max="480"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Focus</label>
                  <select name="focus" value={editingTask.focus || 'sales'} onChange={handleTaskFormChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    {TASK_FOCUS_OPTIONS.map((focusOption) => (
                      <option key={focusOption} value={focusOption}>{focusOption}</option>
                    ))}
                  </select>
                </div>
              </div>
              {editingTaskScheduleState && (editingTaskScheduleState.invalidTime || editingTaskScheduleState.hasConflict || editingTaskScheduleState.outsideActiveHours) && (
                <div className={`rounded-lg border p-3 ${editingTaskScheduleState.invalidTime || editingTaskScheduleState.hasConflict ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/20' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20'}`}>
                  <div className="flex items-start gap-2">
                    <AlertCircle className={`w-4 h-4 mt-0.5 ${editingTaskScheduleState.invalidTime || editingTaskScheduleState.hasConflict ? 'text-blue-700 dark:text-blue-400' : 'text-amber-700 dark:text-amber-400'}`} />
                    <div className="space-y-1 text-xs">
                      {editingTaskScheduleState.invalidTime && <p className="font-bold text-blue-900 dark:text-blue-300">Use a start time like 09:00 AM or 14:30.</p>}
                      {editingTaskScheduleState.hasConflict && (
                        <p className="font-bold text-blue-900 dark:text-blue-300">
                          {editingTaskScheduleState.hasOverlap
                            ? `This booking overlaps with ${editingTaskScheduleState.conflictingTasks.map((task) => task.title).join(', ')}.`
                            : `This booking needs at least ${scheduleBufferMinutes} minutes of buffer before or after the surrounding task.`}
                        </p>
                      )}
                      {editingTaskScheduleState.outsideActiveHours && (
                        <p className="font-bold text-amber-900 dark:text-amber-300">
                          This task falls outside active hours {config.activeHoursStart}-{config.activeHoursEnd}.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Rationale</label>
                <textarea 
                  name="rationale" value={editingTask.rationale || ''} onChange={handleTaskFormChange} rows="2"
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  placeholder="Why this task matters..."
                ></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Notes</label>
                <textarea 
                  name="notes" value={editingTask.notes || ''} onChange={handleTaskFormChange} rows="2"
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  placeholder="Internal execution notes..."
                ></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Status</label>
                <select name="status" value={editingTask.status || 'pending'} onChange={handleTaskFormChange}
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                >
                  {TASK_STATUS_OPTIONS.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>{statusOption}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end space-x-3">
              <button onClick={() => { setIsTaskModalOpen(false); setEditingTask(null); }} className="px-4 py-2 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition">Cancel</button>
              <button onClick={saveTask} disabled={editingTaskScheduleState?.invalidTime || editingTaskScheduleState?.hasConflict} className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {contactToDelete && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Delete Contact"
          onClick={(e) => { if (e.target === e.currentTarget) setContactToDelete(null); }}
        >
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-xl shadow-2xl p-6 border border-zinc-200 dark:border-zinc-800 animate-fade-in-up">
             <h2 className="text-xl font-bold text-black dark:text-white mb-2">Delete Contact</h2>
             <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-6">Are you sure you want to permanently delete <strong className="text-black dark:text-white">{contactToDelete.name}</strong>? This action cannot be undone.</p>
             <div className="flex justify-end space-x-3">
               <button onClick={() => setContactToDelete(null)} className="px-4 py-2 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition">Cancel</button>
               <button onClick={deleteContact} disabled={loading} className="px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition disabled:opacity-50">Delete</button>
             </div>
          </div>
        </div>
      )}

      {/* Lead Dossier Modal Overlay */}
      {selectedContact && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Contact dossier for ${selectedContact.name || 'contact'}`}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedContact(null); }}
        >
          <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-fade-in-up">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-start bg-zinc-50 dark:bg-zinc-950/50">
              <div>
                <h2 className="text-2xl font-bold text-black dark:text-white flex items-center">
                  {selectedContact.name}
                  <span className={`ml-3 px-2 py-0.5 rounded-full text-xs font-bold ${
                      selectedContact.status === 'Warm' || selectedContact.stage === 'Opportunity' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-400' :
                      selectedContact.status === 'Cold' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300' :
                      'bg-black dark:bg-white text-white dark:text-black'
                    }`}>
                      {selectedContact.stage || selectedContact.status}
                  </span>
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{selectedContact.jobTitle ? `${selectedContact.jobTitle} at ` : ''}<strong className="text-black dark:text-white">{selectedContact.company}</strong></p>
              </div>
              <button onClick={() => setSelectedContact(null)} className="text-zinc-400 hover:text-black dark:hover:text-white transition" aria-label="Close dossier">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
              
              {/* Left Column: Details & Actions */}
              <div className="w-full md:w-1/3 space-y-6">
                <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">Contact Info</h3>
                  <div className="space-y-3">
                    <div className="flex items-center text-sm">
                      <Mail className="w-4 h-4 mr-2 text-zinc-400" />
                      <a href={`mailto:${selectedContact.email}`} className="text-blue-900 dark:text-blue-500 hover:underline">{selectedContact.email}</a>
                    </div>
                    {selectedContact.phone && (
                      <div className="flex items-center text-sm text-zinc-700 dark:text-zinc-300">
                        <Phone className="w-4 h-4 mr-2 text-zinc-400" />
                        {selectedContact.phone}
                      </div>
                    )}
                    {selectedContact.linkedin && (
                      <div className="flex items-center text-sm text-zinc-700 dark:text-zinc-300">
                        <Linkedin className="w-4 h-4 mr-2 text-zinc-400" />
                        <a href={selectedContact.linkedin} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-blue-900 dark:hover:text-blue-500 truncate">LinkedIn Profile</a>
                      </div>
                    )}
                    {selectedContact.website && (
                      <div className="flex items-center text-sm text-zinc-700 dark:text-zinc-300">
                        <Globe className="w-4 h-4 mr-2 text-zinc-400" />
                        <a href={selectedContact.website} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-blue-900 dark:hover:text-blue-500 truncate">Company Website</a>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-zinc-500 dark:text-zinc-400">Owner</div>
                      <div className="mt-1 font-bold text-black dark:text-white">{selectedContact.owner || 'Unassigned'}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500 dark:text-zinc-400">Value</div>
                      <div className="mt-1 font-bold text-black dark:text-white">{formatCurrencyCompact(selectedContact.estimatedValue)}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500 dark:text-zinc-400">Next Follow-Up</div>
                      <div className="mt-1 font-bold text-black dark:text-white">{formatFriendlyDate(selectedContact.nextFollowUpAt)}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500 dark:text-zinc-400">Priority</div>
                      <div className="mt-1 font-bold text-black dark:text-white">{selectedContact.priorityScore || 50}</div>
                    </div>
                  </div>
                  {selectedContactActionPlan && (
                    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Next Best Action</h4>
                      <p className="text-sm font-bold text-black dark:text-white">{selectedContactActionPlan.primaryAction.label}</p>
                      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{selectedContactActionPlan.primaryAction.detail}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {selectedContactActionPlan.actionReasons.slice(0, 4).map((reason) => (
                          <span key={`selected-contact-reason-${reason}`} className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedContact.nextStep && (
                    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Next Step</h4>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{selectedContact.nextStep}</p>
                    </div>
                  )}
                  {selectedContact.aiSummary && (
                    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">AI Summary</h4>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{selectedContact.aiSummary}</p>
                    </div>
                  )}
                  {selectedContact.notes && (
                    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Notes</h4>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{selectedContact.notes}</p>
                    </div>
                  )}
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                   <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">Quick Actions</h3>
                   <div className="space-y-2">
                     <button 
                       onClick={() => {
                         loadContactIntoOutreach(selectedContact);
                         setSelectedContact(null);
                       }}
                       className="w-full flex items-center justify-center bg-blue-900 text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-800 transition"
                     >
                       <Edit3 className="w-4 h-4 mr-2" /> Draft Outreach
                     </button>
                     <button 
                        onClick={() => {
                           createTaskForContact(selectedContact);
                           setSelectedContact(null);
                        }}
                        className="w-full flex items-center justify-center bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white py-2 rounded-lg text-sm font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition"
                     >
                       <CheckSquare className="w-4 h-4 mr-2" /> Add Task
                     </button>
                     <button
                       onClick={() => {
                         if (createMeetingPrepPackForContact(selectedContact)) {
                           setSelectedContact(null);
                         }
                       }}
                       className="w-full flex items-center justify-center bg-amber-400 text-black py-2 rounded-lg text-sm font-bold hover:bg-amber-300 transition"
                     >
                       <Briefcase className="w-4 h-4 mr-2" /> Meeting Prep Pack
                     </button>
                    <button 
                      onClick={() => logCallActivity(selectedContact)}
                        className="w-full flex items-center justify-center bg-black dark:bg-white text-white dark:text-black py-2 rounded-lg text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
                     >
                       <Phone className="w-4 h-4 mr-2" /> Log Call
                     </button>
                     {selectedContactActionPlan && !isReviewDossierAction(selectedContactActionPlan) && (
                       <button
                         onClick={() => runContactPrimaryAction(selectedContact, selectedContactAttention)}
                         className="w-full flex items-center justify-center bg-white dark:bg-zinc-800 text-black dark:text-white py-2 rounded-lg text-sm font-bold hover:bg-zinc-100 dark:hover:bg-zinc-700 transition"
                       >
                         <Target className="w-4 h-4 mr-2" /> {selectedContactActionPlan.primaryAction.label}
                       </button>
                     )}
                   </div>
                </div>

                {/* AI Intelligence */}
                <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                   <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4 flex items-center"><Sparkles className="w-3 h-3 mr-1 text-blue-900 dark:text-blue-500" /> AI Intelligence</h3>
                   <div className="space-y-2">
                     <button
                       onClick={() => handleAIAction('callPrep', { contact: selectedContact })}
                       className="w-full flex items-center justify-center bg-black dark:bg-white text-white dark:text-black py-2 rounded-lg text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50"
                     >
                       <PhoneCall className="w-4 h-4 mr-2" /> Call Prep Brief
                     </button>
                     <button 
                       onClick={() => handleAIAction('researchContact', { contact: selectedContact })}
                       className="w-full flex items-center justify-center bg-blue-900 text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-800 transition disabled:opacity-50"
                     >
                       <Zap className="w-4 h-4 mr-2" /> Research Contact
                     </button>
                     <button 
                       onClick={() => handleAIAction('suggestFollowUp', { contact: selectedContact })}
                       className="w-full flex items-center justify-center bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white py-2 rounded-lg text-sm font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition disabled:opacity-50"
                     >
                       <Target className="w-4 h-4 mr-2" /> Follow-Up Strategy
                     </button>
                     <button 
                       onClick={() => handleAIAction('aiContactPlan', { contact: selectedContact })}
                       className="w-full flex items-center justify-center bg-amber-400 text-black py-2 rounded-lg text-sm font-bold hover:bg-amber-300 transition disabled:opacity-50"
                     >
                       <Sparkles className="w-4 h-4 mr-2" /> Build AI Action Plan
                     </button>
                     {selectedContactAttention?.isStale && selectedContact.stage !== 'Proposal' && selectedContact.stage !== 'Customer' && (
                       <button
                         onClick={() => handleAIAction('reactivationDraft', { contact: selectedContact })}
                         className="w-full flex items-center justify-center bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white py-2 rounded-lg text-sm font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition disabled:opacity-50"
                       >
                         <RotateCcw className="w-4 h-4 mr-2" /> Reactivation Draft
                       </button>
                     )}
                     {selectedContact.stage === 'Customer' && (
                       <button
                         onClick={() => handleAIAction('customerCheckIn', { contact: selectedContact })}
                         className="w-full flex items-center justify-center bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white py-2 rounded-lg text-sm font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition disabled:opacity-50"
                       >
                         <Mail className="w-4 h-4 mr-2" /> Customer Check-In Draft
                       </button>
                     )}
                     {selectedContact.stage === 'Proposal' && (
                       <button
                         onClick={() => handleAIAction('proposalFollowUp', { contact: selectedContact })}
                         className="w-full flex items-center justify-center bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white py-2 rounded-lg text-sm font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition disabled:opacity-50"
                       >
                         <Send className="w-4 h-4 mr-2" /> Proposal Follow-Up Draft
                       </button>
                     )}
                   </div>
                </div>
              </div>

              {/* Right Column: Timeline */}
              <div className="w-full md:w-2/3">
                 <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center">
                    <Activity className="w-5 h-5 mr-2 text-blue-900 dark:text-blue-600" /> Interaction Timeline
                 </h3>

                 <div className="mb-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4">
                   <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                     <div>
                       <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Relationship Pulse</h4>
                       <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                         {selectedContact.timelineSummary || 'No relationship summary yet. Log activity or refresh the pulse after the next touch.'}
                       </p>
                       <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                         Last AI refresh: {selectedContact.lastAiReviewedAt ? new Date(selectedContact.lastAiReviewedAt).toLocaleString() : 'Not refreshed yet'}
                       </p>
                     </div>
                     <button
                       onClick={() => void refreshContactTimelineSummary(selectedContact, { notifyOnError: true })}
                       disabled={timelineSummaryRefreshingEmail === normalizeEmail(selectedContact.email || '')}
                       className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-black dark:bg-white text-white dark:text-black text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50"
                     >
                       {timelineSummaryRefreshingEmail === normalizeEmail(selectedContact.email || '') ? (
                         <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                       ) : (
                         <RotateCcw className="w-4 h-4 mr-2" />
                       )}
                       Refresh Pulse
                     </button>
                   </div>
                 </div>
                 
                 {(!selectedContact.messages || selectedContact.messages.length === 0) ? (
                    <div className="p-8 text-center text-zinc-500 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 text-zinc-400" />
                      <p>No recorded interactions yet.</p>
                    </div>
                 ) : (
                   <div className="space-y-4">
                     {selectedContact.messages.map((msg, idx) => (
                       <details key={idx} className="group bg-zinc-50 dark:bg-zinc-950/50 rounded-xl border border-zinc-200 dark:border-zinc-800 [&_summary::-webkit-details-marker]:hidden">
                         <summary className="flex justify-between items-center p-4 cursor-pointer focus:outline-none">
                           <div className="flex items-center">
                             <span className={`text-xs font-bold px-2 py-1 rounded mr-3 ${
                               msg.type === 'call' ? 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-400' :
                               msg.direction === 'outbound' ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-400'}`}>
                                {msg.type === 'call' ? 'Call' : msg.direction === 'outbound' ? 'You Sent' : 'They Replied'}
                             </span>
                             <h4 className="text-sm font-bold text-black dark:text-white truncate max-w-xs">{msg.subject || 'No Subject'}</h4>
                           </div>
                           <div className="flex items-center text-zinc-400">
                             <span className="text-xs mr-3">{new Date(msg.date).toLocaleString()}</span>
                             <button 
                               onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteThreadMessage(selectedContact.email, idx); }}
                               className="p-1 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded transition mr-2"
                               title="Delete message"
                               aria-label="Delete message"
                             >
                               <Trash2 className="w-3.5 h-3.5" />
                             </button>
                             <ChevronRight className="w-4 h-4 transform group-open:rotate-90 transition-transform" />
                           </div>
                         </summary>
                         <div className="p-4 pt-0 border-t border-zinc-200 dark:border-zinc-800 mt-2 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                            {msg.body}
                         </div>
                       </details>
                     ))}
                   </div>
                 )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
