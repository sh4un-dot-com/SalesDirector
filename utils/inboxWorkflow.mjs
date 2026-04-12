import { normalizeEmail, isValidEmail } from './dataParsers.mjs';
import { dateKeyToDate, formatDateKey } from './crmWorkflow.mjs';

export const DEFAULT_SEQUENCE_CADENCE_ID = 'standard';
export const DEFAULT_SEQUENCE_STEP_COUNT = 3;

export const OUTREACH_PLAYBOOKS = [
  {
    id: 'cold-intro',
    label: 'Cold Intro',
    description: 'Lead with relevance, identify a clear pain point, and earn a low-friction first reply.',
    recommendedStages: ['Lead', 'Contact'],
    defaultTone: 'Consultative',
    keyMoves: ['Open with a business-specific observation', 'Offer one concrete angle of value', 'Ask for a lightweight next step']
  },
  {
    id: 'opportunity-advance',
    label: 'Advance Opportunity',
    description: 'Move an active opportunity toward a decision by clarifying urgency, stakeholders, and next action.',
    recommendedStages: ['Opportunity'],
    defaultTone: 'Professional',
    keyMoves: ['Reference the current buying motion', 'Reduce decision friction', 'Lock in the next meeting or deliverable']
  },
  {
    id: 'proposal-close',
    label: 'Proposal Close',
    description: 'Create urgency around an open proposal and make the decision path feel obvious and safe.',
    recommendedStages: ['Proposal'],
    defaultTone: 'Direct',
    keyMoves: ['Reframe value in commercial terms', 'Surface risk of delay', 'Offer a simple approval or review step']
  },
  {
    id: 'reactivation',
    label: 'Reactivation',
    description: 'Re-open a stalled conversation with a lighter touch, a new angle, and a clear reason to reply now.',
    recommendedStages: ['Lead', 'Contact', 'Opportunity', 'Proposal'],
    defaultTone: 'Friendly',
    keyMoves: ['Acknowledge the gap without guilt', 'Introduce a fresh insight or update', 'Give an easy yes/no path']
  },
  {
    id: 'post-meeting',
    label: 'Post-Meeting Follow-Up',
    description: 'Convert a meeting into momentum with recap clarity, owners, and a pre-decided next step.',
    recommendedStages: ['Opportunity', 'Proposal', 'Customer'],
    defaultTone: 'Professional',
    keyMoves: ['Recap agreed outcomes', 'Assign owners and timing', 'Keep the next commitment concrete']
  }
];

export const SEQUENCE_CADENCE_OPTIONS = [
  {
    id: 'same-week',
    label: 'Same Week Push',
    description: 'Compressed follow-up for warm inbound, active opportunities, or urgent asks.',
    delays: [0, 2, 4, 7, 10]
  },
  {
    id: 'standard',
    label: 'Standard Prospecting',
    description: 'Balanced follow-up rhythm for most B2B outbound sequences.',
    delays: [0, 3, 7, 12, 18]
  },
  {
    id: 'long-cycle',
    label: 'Long-Cycle Enterprise',
    description: 'More patient cadence for complex deals with slower stakeholder alignment.',
    delays: [0, 5, 12, 21, 30]
  },
  {
    id: 'proposal-close',
    label: 'Proposal Close Sprint',
    description: 'Short, direct cadence tuned for proposal follow-up and decision pressure.',
    delays: [0, 2, 5, 9, 14]
  },
  {
    id: 'reactivation',
    label: 'Reactivation',
    description: 'Slower spacing for stale threads that need a fresh reason to engage.',
    delays: [0, 7, 14, 24, 35]
  }
];

export const getOutreachPlaybookById = (playbookId = '') => {
  const normalizedId = String(playbookId || '').trim();
  return OUTREACH_PLAYBOOKS.find((playbook) => playbook.id === normalizedId) || null;
};

export const getSequenceCadenceById = (cadenceId = DEFAULT_SEQUENCE_CADENCE_ID, stepCount = DEFAULT_SEQUENCE_STEP_COUNT) => {
  const normalizedId = String(cadenceId || '').trim() || DEFAULT_SEQUENCE_CADENCE_ID;
  const baseCadence = SEQUENCE_CADENCE_OPTIONS.find((cadence) => cadence.id === normalizedId)
    || SEQUENCE_CADENCE_OPTIONS.find((cadence) => cadence.id === DEFAULT_SEQUENCE_CADENCE_ID)
    || SEQUENCE_CADENCE_OPTIONS[0];
  const normalizedStepCount = Math.max(2, Math.min(5, Number(stepCount) || DEFAULT_SEQUENCE_STEP_COUNT));

  return {
    ...baseCadence,
    stepCount: normalizedStepCount,
    delays: baseCadence.delays.slice(0, normalizedStepCount)
  };
};

export const getRecommendedOutreachStrategy = (context = {}) => {
  const stage = String(context.stage || '').trim();
  const isStale = Boolean(context.isStale);
  const followUpDue = Boolean(context.followUpDue);
  const hasThreadHistory = Boolean(String(context.threadHistory || '').trim());
  const hasInboxSignal = Boolean(context.hasInboxSignal);

  if (stage === 'Proposal') {
    return { playbookId: 'proposal-close', cadenceId: 'proposal-close' };
  }
  if (isStale) {
    return { playbookId: 'reactivation', cadenceId: 'reactivation' };
  }
  if (stage === 'Opportunity' || followUpDue) {
    return { playbookId: hasThreadHistory || hasInboxSignal ? 'opportunity-advance' : 'cold-intro', cadenceId: 'same-week' };
  }
  if (stage === 'Customer') {
    return { playbookId: 'post-meeting', cadenceId: 'standard' };
  }
  return { playbookId: 'cold-intro', cadenceId: hasInboxSignal ? 'same-week' : 'standard' };
};

export const buildOutreachPlayContext = ({
  playbookId = '',
  cadenceId = DEFAULT_SEQUENCE_CADENCE_ID,
  stepCount = DEFAULT_SEQUENCE_STEP_COUNT,
  recipientName = '',
  companyName = '',
  stage = '',
  nextStep = '',
  followUpAt = '',
  aiSummary = '',
  timelineSummary = ''
} = {}) => {
  const playbook = getOutreachPlaybookById(playbookId);
  const cadence = getSequenceCadenceById(cadenceId, stepCount);
  if (!playbook) return '';

  const cadenceSummary = cadence.delays
    .map((delay, index) => `Step ${index + 1}: Day ${delay}`)
    .join(' | ');

  return [
    `[OUTREACH PLAY: ${playbook.label}]`,
    `Recipient: ${recipientName || 'Unknown'}${companyName ? ` at ${companyName}` : ''}`,
    `Stage: ${stage || 'Unknown'}`,
    `Recommended Tone: ${playbook.defaultTone}`,
    `Cadence: ${cadence.label} (${cadenceSummary})`,
    `Objective: ${playbook.description}`,
    playbook.keyMoves.length > 0 ? `Key Moves: ${playbook.keyMoves.join(' | ')}` : '',
    nextStep ? `Current Next Step: ${nextStep}` : '',
    followUpAt ? `Follow-Up Date: ${followUpAt}` : '',
    aiSummary ? `AI Summary: ${aiSummary}` : '',
    timelineSummary ? `Timeline Summary: ${timelineSummary}` : ''
  ].filter(Boolean).join('\n');
};

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
  selectedPlaybookId: '',
  sequenceCadenceId: DEFAULT_SEQUENCE_CADENCE_ID,
  sequenceStepCount: DEFAULT_SEQUENCE_STEP_COUNT,
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

export const parseSequenceSteps = (sequenceText = '') => {
  const normalized = String(sequenceText || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const stepRegex = /Step\s*(\d+)\s*-\s*([^\n]+)\n(?:Delay:\s*([^\n]+)\n)?(?:Goal:\s*([^\n]+)\n)?Subject:\s*([^\n]+)\nBody:\s*([\s\S]*?)(?=\nStep\s*\d+\s*-|$)/gi;
  const steps = [];
  let match;

  while ((match = stepRegex.exec(normalized)) !== null) {
    const stepNumber = Number(match[1]);
    const stepTitle = String(match[2] || '').trim();
    const delayLabel = String(match[3] || '').trim();
    const goal = String(match[4] || '').trim();
    const subject = String(match[5] || '').trim();
    const body = String(match[6] || '').trim();
    const delayDaysMatch = delayLabel.match(/-?\d+/);
    const delayDays = delayDaysMatch ? Number(delayDaysMatch[0]) : null;

    if (stepNumber && subject && body) {
      steps.push({
        stepNumber,
        stepTitle,
        delayLabel,
        delayDays: Number.isFinite(delayDays) ? delayDays : null,
        goal,
        subject,
        body
      });
    }
  }

  return steps.sort((left, right) => left.stepNumber - right.stepNumber);
};

export const createSequenceTasksFromSteps = (steps = [], options = {}) => {
  if (!Array.isArray(steps) || steps.length === 0) return [];

  const {
    baseDateKey = formatDateKey(new Date()),
    recipientName = '',
    companyName = '',
    recipientEmail = '',
    owner = '',
    defaultPriority = 72
  } = options;

  const normalizedEmail = normalizeEmail(recipientEmail);
  const baseDate = dateKeyToDate(baseDateKey) || dateKeyToDate(formatDateKey(new Date())) || new Date();
  const sequenceSeed = `sequence-${Date.now()}`;
  let dayOffset = 0;

  return steps
    .slice()
    .sort((left, right) => left.stepNumber - right.stepNumber)
    .map((step, index) => {
      const incrementalDelay = Number.isFinite(step?.delayDays)
        ? Math.max(0, Number(step.delayDays))
        : (index === 0 ? 0 : 3);
      dayOffset += index === 0 ? 0 : incrementalDelay;

      const scheduledDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + dayOffset);
      const scheduledDateKey = formatDateKey(scheduledDate);
      const targetLabel = recipientName || companyName || normalizedEmail || 'prospect';
      const titlePrefix = step?.stepTitle || `Sequence Step ${step?.stepNumber || index + 1}`;

      return {
        id: `${sequenceSeed}-${step?.stepNumber || index + 1}`,
        title: `${titlePrefix}: Follow up with ${targetLabel}`,
        type: 'follow-up',
        status: 'pending',
        priority: Math.max(40, defaultPriority - (index * 4)),
        dueDate: scheduledDateKey,
        scheduledDate: scheduledDateKey,
        durationMinutes: 20,
        contact: recipientName,
        contactEmail: normalizedEmail,
        company: companyName,
        owner,
        focus: 'sales',
        rationale: step?.goal || `Send sequence step ${step?.stepNumber || index + 1} on time and keep the deal moving.`,
        notes: `Subject: ${step?.subject || ''}\n\n${step?.body || ''}`.trim(),
        source: 'sequence',
        templateId: 'ai-sequence-follow-up',
        recurrenceLabel: `Step ${step?.stepNumber || index + 1}`
      };
    });
};