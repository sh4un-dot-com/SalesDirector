import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeContactRecord,
  normalizeContacts,
  normalizeTaskRecord,
  buildCrmOverview,
  buildTaskSummary,
  buildCalendarMonth,
  parseAiContactPlan,
  createTaskFromContactPlan,
  applyAiFocusDayPlan,
  getTasksForDate
} from '../utils/crmWorkflow.mjs';

test('normalizeContactRecord fills CRM defaults and normalizes pipeline fields', () => {
  const contact = normalizeContactRecord({
    name: 'Jane Doe',
    email: ' JANE@Example.com ',
    lifecyclestage: 'salesqualifiedlead',
    temperature: 'warm',
    estimatedValue: '$12,500',
    nextFollowUpDate: '2026-04-15',
    lastActivityAt: '2026-04-09T10:30:00.000Z'
  });

  assert.equal(contact.email, 'jane@example.com');
  assert.equal(contact.stage, 'Opportunity');
  assert.equal(contact.leadTemperature, 'Warm');
  assert.equal(contact.estimatedValue, 12500);
  assert.equal(contact.nextFollowUpAt, '2026-04-15');
  assert.equal(contact.lastContactedAt, '2026-04-09');
  assert.equal(contact.source, 'Manual');
});

test('normalizeContacts de-duplicates by canonical email and keeps strongest record', () => {
  const contacts = normalizeContacts([
    { name: 'Jane Doe', email: 'jane@example.com', priorityScore: 40 },
    { name: 'Jane Doe', email: 'JANE@example.com', company: 'Acme', priorityScore: 85 }
  ]);

  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].company, 'Acme');
  assert.equal(contacts[0].priorityScore, 85);
});

test('normalizeTaskRecord promotes legacy text tasks into planned task records', () => {
  const task = normalizeTaskRecord({
    id: 10,
    text: 'Call Jane',
    type: 'call',
    dueDate: '2026-04-12',
    duration: 45,
    email: 'Jane@example.com'
  });

  assert.equal(task.title, 'Call Jane');
  assert.equal(task.contactEmail, 'jane@example.com');
  assert.equal(task.durationMinutes, 45);
  assert.equal(task.type, 'call');
});

test('buildCrmOverview surfaces due follow-ups, stale contacts, and pipeline value', () => {
  const contacts = [
    {
      name: 'Hot Lead',
      email: 'hot@example.com',
      stage: 'Opportunity',
      priorityScore: 90,
      estimatedValue: 15000,
      nextFollowUpAt: '2026-04-11'
    },
    {
      name: 'Stale Lead',
      email: 'stale@example.com',
      stage: 'Lead',
      priorityScore: 45,
      estimatedValue: 3000,
      lastContactedAt: '2026-03-20'
    }
  ];
  const tasks = [{ id: 1, title: 'Call Hot Lead', contactEmail: 'hot@example.com', status: 'pending' }];
  const overview = buildCrmOverview(contacts, tasks, {}, new Date('2026-04-11T09:00:00.000Z'));

  assert.equal(overview.pipelineValue, 18000);
  assert.equal(overview.followUpsDueCount, 1);
  assert.equal(overview.staleContactsCount, 1);
  assert.equal(overview.hotContactsCount, 1);
  assert.equal(overview.attentionContacts[0].contact.email, 'hot@example.com');
});

test('buildTaskSummary and getTasksForDate use scheduled work dates', () => {
  const tasks = [
    { id: 1, title: 'Plan proposal', scheduledDate: '2026-04-11', status: 'pending' },
    { id: 2, title: 'Old follow-up', dueDate: '2026-04-09', status: 'pending' },
    { id: 3, title: 'Admin cleanup', status: 'completed' }
  ];

  const summary = buildTaskSummary(tasks, '2026-04-11', new Date('2026-04-11T09:00:00.000Z'));
  const selected = getTasksForDate(tasks, '2026-04-11');

  assert.equal(summary.selectedDayCount, 1);
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.completedCount, 1);
  assert.equal(selected[0].title, 'Plan proposal');
});

test('buildCalendarMonth marks selected dates and task counts', () => {
  const days = buildCalendarMonth(
    [{ id: 1, title: 'Call Jane', scheduledDate: '2026-04-15', priority: 88, status: 'pending' }],
    '2026-04',
    '2026-04-15',
    new Date('2026-04-11T09:00:00.000Z')
  );

  const selectedDay = days.find((day) => day.dateKey === '2026-04-15');
  assert.equal(selectedDay.isSelected, true);
  assert.equal(selectedDay.taskCount, 1);
  assert.equal(selectedDay.urgentCount, 1);
});

test('parseAiContactPlan extracts structured next-step fields', () => {
  const plan = parseAiContactPlan(`SUMMARY: Budget is real and timing is near-term.
PRIORITY: 87
VALUE: $18,000
NEXT STEP: Send pricing recap and ask for a 20-minute review call.
FOLLOW-UP DATE: 2026-04-14
TASK TYPE: proposal
TASK TITLE: Send pricing recap to Jane Doe
OPENER: I pulled together the pricing options that best fit your timeline.
CHANNEL: email
ROLE: Decision Maker
PAIN POINTS: Lead flow inconsistency, delayed follow-up discipline`);

  assert.equal(plan.priority, 87);
  assert.equal(plan.estimatedValue, 18000);
  assert.equal(plan.taskType, 'proposal');
  assert.equal(plan.followUpDate, '2026-04-14');
  assert.match(plan.nextStep, /pricing recap/i);
  assert.match(plan.painPoints, /Lead flow inconsistency/i);
});

test('createTaskFromContactPlan creates a concrete follow-up task', () => {
  const task = createTaskFromContactPlan(
    { name: 'Jane Doe', email: 'jane@example.com', company: 'Acme', priorityScore: 78 },
    { taskTitle: 'Send pricing recap to Jane Doe', nextStep: 'Send recap', followUpDate: '2026-04-14', priority: 84, summary: 'Strong commercial intent.' }
  );

  assert.equal(task.contactEmail, 'jane@example.com');
  assert.equal(task.title, 'Send pricing recap to Jane Doe');
  assert.equal(task.dueDate, '2026-04-14');
  assert.equal(task.priority, 84);
});

test('applyAiFocusDayPlan schedules tasks on the selected date', () => {
  const tasks = [
    { id: 101, title: 'Call Jane', status: 'pending' },
    { id: 102, title: 'Send proposal', status: 'pending' }
  ];
  const updated = applyAiFocusDayPlan([
    '[101] || [09:00 AM] || [45] || [Start with the hottest follow-up]',
    '[102] || [10:30 AM] || [60] || [Use fresh context from the call]'
  ], tasks, '2026-04-11');

  assert.equal(updated[0].scheduledDate, '2026-04-11');
  assert.equal(updated[0].time, '09:00 AM');
  assert.equal(updated[0].durationMinutes, 45);
  assert.match(updated[0].rationale, /hottest follow-up/i);
});