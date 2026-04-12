import { normalizeEmail } from './dataParsers.mjs';

export const CONTACT_STAGE_OPTIONS = ['Lead', 'Contact', 'Opportunity', 'Proposal', 'Customer', 'Churned'];
export const CONTACT_SOURCE_OPTIONS = ['Manual', 'HubSpot', 'Inbox', 'Referral', 'Website', 'Import'];
export const CONTACT_CHANNEL_OPTIONS = ['email', 'call', 'linkedin', 'meeting'];
export const CONTACT_TEMPERATURE_OPTIONS = ['Cold', 'Warm', 'Hot'];

export const TASK_TYPE_OPTIONS = ['follow-up', 'call', 'meeting', 'proposal', 'research', 'admin'];
export const TASK_STATUS_OPTIONS = ['pending', 'in-progress', 'waiting', 'completed'];
export const TASK_FOCUS_OPTIONS = ['sales', 'deep-work', 'meeting', 'admin'];

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

const ensureString = (value = '') => String(value ?? '').trim();
const padNumber = (value) => String(value).padStart(2, '0');

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

export const formatMonthKey = (value = new Date()) => {
  const dateKey = formatDateKey(value);
  return dateKey ? dateKey.slice(0, 7) : formatDateKey(new Date()).slice(0, 7);
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
  painPoints: '',
  notes: '',
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
    painPoints: ensureString(contact.painPoints),
    notes: ensureString(contact.notes),
    lastAiReviewedAt: ensureString(contact.lastAiReviewedAt),
    _isNew: Boolean(contact._isNew)
  };
};

export const normalizeContacts = (contacts = []) => {
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
    _isNew: Boolean(task._isNew)
  };
};

const compareDateKeys = (left = '', right = '') => {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
};

export const getTaskCalendarDate = (task = {}) => formatDateKey(task.scheduledDate || task.dueDate);

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

  const timeDelta = (left.time || '').localeCompare(right.time || '');
  if (timeDelta !== 0) return timeDelta;

  const priorityDelta = (right.priority || 0) - (left.priority || 0);
  if (priorityDelta !== 0) return priorityDelta;

  return (left.title || '').localeCompare(right.title || '');
});

export const normalizeTasks = (tasks = []) => tasks.map((task, index) => normalizeTaskRecord(task, index));

const taskMatchesContact = (task = {}, contact = {}) => {
  if (!task || !contact) return false;
  const taskEmail = normalizeEmail(task.contactEmail || '');
  const contactEmail = normalizeEmail(contact.email || '');
  if (taskEmail && contactEmail) return taskEmail === contactEmail;
  return ensureString(task.contact).toLowerCase() === ensureString(contact.name).toLowerCase();
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

export const getTasksForDate = (tasks = [], selectedDateKey = '') => sortTasksForPlanner(
  normalizeTasks(tasks).filter((task) => getTaskCalendarDate(task) === selectedDateKey),
  selectedDateKey
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