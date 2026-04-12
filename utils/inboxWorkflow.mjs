import { normalizeEmail, isValidEmail } from './dataParsers.mjs';

export const formatCompanyFromEmail = (email = '') => {
  const domain = String(email).split('@')[1] || '';
  const root = domain.split('.')[0] || '';
  if (!root) return 'Unknown';
  return root
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const canReplyToInboxEmail = (email = {}) => isValidEmail(normalizeEmail(email.fromEmail || ''));

export const createComposerResetState = ({ defaultTone = 'Persuasive', defaultLength = 'Concise' } = {}) => ({
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
  tone: defaultTone || 'Persuasive',
  length: defaultLength || 'Concise',
  suggestedSubjects: [],
  sequenceSteps: []
});

export const getInboxReplyMetadata = (email = {}) => {
  const fromEmail = normalizeEmail(email.fromEmail || '');
  const recipientName = String(email.fromName || formatCompanyFromEmail(fromEmail) || 'Unknown Sender').trim();
  const companyName = String(email.company || formatCompanyFromEmail(fromEmail) || 'Unknown').trim();
  const originalSubject = String(email.subject || 'No subject').trim() || 'No subject';
  const subject = /^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`;
  const threadHistory = `[${email.date || 'Unknown date'}] ${recipientName} wrote:\nSubject: ${originalSubject}\n${String(email.body || 'No preview available.')}`;

  return {
    recipientName,
    companyName,
    to: fromEmail,
    subject,
    threadHistory,
    originalSubject
  };
};

export const buildComposerStateFromInboxEmail = ({
  email,
  defaultTone = 'Persuasive',
  defaultLength = 'Concise',
  body = '',
  aiContext = '',
  subjectOverride
} = {}) => {
  const replyMetadata = getInboxReplyMetadata(email);

  return {
    ...createComposerResetState({ defaultTone, defaultLength }),
    recipientName: replyMetadata.recipientName,
    companyName: replyMetadata.companyName,
    to: replyMetadata.to,
    subject: subjectOverride || replyMetadata.subject,
    body,
    threadHistory: replyMetadata.threadHistory,
    aiContext
  };
};

export const buildHandledInboxEmailUpdate = (email = {}, { archiveOriginal = false, resultingFolder } = {}) => ({
  ...email,
  isRead: true,
  needsResponse: false,
  isArchived: archiveOriginal ? true : Boolean(email.isArchived),
  folder: resultingFolder || email.folder
});

export const buildHeuristicInboxInsight = (email = {}) => {
  const subject = String(email.subject || '').toLowerCase();
  const body = String(email.body || '').toLowerCase();
  const combined = `${subject}\n${body}`;

  let score = 42;
  const matchedSignals = [];

  if (/(pricing|quote|proposal|budget|cost|pricing question)/i.test(combined)) {
    score += 22;
    matchedSignals.push('pricing');
  }
  if (/(demo|meeting|call|schedule|next step|timeline)/i.test(combined)) {
    score += 18;
    matchedSignals.push('next-step');
  }
  if (/(urgent|asap|today|this week|immediately)/i.test(combined)) {
    score += 12;
    matchedSignals.push('urgency');
  }
  if (/(interested|ready|let'?s move|sounds good|can you send)/i.test(combined)) {
    score += 14;
    matchedSignals.push('intent');
  }
  if (/(not interested|later|no budget|stop|unsubscribe)/i.test(combined)) {
    score -= 28;
    matchedSignals.push('resistance');
  }

  score = Math.max(1, Math.min(score, 100));

  let summary = 'Moderate intent. Reply with a clear next step and keep momentum moving.';
  if (matchedSignals.includes('pricing') && matchedSignals.includes('next-step')) {
    summary = 'High commercial intent with pricing interest and a clear opening to move the conversation to a call or proposal.';
  } else if (matchedSignals.includes('urgency')) {
    summary = 'Time-sensitive signal detected. Reply quickly with a direct recommendation and a concrete next step.';
  } else if (matchedSignals.includes('intent')) {
    summary = 'Positive buying intent detected. Keep the reply focused on making the next decision easy.';
  } else if (matchedSignals.includes('resistance')) {
    summary = 'Low intent or resistance detected. Use a lighter-touch reply that lowers friction and preserves the relationship.';
  }

  return { score, summary };
};

export const createFollowUpTaskFromInboxEmail = (email = {}, options = {}) => {
  const replyMetadata = getInboxReplyMetadata(email);
  const offsetDays = Number(options.offsetDays ?? 3) || 3;
  const dueDate = new Date();
  dueDate.setHours(0, 0, 0, 0);
  dueDate.setDate(dueDate.getDate() + offsetDays);

  return {
    id: Date.now(),
    contact: replyMetadata.recipientName,
    company: replyMetadata.companyName,
    type: options.taskType || `Follow up if ${replyMetadata.recipientName} has not replied to "${replyMetadata.originalSubject}"`,
    status: 'pending',
    priority: options.priority ?? 70,
    time: '',
    rationale: 'Created automatically from the inbox reply workflow.',
    dueDate: dueDate.toISOString().slice(0, 10),
    sourceInboxId: email.id || null
  };
};

export const getInboxScore = (email = {}) => {
  if (email.aiScore == null) return null;
  const parsed = Number(email.aiScore);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isInboxEmailActionable = (email = {}, options = {}) => {
  const { requireReplyable = false } = options;
  if (email.isArchived) return false;
  if (email.needsResponse === false) return false;
  if (requireReplyable && !canReplyToInboxEmail(email)) return false;
  return true;
};

const getInboxTimestamp = (email = {}) => {
  const timestamp = new Date(email.dateRaw || email.date || 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const sortInboxEmailsByPriority = (emails = []) => {
  if (!Array.isArray(emails)) return [];
  return [...emails].sort((left, right) => {
    const scoreDelta = (getInboxScore(right) ?? -1) - (getInboxScore(left) ?? -1);
    if (scoreDelta !== 0) return scoreDelta;
    return getInboxTimestamp(right) - getInboxTimestamp(left);
  });
};

export const selectUrgentInboxEmails = (emails = [], options = {}) => {
  const { limit = 3, minScore = 70 } = options;
  return sortInboxEmailsByPriority(
    emails.filter((email) => isInboxEmailActionable(email, { requireReplyable: true }) && (getInboxScore(email) ?? -1) >= minScore)
  ).slice(0, limit);
};

export const selectLowPriorityInboxEmails = (emails = [], options = {}) => {
  const { maxScore = 40 } = options;
  return sortInboxEmailsByPriority(
    emails.filter((email) => isInboxEmailActionable(email) && (getInboxScore(email) ?? Number.POSITIVE_INFINITY) <= maxScore)
  );
};