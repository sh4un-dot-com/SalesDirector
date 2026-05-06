import http from 'node:http';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const PORT = toPositiveInt(process.env.PORT, 8787);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const XAI_API_KEY = process.env.XAI_API_KEY || '';
const META_API_KEY = process.env.META_API_KEY || '';
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || '';
const PROXY_SHARED_SECRET = process.env.PROXY_SHARED_SECRET || '';
const MAX_BODY_BYTES = toPositiveInt(process.env.MAX_BODY_BYTES, 1024 * 1024);
const MAX_PROMPT_CHARS = toPositiveInt(process.env.MAX_PROMPT_CHARS, 25000);
const MAX_CONTACT_PROPERTIES = toPositiveInt(process.env.MAX_CONTACT_PROPERTIES, 50);
const RATE_LIMIT_WINDOW_MS = toPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
const RATE_LIMIT_GEMINI = toPositiveInt(process.env.RATE_LIMIT_GEMINI, 20);
const RATE_LIMIT_HUBSPOT_CONTACTS = toPositiveInt(process.env.RATE_LIMIT_HUBSPOT_CONTACTS, 40);
const RATE_LIMIT_HUBSPOT_EMAILS = toPositiveInt(process.env.RATE_LIMIT_HUBSPOT_EMAILS, 30);
const DEFAULT_CONTACT_PROPERTIES = 'firstname,lastname,company,email,hs_lead_status,jobtitle,phone,lifecyclestage';
const DEFAULT_EMAIL_PROPERTIES = [
  'hs_timestamp',
  'hs_email_direction',
  'hs_email_subject',
  'hs_email_text',
  'hs_email_from_email',
  'hs_email_from_firstname',
  'hs_email_from_lastname'
].join(',');
const LOG_LEVEL = String(process.env.LOG_LEVEL || 'info').toLowerCase();

const ROUTE_LIMITS = {
  'POST /api/ai': RATE_LIMIT_GEMINI,
  'POST /api/gemini': RATE_LIMIT_GEMINI,
  'GET /api/hubspot/contacts': RATE_LIMIT_HUBSPOT_CONTACTS,
  'GET /api/hubspot/emails': RATE_LIMIT_HUBSPOT_EMAILS,
  'POST /api/hubspot/emails': RATE_LIMIT_HUBSPOT_EMAILS
};

const AI_PROVIDER_CONFIG = {
  gemini: {
    label: 'Gemini',
    model: 'gemini-2.5-flash',
    envVarName: 'GEMINI_API_KEY'
  },
  openai: {
    label: 'OpenAI',
    model: 'gpt-4.1-mini',
    envVarName: 'OPENAI_API_KEY'
  },
  anthropic: {
    label: 'Anthropic',
    model: 'claude-3-5-sonnet-latest',
    envVarName: 'ANTHROPIC_API_KEY'
  },
  xai: {
    label: 'xAI',
    model: 'grok-2-latest',
    envVarName: 'XAI_API_KEY'
  },
  meta: {
    label: 'Meta',
    model: '',
    envVarName: 'META_API_KEY'
  }
};
const AI_GENERATION_PROFILE_DEFAULTS = Object.freeze({
  temperature: 0.7,
  topP: 0.9,
  maxOutputTokens: 8192
});
const AI_MAX_OUTPUT_TOKENS_LIMIT = 8192;
const AI_CONTINUATION_MAX_REQUESTS = 3;
const AI_CONTINUATION_CONTEXT_CHARS = 4000;

const rateLimitState = new Map();

const LOG_LEVEL_SCORE = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100
};

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const shouldLog = (level) => {
  const target = LOG_LEVEL_SCORE[LOG_LEVEL] ?? LOG_LEVEL_SCORE.info;
  const incoming = LOG_LEVEL_SCORE[level] ?? LOG_LEVEL_SCORE.info;
  return incoming >= target;
};

const logEvent = (level, event, details = {}) => {
  if (!shouldLog(level)) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...details
  };

  const line = JSON.stringify(payload);
  if (level === 'error' || level === 'warn') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
};

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-proxy-secret'
};

const sendJson = (res, statusCode, payload, extraHeaders = {}) => {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  Object.entries(extraHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (res.__requestId) {
    res.setHeader('X-Request-Id', res.__requestId);
  }

  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getClientId = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return String(forwardedFor[0]).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
};

const applyRateLimit = (req, routeKey) => {
  const limit = ROUTE_LIMITS[routeKey];
  if (!limit) return { allowed: true, headers: {} };

  const now = Date.now();
  const clientId = getClientId(req);
  const stateKey = `${routeKey}:${clientId}`;
  const existing = rateLimitState.get(stateKey);

  let record = existing;
  if (!record || now >= record.resetAt) {
    record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  if (record.count >= limit) {
    rateLimitState.set(stateKey, record);
    return {
      allowed: false,
      headers: {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(record.resetAt / 1000)),
        'Retry-After': String(Math.max(1, Math.ceil((record.resetAt - now) / 1000)))
      }
    };
  }

  record.count += 1;
  rateLimitState.set(stateKey, record);

  return {
    allowed: true,
    headers: {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(Math.max(0, limit - record.count)),
      'X-RateLimit-Reset': String(Math.ceil(record.resetAt / 1000))
    }
  };
};

const validatePropertiesQuery = (rawValue) => {
  const incoming = rawValue || DEFAULT_CONTACT_PROPERTIES;
  const parts = incoming
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new HttpError(400, 'At least one contact property is required.');
  }

  if (parts.length > MAX_CONTACT_PROPERTIES) {
    throw new HttpError(400, `Too many contact properties. Max is ${MAX_CONTACT_PROPERTIES}.`);
  }

  parts.forEach((property) => {
    if (!/^[a-zA-Z0-9_]+$/.test(property)) {
      throw new HttpError(400, `Invalid contact property name: ${property}`);
    }
  });

  return Array.from(new Set(parts)).join(',');
};

const validateEmailPropertiesQuery = (rawValue) => {
  const incoming = rawValue || DEFAULT_EMAIL_PROPERTIES;
  const parts = incoming
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new HttpError(400, 'At least one email property is required.');
  }

  if (parts.length > MAX_CONTACT_PROPERTIES) {
    throw new HttpError(400, `Too many email properties. Max is ${MAX_CONTACT_PROPERTIES}.`);
  }

  parts.forEach((property) => {
    if (!/^[a-zA-Z0-9_]+$/.test(property)) {
      throw new HttpError(400, `Invalid email property name: ${property}`);
    }
  });

  return Array.from(new Set(parts)).join(',');
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

const getAiProviderApiKey = (provider) => {
  switch (provider) {
    case 'openai':
      return OPENAI_API_KEY;
    case 'anthropic':
      return ANTHROPIC_API_KEY;
    case 'xai':
      return XAI_API_KEY;
    case 'meta':
      return META_API_KEY;
    case 'gemini':
    default:
      return GEMINI_API_KEY;
  }
};

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

const getProviderErrorMessage = async (response, fallbackMessage) => {
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

const validateAiGenerationProfile = (value) => {
  if (value === undefined) {
    return buildAiGenerationProfile();
  }

  if (!isPlainObject(value)) {
    throw new HttpError(400, 'generationProfile must be a JSON object when provided.');
  }

  if (value.temperature !== undefined) {
    const parsed = Number(value.temperature);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1.5) {
      throw new HttpError(400, 'generationProfile.temperature must be between 0 and 1.5.');
    }
  }

  if (value.topP !== undefined) {
    const parsed = Number(value.topP);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new HttpError(400, 'generationProfile.topP must be between 0 and 1.');
    }
  }

  if (value.maxOutputTokens !== undefined) {
    const parsed = Number(value.maxOutputTokens);
    if (!Number.isInteger(parsed) || parsed < 256 || parsed > AI_MAX_OUTPUT_TOKENS_LIMIT) {
      throw new HttpError(400, `generationProfile.maxOutputTokens must be an integer between 256 and ${AI_MAX_OUTPUT_TOKENS_LIMIT}.`);
    }
  }

  return buildAiGenerationProfile(value);
};

const validateAiBody = (body) => {
  if (!isPlainObject(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const provider = normalizeAiProvider(body.provider);

  if (typeof body.promptText !== 'string') {
    throw new HttpError(400, 'promptText must be a string.');
  }

  const promptText = body.promptText.trim();
  if (!promptText) {
    throw new HttpError(400, 'promptText is required.');
  }

  if (promptText.length > MAX_PROMPT_CHARS) {
    throw new HttpError(400, `promptText exceeds max length (${MAX_PROMPT_CHARS}).`);
  }

  if (body.systemInstruction !== undefined) {
    if (!isPlainObject(body.systemInstruction) || !Array.isArray(body.systemInstruction.parts) || body.systemInstruction.parts.length === 0) {
      throw new HttpError(400, 'systemInstruction must include a non-empty parts array.');
    }

    body.systemInstruction.parts.forEach((part, index) => {
      if (!isPlainObject(part) || typeof part.text !== 'string' || !part.text.trim()) {
        throw new HttpError(400, `systemInstruction.parts[${index}] must include a non-empty text field.`);
      }
    });
  }

  const generationProfile = validateAiGenerationProfile(body.generationProfile);

  return {
    provider,
    promptText,
    systemInstruction: body.systemInstruction || {
      parts: [{ text: 'You are an elite Virtual Sales Director. No emojis.' }]
    },
    generationProfile
  };
};

const validateHubSpotEmailBody = (body) => {
  if (!isPlainObject(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  if (!isPlainObject(body.properties)) {
    throw new HttpError(400, 'properties object is required.');
  }

  const requiredStringFields = [
    'hs_timestamp',
    'hs_email_direction',
    'hs_email_status',
    'hs_email_subject',
    'hs_email_text'
  ];

  requiredStringFields.forEach((field) => {
    if (typeof body.properties[field] !== 'string' || !body.properties[field].trim()) {
      throw new HttpError(400, `properties.${field} must be a non-empty string.`);
    }
  });

  if (body.properties.hs_email_subject.length > 500) {
    throw new HttpError(400, 'properties.hs_email_subject exceeds 500 characters.');
  }

  if (body.properties.hs_email_text.length > 50000) {
    throw new HttpError(400, 'properties.hs_email_text exceeds 50000 characters.');
  }

  if (!Array.isArray(body.associations) || body.associations.length === 0) {
    throw new HttpError(400, 'associations must be a non-empty array.');
  }

  body.associations.forEach((association, index) => {
    if (!isPlainObject(association) || !isPlainObject(association.to) || (!Number.isFinite(Number(association.to.id)) && typeof association.to.id !== 'string')) {
      throw new HttpError(400, `associations[${index}].to.id is required.`);
    }

    if (!Array.isArray(association.types) || association.types.length === 0) {
      throw new HttpError(400, `associations[${index}].types must be a non-empty array.`);
    }

    association.types.forEach((typeEntry, typeIndex) => {
      if (!isPlainObject(typeEntry) || typeof typeEntry.associationCategory !== 'string' || !Number.isFinite(Number(typeEntry.associationTypeId))) {
        throw new HttpError(400, `associations[${index}].types[${typeIndex}] is invalid.`);
      }
    });
  });
};

const readJsonBody = async (req) => {
  const contentLengthHeader = req.headers['content-length'];
  const contentLength = Number(contentLengthHeader);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new HttpError(413, `Request body exceeds max size (${MAX_BODY_BYTES} bytes).`);
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new HttpError(413, `Request body exceeds max size (${MAX_BODY_BYTES} bytes).`);
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
};

const hasSecretMismatch = (req) => {
  if (!PROXY_SHARED_SECRET) return false;
  const incoming = req.headers['x-proxy-secret'];
  return incoming !== PROXY_SHARED_SECRET;
};

const requestAiText = async ({ provider, promptText, systemInstruction, generationProfile }) => {
  const providerConfig = AI_PROVIDER_CONFIG[provider] || AI_PROVIDER_CONFIG.gemini;
  const apiKey = getAiProviderApiKey(provider);
  const systemText = getAiSystemInstructionText(systemInstruction);
  const sharedGenerationProfile = buildAiGenerationProfile(generationProfile);

  if (!apiKey) {
    throw new HttpError(500, `${providerConfig.envVarName} is not configured on the proxy.`);
  }

  if (provider === 'meta') {
    throw new HttpError(400, 'Meta proxy routing is not available yet.');
  }

  const requestSingleText = async (requestPromptText) => {
    if (provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${providerConfig.model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: requestPromptText }] }],
          systemInstruction,
          generationConfig: buildGeminiGenerationConfig(sharedGenerationProfile)
        })
      });

      if (!response.ok) {
        throw new HttpError(response.status, await getProviderErrorMessage(response, `${providerConfig.label} request failed`));
      }

      const data = await response.json().catch(() => ({}));
      const text = flattenProviderText((data?.candidates || []).map((candidate) => candidate?.content?.parts || []));
      if (!String(text || '').trim()) {
        const finishReason = String(data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || '').trim();
        throw new HttpError(502, finishReason
          ? `${providerConfig.label} returned no usable text (${finishReason}).`
          : `${providerConfig.label} returned no usable text.`);
      }

      return {
        text: String(text).trim(),
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
          model: providerConfig.model,
          ...buildAnthropicGenerationConfig(sharedGenerationProfile),
          system: systemText || undefined,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: requestPromptText }]
            }
          ]
        })
      });

      if (!response.ok) {
        throw new HttpError(response.status, await getProviderErrorMessage(response, `${providerConfig.label} request failed`));
      }

      const data = await response.json().catch(() => ({}));
      const text = flattenProviderText(data?.content || []);
      if (!String(text || '').trim()) {
        throw new HttpError(502, `${providerConfig.label} returned no usable text.`);
      }

      return {
        text: String(text).trim(),
        shouldContinue: hasLengthLimitedAiResponse(provider, data?.stop_reason)
      };
    }

    const response = await fetch(provider === 'xai' ? 'https://api.x.ai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: providerConfig.model,
        ...buildOpenAiCompatibleGenerationConfig(sharedGenerationProfile),
        messages: [
          ...(systemText ? [{ role: 'system', content: systemText }] : []),
          { role: 'user', content: requestPromptText }
        ]
      })
    });

    if (!response.ok) {
      throw new HttpError(response.status, await getProviderErrorMessage(response, `${providerConfig.label} request failed`));
    }

    const data = await response.json().catch(() => ({}));
    const text = flattenProviderText(data?.choices?.[0]?.message?.content);
    if (!String(text || '').trim()) {
      throw new HttpError(502, `${providerConfig.label} returned no usable text.`);
    }

    return {
      text: String(text).trim(),
      shouldContinue: hasLengthLimitedAiResponse(provider, data?.choices?.[0]?.finish_reason)
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

  if (!String(accumulatedText || '').trim()) {
    throw new HttpError(502, `${providerConfig.label} returned no usable text.`);
  }

  return String(accumulatedText).trim();
};

const handleAi = async (req, res) => {
  const body = await readJsonBody(req);
  const { provider, promptText, systemInstruction, generationProfile } = validateAiBody(body);
  const text = await requestAiText({ provider, promptText, systemInstruction, generationProfile });
  sendJson(res, 200, { provider, text });
};

const handleHubSpotContacts = async (req, res, url) => {
  if (!HUBSPOT_TOKEN) {
    sendJson(res, 500, { error: 'HUBSPOT_TOKEN is not configured on the proxy.' });
    return;
  }

  const properties = validatePropertiesQuery(url.searchParams.get('properties'));
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts?properties=${encodeURIComponent(properties)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    sendJson(res, response.status, { error: data.message || 'HubSpot contacts request failed.' });
    return;
  }

  sendJson(res, 200, data);
};

const handleHubSpotEmailsList = async (res, url) => {
  if (!HUBSPOT_TOKEN) {
    sendJson(res, 500, { error: 'HUBSPOT_TOKEN is not configured on the proxy.' });
    return;
  }

  const properties = validateEmailPropertiesQuery(url.searchParams.get('properties'));
  const requestedLimit = Number(url.searchParams.get('limit') || 50);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    throw new HttpError(400, 'limit must be an integer between 1 and 100.');
  }

  const after = url.searchParams.get('after');
  const query = new URLSearchParams({
    properties,
    limit: String(requestedLimit)
  });
  if (after) {
    query.set('after', after);
  }

  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/emails?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    sendJson(res, response.status, { error: data.message || 'HubSpot email list request failed.' });
    return;
  }

  sendJson(res, 200, data);
};

const handleHubSpotEmailsCreate = async (req, res) => {
  if (!HUBSPOT_TOKEN) {
    sendJson(res, 500, { error: 'HUBSPOT_TOKEN is not configured on the proxy.' });
    return;
  }

  const body = await readJsonBody(req);
  validateHubSpotEmailBody(body);

  const response = await fetch('https://api.hubapi.com/crm/v3/objects/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    sendJson(res, response.status, { error: data.message || 'HubSpot email log request failed.' });
    return;
  }

  sendJson(res, 200, data);
};

const server = http.createServer(async (req, res) => {
  const requestId = randomUUID();
  res.__requestId = requestId;
  const startedAt = Date.now();

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const method = req.method || 'GET';
  const clientId = getClientId(req);

  res.on('finish', () => {
    logEvent('info', 'request.completed', {
      requestId,
      method,
      path: requestUrl.pathname,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      clientId
    });
  });

  logEvent('debug', 'request.received', {
    requestId,
    method,
    path: requestUrl.pathname,
    clientId
  });

  try {
    if (req.method === 'OPTIONS') {
      Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.statusCode = 204;
      res.end();
      return;
    }

    if (hasSecretMismatch(req)) {
      logEvent('warn', 'auth.secret_mismatch', { requestId, method, path: requestUrl.pathname, clientId });
      sendJson(res, 401, { error: 'Unauthorized proxy access.' });
      return;
    }

    const routeKey = `${method} ${requestUrl.pathname}`;
    const rateResult = applyRateLimit(req, routeKey);
    Object.entries(rateResult.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    if (!rateResult.allowed) {
      logEvent('warn', 'rate_limit.exceeded', { requestId, routeKey, clientId });
      sendJson(res, 429, { error: 'Rate limit exceeded. Please retry later.' });
      return;
    }

    if (method === 'POST' && (requestUrl.pathname === '/api/ai' || requestUrl.pathname === '/api/gemini')) {
      await handleAi(req, res);
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/hubspot/contacts') {
      await handleHubSpotContacts(req, res, requestUrl);
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/hubspot/emails') {
      await handleHubSpotEmailsList(res, requestUrl);
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/hubspot/emails') {
      await handleHubSpotEmailsCreate(req, res);
      return;
    }

    sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    logEvent(statusCode >= 500 ? 'error' : 'warn', 'request.failed', {
      requestId,
      method,
      path: requestUrl.pathname,
      statusCode,
      message: error?.message || 'Proxy server error',
      clientId
    });
    sendJson(res, statusCode, { error: error.message || 'Proxy server error.' });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SalesDirector proxy listening on http://localhost:${PORT}`);
});
