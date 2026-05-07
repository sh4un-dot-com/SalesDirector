import { normalizeEmail } from './dataParsers.mjs';

export const CONTACT_STAGE_OPTIONS = ['Lead', 'Contact', 'Opportunity', 'Proposal', 'Customer', 'Churned'];
export const CONTACT_SOURCE_OPTIONS = ['Manual', 'HubSpot', 'Inbox', 'Referral', 'Website', 'Import'];
export const CONTACT_CHANNEL_OPTIONS = ['email', 'call', 'linkedin', 'meeting'];
export const CONTACT_TEMPERATURE_OPTIONS = ['Cold', 'Warm', 'Hot'];
export const PIPELINE_STAGE_WEIGHTS = {
  Lead: 0.1,
  Contact: 0.2,
  Opportunity: 0.5,
  Proposal: 0.75,
  Customer: 1,
  Churned: 0
};

export const TASK_TYPE_OPTIONS = ['follow-up', 'call', 'meeting', 'proposal', 'research', 'admin'];
export const TASK_STATUS_OPTIONS = ['pending', 'in-progress', 'waiting', 'completed'];
export const TASK_FOCUS_OPTIONS = ['sales', 'deep-work', 'meeting', 'admin'];
export const TIMEZONE_PRESET_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (New York / Toronto)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Halifax', label: 'Atlantic (Halifax)' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Berlin', label: 'Berlin / Central Europe' },
  { value: 'UTC', label: 'UTC' }
];
export const TASK_TEMPLATE_DEFINITIONS = [
  {
    id: 'morning-pipeline-sweep',
    label: 'Morning Pipeline Sweep',
    description: 'Protect revenue early by reviewing hot leads, inbox urgency, and same-day follow-ups.',
    recurrenceLabel: 'Weekday',
    tasks: [
      { title: 'Review hot opportunities and blockers', type: 'research', priority: 82, focus: 'sales', durationMinutes: 20 },
      { title: 'Reply to urgent leads from inbox and CRM', type: 'follow-up', priority: 88, focus: 'sales', durationMinutes: 35 },
      { title: 'Schedule next actions for every live deal', type: 'admin', priority: 72, focus: 'admin', durationMinutes: 20 }
    ]
  },
  {
    id: 'weekly-pipeline-review',
    label: 'Weekly Pipeline Review',
    description: 'Re-forecast proposals, stale deals, and next actions before the week drifts.',
    recurrenceLabel: 'Weekly',
    tasks: [
      { title: 'Audit proposal-stage deals and close risks', type: 'proposal', priority: 86, focus: 'deep-work', durationMinutes: 40 },
      { title: 'Update deal values, stages, and owners in CRM', type: 'admin', priority: 70, focus: 'admin', durationMinutes: 30 },
      { title: 'Book follow-up touches for stalled opportunities', type: 'follow-up', priority: 78, focus: 'sales', durationMinutes: 30 }
    ]
  },
  {
    id: 'friday-follow-up-reset',
    label: 'Friday Follow-Up Reset',
    description: 'Clean the board before the weekend so nothing important disappears on Monday.',
    recurrenceLabel: 'Weekly',
    tasks: [
      { title: 'Clear overdue follow-ups and move the rest to next week', type: 'follow-up', priority: 76, focus: 'sales', durationMinutes: 30 },
      { title: 'Send proposal nudges to open commercial threads', type: 'proposal', priority: 81, focus: 'sales', durationMinutes: 25 },
      { title: 'Summarize wins, misses, and next-week priorities', type: 'admin', priority: 64, focus: 'admin', durationMinutes: 20 }
    ]
  }
];

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;
const SYSTEM_TIMEZONE_VALUE = 'system';

const ensureString = (value = '') => String(value ?? '').trim();
const padNumber = (value) => String(value).padStart(2, '0');
const TIMEZONE_ALIAS_MAP = Object.freeze({
  EST: 'America/New_York',
  CST: 'America/Chicago',
  MST: 'America/Denver',
  PST: 'America/Los_Angeles'
});

const isValidIntlTimeZone = (value = '') => {
  const normalized = ensureString(value);
  if (!normalized) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

export const normalizePlanningTimeZone = (value = '') => {
  const normalized = ensureString(value);
  if (!normalized || normalized.toLowerCase() === SYSTEM_TIMEZONE_VALUE) {
    return SYSTEM_TIMEZONE_VALUE;
  }

  const mapped = TIMEZONE_ALIAS_MAP[normalized.toUpperCase()] || normalized;
  return isValidIntlTimeZone(mapped) ? mapped : SYSTEM_TIMEZONE_VALUE;
};

const resolveIntlTimeZone = (value = SYSTEM_TIMEZONE_VALUE) => {
  const normalized = normalizePlanningTimeZone(value);
  return normalized === SYSTEM_TIMEZONE_VALUE ? undefined : normalized;
};

const parseDateKeyParts = (value = '') => {
  const normalized = ensureString(value);
  if (!DATE_KEY_PATTERN.test(normalized)) return null;

  const [year, month, day] = normalized.split('-').map((part) => Number(part));
  if (![year, month, day].every((part) => Number.isInteger(part))) return null;

  return {
    year,
    monthIndex: month - 1,
    day
  };
};

const clampNumber = (value, min, max, fallback = null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const parseCurrencyNumber = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  const cleaned = String(value).replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
};

export const formatDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (DATE_KEY_PATTERN.test(trimmed)) return trimmed;
    if (MONTH_KEY_PATTERN.test(trimmed)) return `${trimmed}-01`;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
};

const getZonedDateParts = (value, timeZone = SYSTEM_TIMEZONE_VALUE) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) return null;

  const resolvedTimeZone = resolveIntlTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat('en-US', {
    ...(resolvedTimeZone ? { timeZone: resolvedTimeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = {};
  formatter.formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  });

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (![year, month, day].every((part) => Number.isInteger(part))) return null;

  return { year, month, day };
};

export const formatDateKeyInTimeZone = (value, timeZone = SYSTEM_TIMEZONE_VALUE) => {
  if (value == null || value === '') return '';
  const parts = getZonedDateParts(value, timeZone);
  if (!parts) return '';
  return `${parts.year}-${padNumber(parts.month)}-${padNumber(parts.day)}`;
};

export const formatDateTimeInTimeZone = (value, timeZone = SYSTEM_TIMEZONE_VALUE, options = { dateStyle: 'medium', timeStyle: 'short' }) => {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const resolvedTimeZone = resolveIntlTimeZone(timeZone);
  return new Intl.DateTimeFormat(undefined, {
    ...(resolvedTimeZone ? { timeZone: resolvedTimeZone } : {}),
    ...options
  }).format(date);
};

export const dateKeyToDate = (value = '') => {
  const normalizedDateKey = formatDateKey(value);
  const parts = parseDateKeyParts(normalizedDateKey);
  if (!parts) return null;

  const date = new Date(parts.year, parts.monthIndex, parts.day, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatMonthKey = (value = new Date()) => {
  const dateKey = formatDateKey(value);
  return dateKey ? dateKey.slice(0, 7) : formatDateKey(new Date()).slice(0, 7);
};

export const parseTimeToMinutes = (value = '') => {
  const normalized = ensureString(value)
    .replace(/^\[|\]$/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();

  if (!normalized) return null;

  const hourMinuteMatch = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
  if (hourMinuteMatch) {
    let hours = Number(hourMinuteMatch[1]);
    const minutes = Number(hourMinuteMatch[2]);
    const meridiem = hourMinuteMatch[3] || '';

    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
      return null;
    }

    if (meridiem) {
      if (hours < 1 || hours > 12) return null;
      if (meridiem === 'AM') {
        hours = hours === 12 ? 0 : hours;
      } else {
        hours = hours === 12 ? 12 : hours + 12;
      }
    } else if (hours < 0 || hours > 23) {
      return null;
    }

    return hours * 60 + minutes;
  }

  const hourOnlyMatch = normalized.match(/^(\d{1,2})(?:\s*(AM|PM))$/);
  if (hourOnlyMatch) {
    let hours = Number(hourOnlyMatch[1]);
    const meridiem = hourOnlyMatch[2];
    if (!Number.isInteger(hours) || hours < 1 || hours > 12) return null;

    if (meridiem === 'AM') {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }

    return hours * 60;
  }

  return null;
};

const toTitleCase = (value = '') => value
  .split(/[_\s-]+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  .join(' ');

const normalizeStage = (value = '') => {
  const normalized = ensureString(value).toLowerCase().replace(/[^a-z]/g, '');
  const stageMap = {
    subscriber: 'Lead',
    lead: 'Lead',
    marketingqualifiedlead: 'Contact',
    salesqualifiedlead: 'Opportunity',
    contact: 'Contact',
    opportunity: 'Opportunity',
    proposal: 'Proposal',
    evangelist: 'Customer',
    customer: 'Customer',
    churned: 'Churned'
  };

  if (stageMap[normalized]) {
    return stageMap[normalized];
  }

  const titled = toTitleCase(value);
  return CONTACT_STAGE_OPTIONS.includes(titled) ? titled : 'Lead';
};

const normalizeTemperature = (value = '', stage = 'Lead') => {
  const normalized = ensureString(value).toLowerCase();
  if (normalized.includes('hot')) return 'Hot';
  if (normalized.includes('warm') || normalized.includes('qualified')) return 'Warm';
  if (normalized.includes('cold')) return 'Cold';
  if (stage === 'Opportunity' || stage === 'Proposal') return 'Hot';
  if (stage === 'Customer') return 'Warm';
  return 'Cold';
};

const normalizeContactSource = (value = '') => {
  const normalized = ensureString(value).toLowerCase();
  if (!normalized) return 'Manual';
  if (normalized.includes('hubspot')) return 'HubSpot';
  if (normalized.includes('inbox') || normalized.includes('imap')) return 'Inbox';
  if (normalized.includes('referral')) return 'Referral';
  if (normalized.includes('website') || normalized.includes('site')) return 'Website';
  if (normalized.includes('import') || normalized.includes('csv')) return 'Import';
  return toTitleCase(value) || 'Manual';
};

const normalizeChannel = (value = '') => {
  const normalized = ensureString(value).toLowerCase();
  if (CONTACT_CHANNEL_OPTIONS.includes(normalized)) return normalized;
  if (normalized.includes('linked')) return 'linkedin';
  if (normalized.includes('meet')) return 'meeting';
  if (normalized.includes('call') || normalized.includes('phone')) return 'call';
  return 'email';
};

const normalizeTaskType = (value = '') => {
  const normalized = ensureString(value).toLowerCase();
  if (!normalized) return 'follow-up';
  if (TASK_TYPE_OPTIONS.includes(normalized)) return normalized;
  if (normalized.includes('call') || normalized.includes('phone')) return 'call';
  if (normalized.includes('meeting') || normalized.includes('demo')) return 'meeting';
  if (normalized.includes('proposal') || normalized.includes('quote')) return 'proposal';
  if (normalized.includes('research')) return 'research';
  if (normalized.includes('admin')) return 'admin';
  return 'follow-up';
};

const normalizeTaskStatus = (value = '') => {
  const normalized = ensureString(value).toLowerCase();
  if (TASK_STATUS_OPTIONS.includes(normalized)) return normalized;
  if (normalized.includes('progress') || normalized.includes('doing')) return 'in-progress';
  if (normalized.includes('wait')) return 'waiting';
  if (normalized.includes('complete') || normalized.includes('done')) return 'completed';
  return 'pending';
};

const normalizeTaskFocus = (value = '', type = 'follow-up') => {
  const normalized = ensureString(value).toLowerCase();
  if (TASK_FOCUS_OPTIONS.includes(normalized)) return normalized;
  if (normalized.includes('deep')) return 'deep-work';
  if (normalized.includes('meet')) return 'meeting';
  if (normalized.includes('admin')) return 'admin';
  return type === 'admin' ? 'admin' : type === 'meeting' ? 'meeting' : 'sales';
};

const normalizeTimeValue = (value = '') => ensureString(value).replace(/^\[|\]$/g, '');

const STAGE_POSITION = {
  Churned: -1,
  Lead: 0,
  Contact: 1,
  Opportunity: 2,
  Proposal: 3,
  Customer: 4
};

const TEMPERATURE_RANK = {
  Cold: 0,
  Warm: 1,
  Hot: 2
};

const normalizeStageHistory = (history = []) => {
  if (!Array.isArray(history)) return [];

  return history
    .map((entry) => {
      if (!entry) return null;

      const stage = normalizeStage(typeof entry === 'string' ? entry : entry.stage);
      const rawDate = typeof entry === 'string' ? '' : (entry.date || entry.changedAt || entry.at || '');
      const parsedDate = rawDate ? new Date(rawDate) : null;

      return {
        stage,
        date: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : ''
      };
    })
    .filter(Boolean)
    .sort((left, right) => new Date(left.date || 0) - new Date(right.date || 0))
    .reduce((entries, entry) => {
      const previous = entries[entries.length - 1];
      if (previous && previous.stage === entry.stage && previous.date === entry.date) {
        return entries;
      }
      entries.push(entry);
      return entries;
    }, []);
};

export const createEmptyContact = (seed = {}) => normalizeContactRecord({
  name: '',
  email: '',
  company: '',
  jobTitle: '',
  phone: '',
  stage: 'Lead',
  status: 'New',
  linkedin: '',
  website: '',
  industry: '',
  city: '',
  owner: '',
  source: 'Manual',
  preferredChannel: 'email',
  leadTemperature: 'Cold',
  buyingRole: '',
  estimatedValue: '',
  priorityScore: 50,
  lastContactedAt: '',
  nextFollowUpAt: '',
  nextStep: '',
  aiSummary: '',
  timelineSummary: '',
  painPoints: '',
  notes: '',
  stageHistory: [],
  _isNew: true,
  ...seed
});

export const normalizeContactRecord = (contact = {}, index = 0) => {
  const email = normalizeEmail(contact.email || contact.contactEmail || '');
  const stage = normalizeStage(contact.stage || contact.lifecycleStage || contact.lifecyclestage || contact.status);
  const estimatedValue = parseCurrencyNumber(contact.estimatedValue ?? contact.dealValue ?? contact.value);
  const priorityScore = clampNumber(contact.priorityScore ?? contact.aiScore ?? contact.score, 1, 100, 50);
  const nextFollowUpAt = formatDateKey(contact.nextFollowUpAt || contact.followUpDate || contact.nextFollowUpDate);
  const lastContactedAt = formatDateKey(contact.lastContactedAt || contact.lastActivityAt || contact.lastContactDate);
  const source = normalizeContactSource(contact.source || (contact.hubspotId ? 'HubSpot' : 'Manual'));

  return {
    id: contact.id || email || `contact-${index}`,
    hubspotId: contact.hubspotId || null,
    name: ensureString(contact.name) || 'Unknown',
    company: ensureString(contact.company),
    jobTitle: ensureString(contact.jobTitle || contact.title),
    email,
    phone: ensureString(contact.phone),
    stage,
    status: ensureString(contact.status) || (stage === 'Customer' ? 'Active' : 'New'),
    linkedin: ensureString(contact.linkedin),
    website: ensureString(contact.website),
    industry: ensureString(contact.industry),
    city: ensureString(contact.city || contact.location),
    owner: ensureString(contact.owner),
    source,
    preferredChannel: normalizeChannel(contact.preferredChannel),
    leadTemperature: normalizeTemperature(contact.leadTemperature || contact.temperature || contact.status, stage),
    buyingRole: ensureString(contact.buyingRole),
    estimatedValue,
    priorityScore,
    lastContactedAt,
    nextFollowUpAt,
    nextStep: ensureString(contact.nextStep || contact.nextAction),
    aiSummary: ensureString(contact.aiSummary),
    timelineSummary: ensureString(contact.timelineSummary || contact.relationshipSummary),
    painPoints: ensureString(contact.painPoints),
    notes: ensureString(contact.notes),
    stageHistory: normalizeStageHistory(contact.stageHistory),
    lastAiReviewedAt: ensureString(contact.lastAiReviewedAt),
    _isNew: Boolean(contact._isNew)
  };
};

export const normalizeContacts = (contacts = []) => {
  if (!Array.isArray(contacts)) return [];
  const byKey = new Map();

  contacts.forEach((contact, index) => {
    const normalized = normalizeContactRecord(contact, index);
    const key = normalized.email || normalized.id || `contact-${index}`;
    byKey.set(key, { ...(byKey.get(key) || {}), ...normalized });
  });

  return Array.from(byKey.values()).sort((a, b) => {
    const scoreDelta = (b.priorityScore || 0) - (a.priorityScore || 0);
    if (scoreDelta !== 0) return scoreDelta;
    const valueDelta = (b.estimatedValue || 0) - (a.estimatedValue || 0);
    if (valueDelta !== 0) return valueDelta;
    return (a.name || '').localeCompare(b.name || '');
  });
};

export const createEmptyTask = (seed = {}) => normalizeTaskRecord({
  id: `task-${Date.now()}`,
  title: '',
  type: 'follow-up',
  status: 'pending',
  priority: 50,
  time: '',
  dueDate: '',
  scheduledDate: '',
  durationMinutes: 30,
  contact: '',
  contactEmail: '',
  company: '',
  owner: '',
  focus: 'sales',
  notes: '',
  rationale: '',
  source: 'manual',
  sourceInboxId: '',
  templateId: '',
  recurrenceLabel: '',
  _isNew: true,
  ...seed
});

export const normalizeTaskRecord = (task = {}, index = 0) => {
  const type = normalizeTaskType(task.type || task.category);
  const title = ensureString(task.title || task.text || task.task || task.type) || 'Follow up';
  const dueDate = formatDateKey(task.dueDate || task.dueOn);
  const scheduledDate = formatDateKey(task.scheduledDate || task.calendarDate || task.planDate || dueDate);

  return {
    id: task.id || `task-${index}`,
    title,
    text: title,
    type,
    status: normalizeTaskStatus(task.status),
    priority: clampNumber(task.priority, 1, 100, 50),
    time: normalizeTimeValue(task.time || task.startTime),
    dueDate,
    scheduledDate,
    durationMinutes: clampNumber(task.durationMinutes || task.duration, 5, 480, 30),
    contact: ensureString(task.contact || task.recipientName),
    contactEmail: normalizeEmail(task.contactEmail || task.email || ''),
    company: ensureString(task.company),
    owner: ensureString(task.owner),
    focus: normalizeTaskFocus(task.focus, type),
    rationale: ensureString(task.rationale),
    notes: ensureString(task.notes),
    source: ensureString(task.source),
    sourceInboxId: ensureString(task.sourceInboxId),
    templateId: ensureString(task.templateId),
    recurrenceLabel: ensureString(task.recurrenceLabel),
    _isNew: Boolean(task._isNew)
  };
};

export const buildPipelineOverview = (contacts = []) => {
  const normalizedContacts = normalizeContacts(contacts);
  const stages = CONTACT_STAGE_OPTIONS.map((stage) => {
    const items = normalizedContacts.filter((contact) => contact.stage === stage);
    const totalValue = items.reduce((sum, contact) => sum + (contact.estimatedValue || 0), 0);
    const weightedValue = Math.round(totalValue * (PIPELINE_STAGE_WEIGHTS[stage] ?? 0));

    return {
      stage,
      itemCount: items.length,
      totalValue,
      weightedValue,
      contacts: items
    };
  });

  return {
    totalValue: stages.reduce((sum, stage) => sum + stage.totalValue, 0),
    weightedForecast: stages.reduce((sum, stage) => sum + stage.weightedValue, 0),
    stages
  };
};

const compareDateKeys = (left = '', right = '') => {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
};

export const getTaskCalendarDate = (task = {}) => formatDateKey(task.scheduledDate || task.dueDate);

export const getTaskScheduledStart = (task = {}) => {
  const normalizedTask = normalizeTaskRecord(task);
  const taskDate = dateKeyToDate(getTaskCalendarDate(normalizedTask));
  if (!taskDate) return null;

  const taskMinutes = parseTimeToMinutes(normalizedTask.time);
  if (taskMinutes == null) return null;

  taskDate.setHours(Math.floor(taskMinutes / 60), taskMinutes % 60, 0, 0);
  return taskDate;
};

export const getTaskScheduledEnd = (task = {}) => {
  const normalizedTask = normalizeTaskRecord(task);
  const startDate = getTaskScheduledStart(normalizedTask);
  if (!startDate) return null;

  return new Date(startDate.getTime() + ((normalizedTask.durationMinutes || 30) * 60 * 1000));
};

const getTaskScheduledDateTime = (task = {}) => {
  const taskDate = dateKeyToDate(getTaskCalendarDate(task));
  if (!taskDate) return null;

  const startDate = getTaskScheduledStart(task);
  if (startDate) return startDate;

  taskDate.setHours(23, 59, 59, 999);
  return taskDate;
};

export const getTaskBucket = (task = {}, selectedDateKey = '', referenceDate = new Date()) => {
  const normalizedTask = normalizeTaskRecord(task);
  if (normalizedTask.status === 'completed') return 'completed';

  const todayKey = formatDateKey(referenceDate);
  const taskDateKey = getTaskCalendarDate(normalizedTask);

  if (taskDateKey && taskDateKey < todayKey) return 'overdue';
  if (selectedDateKey && taskDateKey === selectedDateKey) return 'selected';
  if (taskDateKey === todayKey) return 'today';
  if (!taskDateKey) return 'unscheduled';
  return 'upcoming';
};

export const sortTasksForPlanner = (tasks = [], selectedDateKey = '', referenceDate = new Date()) => normalizeTasks(tasks).sort((left, right) => {
  const leftBucket = getTaskBucket(left, selectedDateKey, referenceDate);
  const rightBucket = getTaskBucket(right, selectedDateKey, referenceDate);
  const bucketRank = {
    overdue: 0,
    today: 1,
    selected: 2,
    pending: 3,
    upcoming: 4,
    unscheduled: 5,
    completed: 6
  };
  const bucketDelta = (bucketRank[leftBucket] ?? 99) - (bucketRank[rightBucket] ?? 99);
  if (bucketDelta !== 0) return bucketDelta;

  const dateDelta = compareDateKeys(getTaskCalendarDate(left), getTaskCalendarDate(right));
  if (dateDelta !== 0) return dateDelta;

  const leftTimeMinutes = parseTimeToMinutes(left.time);
  const rightTimeMinutes = parseTimeToMinutes(right.time);
  if (leftTimeMinutes != null || rightTimeMinutes != null) {
    if (leftTimeMinutes == null) return 1;
    if (rightTimeMinutes == null) return -1;
    if (leftTimeMinutes !== rightTimeMinutes) return leftTimeMinutes - rightTimeMinutes;
  }

  const timeDelta = (left.time || '').localeCompare(right.time || '');
  if (timeDelta !== 0) return timeDelta;

  const priorityDelta = (right.priority || 0) - (left.priority || 0);
  if (priorityDelta !== 0) return priorityDelta;

  return (left.title || '').localeCompare(right.title || '');
});

const addScheduleIssue = (issueMap, taskId, issue) => {
  const nextIssues = issueMap.get(taskId) || [];
  nextIssues.push(issue);
  issueMap.set(taskId, nextIssues);
};

export const buildTaskScheduleIssueMap = (tasks = [], options = {}) => {
  const issueMap = new Map();
  const minimumGapMinutes = Math.max(0, Number(options.minimumGapMinutes || 0) || 0);
  const minimumGapMs = minimumGapMinutes * 60 * 1000;
  const timedTasks = normalizeTasks(tasks)
    .filter((task) => task.status !== 'completed')
    .map((task) => ({
      task,
      dateKey: getTaskCalendarDate(task),
      start: getTaskScheduledStart(task),
      end: getTaskScheduledEnd(task)
    }))
    .filter((entry) => entry.dateKey && entry.start && entry.end)
    .sort((left, right) => {
      const dateDelta = compareDateKeys(left.dateKey, right.dateKey);
      if (dateDelta !== 0) return dateDelta;

      const startDelta = left.start.getTime() - right.start.getTime();
      if (startDelta !== 0) return startDelta;

      return left.end.getTime() - right.end.getTime();
    });

  for (let index = 0; index < timedTasks.length; index += 1) {
    const current = timedTasks[index];

    for (let nextIndex = index + 1; nextIndex < timedTasks.length; nextIndex += 1) {
      const next = timedTasks[nextIndex];
      if (next.dateKey !== current.dateKey) break;
      const gapMs = next.start.getTime() - current.end.getTime();
      const hasOverlap = next.start.getTime() < current.end.getTime() && next.end.getTime() > current.start.getTime();
      const needsBuffer = !hasOverlap && minimumGapMs > 0 && gapMs >= 0 && gapMs < minimumGapMs;
      if (!hasOverlap && !needsBuffer && gapMs >= minimumGapMs) break;
      if (!hasOverlap && !needsBuffer) continue;

      const kind = hasOverlap ? 'overlap' : 'buffer';
      const gapMinutes = hasOverlap ? 0 : Math.max(0, Math.round(gapMs / 60000));

      addScheduleIssue(issueMap, current.task.id, {
        otherTaskId: next.task.id,
        kind,
        gapMinutes,
        minimumGapMinutes
      });
      addScheduleIssue(issueMap, next.task.id, {
        otherTaskId: current.task.id,
        kind,
        gapMinutes,
        minimumGapMinutes
      });
    }
  }

  return issueMap;
};

export const buildTaskConflictMap = (tasks = [], options = {}) => {
  const issueMap = buildTaskScheduleIssueMap(tasks, options);
  const conflicts = new Map();

  issueMap.forEach((issues, taskId) => {
    const conflictIds = Array.from(new Set((issues || []).map((issue) => issue.otherTaskId).filter(Boolean)));
    if (conflictIds.length > 0) {
      conflicts.set(taskId, conflictIds);
    }
  });

  return conflicts;
};

export const normalizeTasks = (tasks = []) => {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((task, index) => normalizeTaskRecord(task, index));
};

const taskMatchesContact = (task = {}, contact = {}) => {
  if (!task || !contact) return false;
  const taskEmail = normalizeEmail(task.contactEmail || '');
  const contactEmail = normalizeEmail(contact.email || '');
  if (taskEmail && contactEmail) return taskEmail === contactEmail;
  return ensureString(task.contact).toLowerCase() === ensureString(contact.name).toLowerCase();
};

export const buildUpcomingMeetingQueue = (tasks = [], contacts = [], referenceDate = new Date()) => {
  const normalizedContacts = normalizeContacts(contacts);
  const todayKey = formatDateKey(referenceDate);
  const referenceTime = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
    ? referenceDate.getTime()
    : Date.now();

  return sortTasksForPlanner(
    normalizeTasks(tasks).filter((task) => task.status !== 'completed' && ['meeting', 'call'].includes(task.type)),
    todayKey,
    referenceDate
  )
    .filter((task) => {
      const dateKey = getTaskCalendarDate(task);
      if (!dateKey) return true;
      if (dateKey > todayKey) return true;
      if (dateKey < todayKey) return false;

      const scheduledAt = getTaskScheduledDateTime(task);
      return !scheduledAt || scheduledAt.getTime() >= referenceTime;
    })
    .map((task) => ({
      task,
      contact: normalizedContacts.find((contact) => taskMatchesContact(task, contact)) || null,
      dateKey: getTaskCalendarDate(task),
      isToday: getTaskCalendarDate(task) === todayKey
    }));
};

export const getContactAttentionSummary = (contact = {}, tasks = [], threads = {}, referenceDate = new Date()) => {
  const normalizedContact = normalizeContactRecord(contact);
  const relatedTasks = normalizeTasks(tasks).filter((task) => taskMatchesContact(task, normalizedContact));
  const openTasks = relatedTasks.filter((task) => task.status !== 'completed');
  const threadMessages = threads?.[normalizedContact.email]?.messages || [];
  const lastThreadDate = threadMessages.reduce((latest, message) => {
    const messageDate = formatDateKey(message?.date);
    if (!messageDate) return latest;
    return !latest || messageDate > latest ? messageDate : latest;
  }, '');

  const todayKey = formatDateKey(referenceDate);
  const lastTouchedAt = normalizedContact.lastContactedAt || lastThreadDate || '';
  const nextFollowUpAt = normalizedContact.nextFollowUpAt || '';
  const lastTouchedDaysAgo = lastTouchedAt
    ? Math.round((new Date(`${todayKey}T00:00:00`).getTime() - new Date(`${lastTouchedAt}T00:00:00`).getTime()) / DAY_MS)
    : null;

  const followUpDue = Boolean(nextFollowUpAt && nextFollowUpAt <= todayKey);
  const isStale = normalizedContact.stage !== 'Customer' && lastTouchedDaysAgo != null && lastTouchedDaysAgo >= 14;
  const urgencyScore = (normalizedContact.priorityScore || 0)
    + (followUpDue ? 25 : 0)
    + (isStale ? 10 : 0)
    + Math.min(openTasks.length * 4, 12)
    + Math.min(Math.round((normalizedContact.estimatedValue || 0) / 5000), 20);

  return {
    contact: normalizedContact,
    openTasksCount: openTasks.length,
    followUpDue,
    isStale,
    lastTouchedAt,
    lastTouchedDaysAgo,
    nextFollowUpAt,
    relatedThreadCount: threadMessages.length,
    urgencyScore,
    relatedTasks
  };
};

export const buildCrmOverview = (contacts = [], tasks = [], threads = {}, referenceDate = new Date()) => {
  const normalizedContacts = normalizeContacts(contacts);
  const attentionContacts = normalizedContacts
    .map((contact) => getContactAttentionSummary(contact, tasks, threads, referenceDate))
    .sort((left, right) => right.urgencyScore - left.urgencyScore);

  return {
    pipelineValue: normalizedContacts.reduce((sum, contact) => sum + (contact.estimatedValue || 0), 0),
    followUpsDueCount: attentionContacts.filter((item) => item.followUpDue).length,
    staleContactsCount: attentionContacts.filter((item) => item.isStale).length,
    hotContactsCount: normalizedContacts.filter((contact) => (contact.priorityScore || 0) >= 75 || contact.leadTemperature === 'Hot').length,
    openPipelineCount: normalizedContacts.filter((contact) => ['Opportunity', 'Proposal'].includes(contact.stage)).length,
    attentionContacts: attentionContacts.slice(0, 5)
  };
};

const pickHotterTemperature = (left = 'Cold', right = 'Cold') => {
  const normalizedLeft = CONTACT_TEMPERATURE_OPTIONS.includes(left) ? left : 'Cold';
  const normalizedRight = CONTACT_TEMPERATURE_OPTIONS.includes(right) ? right : 'Cold';
  return (TEMPERATURE_RANK[normalizedRight] ?? 0) > (TEMPERATURE_RANK[normalizedLeft] ?? 0)
    ? normalizedRight
    : normalizedLeft;
};

const addDaysToDateKey = (referenceDate = new Date(), days = 0) => {
  const baseDate = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
    ? new Date(referenceDate.getTime())
    : new Date();
  baseDate.setHours(0, 0, 0, 0);
  baseDate.setDate(baseDate.getDate() + days);
  return formatDateKey(baseDate);
};

const getContactStageDefaults = (contact = {}, referenceDate = new Date()) => {
  const normalizedContact = normalizeContactRecord(contact);
  const contactLabel = normalizedContact.name && normalizedContact.name !== 'Unknown'
    ? normalizedContact.name
    : 'this contact';
  const stageDefaults = {
    Lead: {
      priorityScore: 45,
      leadTemperature: 'Cold',
      followUpOffsetDays: 3,
      buildNextStep: () => `Send a tailored intro and ask ${contactLabel} for a short discovery call.`
    },
    Contact: {
      priorityScore: 55,
      leadTemperature: 'Warm',
      followUpOffsetDays: 2,
      buildNextStep: () => `Qualify pain, confirm stakeholders, and book a discovery call with ${contactLabel}.`
    },
    Opportunity: {
      priorityScore: 70,
      leadTemperature: 'Hot',
      followUpOffsetDays: 1,
      buildNextStep: () => `Confirm the buying process, decision timeline, and next commercial call with ${contactLabel}.`
    },
    Proposal: {
      priorityScore: 85,
      leadTemperature: 'Hot',
      followUpOffsetDays: 1,
      buildNextStep: () => `Follow up on the proposal, resolve objections, and secure a decision checkpoint with ${contactLabel}.`
    },
    Customer: {
      priorityScore: 80,
      leadTemperature: 'Warm',
      followUpOffsetDays: 14,
      buildNextStep: () => `Confirm delivered value with ${contactLabel} and identify the next expansion or referral move.`
    },
    Churned: {
      priorityScore: 30,
      leadTemperature: 'Cold',
      followUpOffsetDays: 30,
      buildNextStep: () => `Check whether timing changed for ${contactLabel} and test for a reactivation angle.`
    }
  }[normalizedContact.stage] || {
    priorityScore: 50,
    leadTemperature: 'Cold',
    followUpOffsetDays: 3,
    buildNextStep: () => `Define the next action for ${contactLabel}.`
  };

  return {
    priorityScore: Math.max(normalizedContact.priorityScore || 0, stageDefaults.priorityScore),
    leadTemperature: pickHotterTemperature(normalizedContact.leadTemperature || 'Cold', stageDefaults.leadTemperature),
    nextFollowUpAt: normalizedContact.nextFollowUpAt || addDaysToDateKey(referenceDate, stageDefaults.followUpOffsetDays),
    nextStep: normalizedContact.nextStep || stageDefaults.buildNextStep()
  };
};

export const buildContactActionPlan = (contact = {}, attention = null, referenceDate = new Date()) => {
  const normalizedContact = normalizeContactRecord(contact);
  const resolvedAttention = attention || getContactAttentionSummary(normalizedContact, [], {}, referenceDate);
  const stageDefaults = getContactStageDefaults(normalizedContact, referenceDate);
  const actionReasons = [];

  if (resolvedAttention.followUpDue) {
    actionReasons.push('Follow-up due');
  }

  if (!normalizedContact.nextStep) {
    actionReasons.push('Missing next step');
  }

  if (resolvedAttention.isStale) {
    actionReasons.push(resolvedAttention.lastTouchedDaysAgo != null ? `Stale ${resolvedAttention.lastTouchedDaysAgo}d` : 'Stale relationship');
  }

  if ((resolvedAttention.openTasksCount || 0) === 0 && !['Customer', 'Churned'].includes(normalizedContact.stage)) {
    actionReasons.push('No open task');
  }

  if ((normalizedContact.estimatedValue || 0) >= 10000) {
    actionReasons.push('High value');
  }

  if ((normalizedContact.priorityScore || 0) >= 80) {
    actionReasons.push('High priority');
  }

  if (actionReasons.length === 0) {
    actionReasons.push('Healthy momentum');
  }

  let primaryAction = {
    key: 'review-dossier',
    label: 'Review dossier',
    detail: 'Inspect the latest context and keep the relationship moving.'
  };

  if (!normalizedContact.nextStep) {
    primaryAction = {
      key: 'edit-contact',
      label: 'Define next step',
      detail: 'Capture a concrete next move so the account does not drift.'
    };
  } else if (normalizedContact.stage === 'Proposal' && (resolvedAttention.followUpDue || resolvedAttention.isStale)) {
    primaryAction = {
      key: 'proposal-follow-up',
      label: 'Draft proposal follow-up',
      detail: 'Push the commercial decision toward a clear yes, no, or checkpoint.'
    };
  } else if (normalizedContact.stage === 'Customer') {
    primaryAction = {
      key: resolvedAttention.followUpDue || resolvedAttention.isStale ? 'customer-check-in-draft' : 'customer-check-in-task',
      label: resolvedAttention.followUpDue || resolvedAttention.isStale ? 'Draft customer check-in' : 'Plan customer check-in',
      detail: resolvedAttention.followUpDue || resolvedAttention.isStale
        ? 'Reinforce value, confirm outcomes, and look for renewal, expansion, or referral motion now.'
        : 'Protect retention early by creating a thoughtful customer check-in before the account cools.'
    };
  } else if (normalizedContact.stage === 'Churned' || resolvedAttention.isStale) {
    primaryAction = {
      key: 'reactivation-draft',
      label: normalizedContact.stage === 'Churned' ? 'Draft win-back' : 'Draft reactivation',
      detail: normalizedContact.stage === 'Churned'
        ? 'Re-open the relationship with a respectful win-back angle and a low-friction next step.'
        : 'Restart the conversation with a fresh angle before the opportunity goes fully cold.'
    };
  } else if (resolvedAttention.followUpDue || resolvedAttention.isStale) {
    primaryAction = {
      key: 'outreach',
      label: 'Work in Outreach',
      detail: 'Reply while the thread still has context and urgency.'
    };
  } else if ((resolvedAttention.openTasksCount || 0) === 0 && !['Customer', 'Churned'].includes(normalizedContact.stage)) {
    primaryAction = {
      key: 'create-task',
      label: 'Create follow-up task',
      detail: 'Protect the next action in the planner before the account goes stale.'
    };
  } else if (normalizedContact.stage === 'Opportunity') {
    primaryAction = {
      key: 'outreach',
      label: 'Advance opportunity',
      detail: 'Move the buyer toward the next meeting, stakeholder, or decision point.'
    };
  } else if (normalizedContact.stage === 'Customer') {
    primaryAction = {
      key: 'review-dossier',
      label: 'Review relationship',
      detail: 'Check delivery momentum, value realized, and expansion signals.'
    };
  }

  return {
    contact: normalizedContact,
    attention: resolvedAttention,
    actionReasons,
    suggestedPriorityScore: stageDefaults.priorityScore,
    suggestedLeadTemperature: stageDefaults.leadTemperature,
    suggestedNextFollowUpAt: stageDefaults.nextFollowUpAt,
    suggestedNextStep: stageDefaults.nextStep,
    primaryAction
  };
};

export const buildSalesPerformanceSnapshot = (contacts = [], threads = {}, tasks = [], referenceDate = new Date()) => {
  const normalizedContacts = normalizeContacts(contacts);
  const normalizedTasks = normalizeTasks(tasks);
  const windowStartKey = formatDateKey(new Date(referenceDate.getTime() - (30 * DAY_MS)));

  const allMessages = Object.entries(threads || {}).flatMap(([contactEmail, thread]) => (thread?.messages || []).map((message) => ({
    ...message,
    contactEmail: normalizeEmail(message?.contactEmail || contactEmail || '')
  })));

  const recentMessages = allMessages.filter((message) => {
    const dateKey = formatDateKey(message?.date);
    return !dateKey || dateKey >= windowStartKey;
  });
  const outboundMessages = recentMessages.filter((message) => message.direction === 'outbound');
  const inboundMessages = recentMessages.filter((message) => message.direction === 'inbound');
  const outboundContacts = new Set(outboundMessages.map((message) => normalizeEmail(message.contactEmail || '')).filter(Boolean));
  const inboundContacts = new Set(inboundMessages.map((message) => normalizeEmail(message.contactEmail || '')).filter(Boolean));
  const repliedContacts = Array.from(outboundContacts).filter((email) => inboundContacts.has(email));

  let replyTouchCount = 0;
  let replyTouchSamples = 0;
  Array.from(outboundContacts).forEach((email) => {
    const contactMessages = recentMessages
      .filter((message) => normalizeEmail(message.contactEmail || '') === email)
      .slice()
      .sort((left, right) => new Date(left?.date || 0) - new Date(right?.date || 0));

    let outboundBeforeReply = 0;
    for (const message of contactMessages) {
      if (message.direction === 'outbound') {
        outboundBeforeReply += 1;
      }
      if (message.direction === 'inbound') {
        if (outboundBeforeReply > 0) {
          replyTouchCount += outboundBeforeReply;
          replyTouchSamples += 1;
        }
        break;
      }
    }
  });

  const stageTransitions = normalizedContacts.flatMap((contact) => {
    const history = Array.isArray(contact.stageHistory) ? contact.stageHistory : [];
    return history.slice(1).map((entry, index) => ({
      contact,
      fromStage: history[index]?.stage || contact.stage,
      toStage: entry.stage,
      date: entry.date,
      dateKey: formatDateKey(entry.date)
    }));
  }).filter((entry) => !entry.dateKey || entry.dateKey >= windowStartKey);

  const progressedCount = stageTransitions.filter((entry) => (STAGE_POSITION[entry.toStage] ?? 0) > (STAGE_POSITION[entry.fromStage] ?? 0)).length;
  const wonCount = stageTransitions.filter((entry) => entry.toStage === 'Customer').length;
  const lostCount = stageTransitions.filter((entry) => entry.toStage === 'Churned').length;
  const proposalContacts = normalizedContacts.filter((contact) => contact.stage === 'Proposal');
  const stalledProposalCount = proposalContacts.filter((contact) => {
    const attention = getContactAttentionSummary(contact, normalizedTasks, threads, referenceDate);
    return attention.isStale || attention.followUpDue || !contact.nextStep || attention.openTasksCount === 0;
  }).length;
  const completedMeetingCount = normalizedTasks.filter((task) => task.status === 'completed' && ['meeting', 'call'].includes(task.type)).length;

  return {
    outboundCount: outboundMessages.length,
    inboundCount: inboundMessages.length,
    contactedAccounts: outboundContacts.size,
    repliedAccounts: repliedContacts.length,
    responseRate: outboundContacts.size > 0 ? Math.round((repliedContacts.length / outboundContacts.size) * 100) : 0,
    averageTouchesBeforeReply: replyTouchSamples > 0 ? Number((replyTouchCount / replyTouchSamples).toFixed(1)) : 0,
    proposalCount: proposalContacts.length,
    customerCount: normalizedContacts.filter((contact) => contact.stage === 'Customer').length,
    churnedCount: normalizedContacts.filter((contact) => contact.stage === 'Churned').length,
    progressedCount,
    wonCount,
    lostCount,
    stalledProposalCount,
    completedMeetingCount,
    stageTransitionCount: stageTransitions.length
  };
};

export const buildTaskSummary = (tasks = [], selectedDateKey = '', referenceDate = new Date()) => {
  const normalizedTasks = normalizeTasks(tasks);
  const todayKey = formatDateKey(referenceDate);

  return {
    overdueCount: normalizedTasks.filter((task) => getTaskBucket(task, selectedDateKey, referenceDate) === 'overdue').length,
    dueTodayCount: normalizedTasks.filter((task) => task.status !== 'completed' && (task.dueDate || '') === todayKey).length,
    selectedDayCount: normalizedTasks.filter((task) => task.status !== 'completed' && getTaskCalendarDate(task) === selectedDateKey).length,
    unscheduledCount: normalizedTasks.filter((task) => task.status !== 'completed' && !getTaskCalendarDate(task)).length,
    completedCount: normalizedTasks.filter((task) => task.status === 'completed').length
  };
};

export const materializeTaskTemplate = (templateId, options = {}) => {
  const template = TASK_TEMPLATE_DEFINITIONS.find((item) => item.id === templateId);
  if (!template) return [];

  const {
    scheduledDate = formatDateKey(new Date()),
    owner = '',
    company = 'Internal',
    seed = Date.now()
  } = options;

  return template.tasks.map((task, index) => normalizeTaskRecord({
    id: `template-${template.id}-${seed}-${index}`,
    title: task.title,
    type: task.type,
    status: 'pending',
    priority: task.priority,
    scheduledDate,
    dueDate: scheduledDate,
    durationMinutes: task.durationMinutes || 30,
    contact: 'Internal Workflow',
    company,
    owner,
    focus: task.focus || 'sales',
    rationale: task.description || template.description,
    source: 'task-template',
    templateId: template.id,
    recurrenceLabel: template.recurrenceLabel
  }));
};

export const createMeetingPrepPack = (contact = {}, options = {}) => {
  const normalizedContact = normalizeContactRecord(contact);
  const scheduledDate = options.scheduledDate || normalizedContact.nextFollowUpAt || formatDateKey(new Date());
  const seed = options.seed || Date.now();
  const shared = {
    status: 'pending',
    contact: normalizedContact.name,
    contactEmail: normalizedContact.email,
    company: normalizedContact.company,
    owner: normalizedContact.owner,
    scheduledDate,
    dueDate: scheduledDate,
    source: 'meeting-prep-pack',
    templateId: 'meeting-prep-pack',
    recurrenceLabel: 'Per meeting'
  };

  return [
    normalizeTaskRecord({
      id: `meeting-pack-${seed}-0`,
      ...shared,
      title: `Review ${normalizedContact.name}'s timeline and open opportunities`,
      type: 'research',
      priority: Math.max(normalizedContact.priorityScore || 70, 72),
      durationMinutes: 20,
      focus: 'deep-work',
      rationale: normalizedContact.timelineSummary || normalizedContact.aiSummary || 'Rebuild context before the meeting.'
    }),
    normalizeTaskRecord({
      id: `meeting-pack-${seed}-1`,
      ...shared,
      title: `Prepare agenda and outcomes for ${normalizedContact.name}`,
      type: 'meeting',
      priority: Math.max(normalizedContact.priorityScore || 70, 78),
      durationMinutes: 20,
      focus: 'meeting',
      rationale: normalizedContact.nextStep || 'Define a clear outcome for the conversation.',
      notes: normalizedContact.painPoints ? `Pain points to address: ${normalizedContact.painPoints}` : ''
    }),
    normalizeTaskRecord({
      id: `meeting-pack-${seed}-2`,
      ...shared,
      title: `Draft follow-up and next-step options for ${normalizedContact.company || normalizedContact.name}`,
      type: 'follow-up',
      priority: Math.max(normalizedContact.priorityScore || 70, 74),
      durationMinutes: 15,
      focus: 'sales',
      rationale: 'Leave the meeting with a pre-decided follow-up path.'
    })
  ];
};

export const getTasksForDate = (tasks = [], selectedDateKey = '', referenceDate = new Date()) => sortTasksForPlanner(
  normalizeTasks(tasks).filter((task) => getTaskCalendarDate(task) === selectedDateKey),
  selectedDateKey,
  referenceDate
);

export const buildCalendarMonth = (tasks = [], monthKey = new Date(), selectedDateKey = '', referenceDate = new Date()) => {
  const normalizedMonthKey = typeof monthKey === 'string' && /^\d{4}-\d{2}$/.test(monthKey)
    ? `${monthKey}-01`
    : formatDateKey(monthKey);
  const monthDate = normalizedMonthKey ? new Date(`${normalizedMonthKey}T00:00:00`) : new Date();
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const todayKey = formatDateKey(referenceDate);

  const tasksByDate = new Map();
  normalizeTasks(tasks).forEach((task) => {
    const dateKey = getTaskCalendarDate(task);
    if (!dateKey) return;

    const bucket = getTaskBucket(task, selectedDateKey, referenceDate);
    const entry = tasksByDate.get(dateKey) || { count: 0, urgentCount: 0, completedCount: 0 };
    entry.count += 1;
    if (bucket === 'overdue' || (task.priority || 0) >= 75) entry.urgentCount += 1;
    if (task.status === 'completed') entry.completedCount += 1;
    tasksByDate.set(dateKey, entry);
  });

  const days = [];
  for (let index = 0; index < monthStart.getDay(); index += 1) {
    days.push({ key: `pad-start-${index}`, isPlaceholder: true });
  }

  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const dateKey = formatDateKey(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
    const counts = tasksByDate.get(dateKey) || { count: 0, urgentCount: 0, completedCount: 0 };
    days.push({
      key: dateKey,
      dateKey,
      dayNumber: day,
      isPlaceholder: false,
      isToday: dateKey === todayKey,
      isSelected: Boolean(selectedDateKey && dateKey === selectedDateKey),
      taskCount: counts.count,
      urgentCount: counts.urgentCount,
      completedCount: counts.completedCount
    });
  }

  while (days.length % 7 !== 0) {
    days.push({ key: `pad-end-${days.length}`, isPlaceholder: true });
  }

  return days;
};

const matchLabeledValue = (text = '', labels = []) => {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\s*[:=-]\s*([^\n]+)`, 'im');
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return '';
};

export const parseAiContactPlan = (text = '') => {
  const source = String(text || '');
  const summary = matchLabeledValue(source, ['summary']);
  const nextStep = matchLabeledValue(source, ['next\\s*step', 'recommended\\s*action']);
  const priority = clampNumber(matchLabeledValue(source, ['priority']), 1, 100, null);
  const followUpDate = formatDateKey(matchLabeledValue(source, ['follow-?up\\s*date', 'due\\s*date', 'best\\s*timing']));
  const estimatedValue = parseCurrencyNumber(matchLabeledValue(source, ['value', 'estimated\\s*value', 'deal\\s*value']));
  const taskType = normalizeTaskType(matchLabeledValue(source, ['task\\s*type', 'action\\s*type']));
  const taskTitle = matchLabeledValue(source, ['task\\s*title', 'task']);
  const opener = matchLabeledValue(source, ['opener', 'suggested\\s*opener']);
  const channel = normalizeChannel(matchLabeledValue(source, ['channel', 'preferred\\s*channel']));
  const role = matchLabeledValue(source, ['role', 'buying\\s*role']);
  const painPoints = matchLabeledValue(source, ['pain\\s*points']);

  return {
    summary,
    nextStep,
    priority,
    followUpDate,
    estimatedValue,
    taskType,
    taskTitle,
    opener,
    channel,
    role,
    painPoints
  };
};

export const parseAiIdeaOrganizer = (text = '') => {
  const source = String(text || '');
  const matchLine = (pattern) => source.match(pattern)?.[1]?.trim() || '';

  return {
    summary: matchLine(/^SUMMARY\s*[:=-]\s*(.+)$/im),
    crmNote: matchLine(/^CRM NOTE\s*[:=-]\s*(.+)$/im),
    outreachAngle: matchLine(/^OUTREACH ANGLE\s*[:=-]\s*(.+)$/im),
    bestContact: matchLine(/^BEST CONTACT\s*[:=-]\s*(.+)$/im),
    taskTitles: [1, 2, 3, 4]
      .map((index) => matchLine(new RegExp(`^TASK ${index}\\s*[:=-]\\s*(.+)$`, 'im')))
      .filter(Boolean)
  };
};

export const buildHeuristicTimelineSummary = (contact = {}, messages = [], options = {}) => {
  const normalizedContact = normalizeContactRecord(contact);
  const recentMessages = Array.isArray(messages) ? messages.slice().sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0)) : [];
  const latest = recentMessages[0];
  const outboundCount = recentMessages.filter((message) => message.direction === 'outbound').length;
  const inboundCount = recentMessages.filter((message) => message.direction === 'inbound').length;
  const callCount = recentMessages.filter((message) => message.type === 'call').length;
  const needsFollowUp = Boolean(normalizedContact.nextFollowUpAt || normalizedContact.nextStep);
  const latestSummary = latest
    ? `${latest.direction === 'outbound' ? 'Last touch was outbound' : latest.type === 'call' ? 'Last touch was a call' : 'Last touch was inbound'} on ${formatDateKey(latest.date) || 'recently'}${latest.subject ? ` about "${latest.subject}"` : ''}.`
    : 'No interaction timeline exists yet.';

  return `Momentum: ${inboundCount > outboundCount ? 'Prospect-engaged' : outboundCount > inboundCount ? 'Seller-driven' : 'Balanced'}.
Activity: ${outboundCount} outbound, ${inboundCount} inbound, ${callCount} calls logged.
Summary: ${latestSummary}
Next move: ${normalizedContact.nextStep || (needsFollowUp ? `Follow up by ${normalizedContact.nextFollowUpAt}.` : 'Define a clear next step and owner.')}`;
};

export const createTaskFromContactPlan = (contact = {}, plan = {}) => {
  const normalizedContact = normalizeContactRecord(contact);
  const followUpDate = plan.followUpDate || normalizedContact.nextFollowUpAt || formatDateKey(new Date(Date.now() + (2 * DAY_MS)));

  return normalizeTaskRecord({
    id: `task-${Date.now()}`,
    title: plan.taskTitle || plan.nextStep || `Follow up with ${normalizedContact.name}`,
    type: plan.taskType || 'follow-up',
    status: 'pending',
    priority: plan.priority || normalizedContact.priorityScore || 70,
    dueDate: followUpDate,
    scheduledDate: followUpDate,
    durationMinutes: 30,
    contact: normalizedContact.name,
    contactEmail: normalizedContact.email,
    company: normalizedContact.company,
    owner: normalizedContact.owner,
    focus: plan.channel === 'meeting' ? 'meeting' : 'sales',
    rationale: plan.summary || normalizedContact.nextStep || '',
    notes: plan.opener ? `Suggested opener: ${plan.opener}` : '',
    source: 'ai-contact-plan'
  });
};

export const applyAiFocusDayPlan = (lines = [], tasks = [], selectedDateKey = '') => {
  if (!Array.isArray(lines)) return normalizeTasks(tasks);
  const nextTasks = normalizeTasks(tasks).map((task) => ({ ...task }));

  lines.forEach((line) => {
    const parts = String(line || '').split('||').map((part) => part.trim());
    const taskId = parseInt((parts[0] || '').replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(taskId)) return;
    const taskIndex = nextTasks.findIndex((task) => Number(task.id) === taskId);
    if (taskIndex === -1) return;

    const durationMinutes = clampNumber((parts[2] || '').replace(/[^\d]/g, ''), 5, 480, nextTasks[taskIndex].durationMinutes || 30);
    nextTasks[taskIndex] = normalizeTaskRecord({
      ...nextTasks[taskIndex],
      time: parts[1] || nextTasks[taskIndex].time,
      durationMinutes,
      scheduledDate: selectedDateKey || nextTasks[taskIndex].scheduledDate,
      rationale: parts[3] || nextTasks[taskIndex].rationale
    }, taskIndex);
  });

  return sortTasksForPlanner(nextTasks, selectedDateKey);
};