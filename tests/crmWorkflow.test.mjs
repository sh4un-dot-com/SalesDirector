import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeContactRecord,
  normalizeContacts,
  normalizeTaskRecord,
  buildPipelineOverview,
  buildCrmOverview,
  buildUpcomingMeetingQueue,
  buildSalesPerformanceSnapshot,
  buildTaskSummary,
  buildCalendarMonth,
  buildTaskConflictMap,
  dateKeyToDate,
  getTaskScheduledEnd,
  getTaskScheduledStart,
  materializeTaskTemplate,
  createMeetingPrepPack,
  parseAiContactPlan,
  parseAiIdeaOrganizer,
  parseTimeToMinutes,
  createTaskFromContactPlan,
  applyAiFocusDayPlan,
  getTasksForDate,
  buildHeuristicTimelineSummary
} from '../utils/crmWorkflow.mjs';

test('dateKeyToDate keeps date-only planner keys on the intended local calendar day', () => {
  const date = dateKeyToDate('2026-04-12');

  assert.ok(date instanceof Date);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 3);
  assert.equal(date.getDate(), 12);
});

test('parseTimeToMinutes handles 12-hour and 24-hour planner times', () => {
  assert.equal(parseTimeToMinutes('09:00 AM'), 540);
  assert.equal(parseTimeToMinutes('2:30 pm'), 870);
  assert.equal(parseTimeToMinutes('14:45'), 885);
  assert.equal(parseTimeToMinutes(''), null);
});

test('getTaskScheduledStart and getTaskScheduledEnd derive real booking timestamps from planner date, time, and duration', () => {
  const task = normalizeTaskRecord({
    title: 'Discovery call',
    scheduledDate: '2026-04-12',
    time: '09:15 AM',
    durationMinutes: 45
  });

  const start = getTaskScheduledStart(task);
  const end = getTaskScheduledEnd(task);

  assert.ok(start instanceof Date);
  assert.ok(end instanceof Date);
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 3);
  assert.equal(start.getDate(), 12);
  assert.equal(start.getHours(), 9);
  assert.equal(start.getMinutes(), 15);
  assert.equal(end.getHours(), 10);
  assert.equal(end.getMinutes(), 0);
});

test('buildTaskConflictMap finds overlapping timed tasks on the same planner day', () => {
  const conflicts = buildTaskConflictMap([
    { id: 'a', title: 'Call Jane', scheduledDate: '2026-04-12', time: '09:00 AM', durationMinutes: 60, status: 'pending' },
    { id: 'b', title: 'Internal sync', scheduledDate: '2026-04-12', time: '09:30 AM', durationMinutes: 30, status: 'pending' },
    { id: 'c', title: 'Proposal review', scheduledDate: '2026-04-12', time: '11:00 AM', durationMinutes: 30, status: 'pending' },
    { id: 'd', title: 'Next day meeting', scheduledDate: '2026-04-13', time: '09:15 AM', durationMinutes: 30, status: 'pending' }
  ]);

  assert.deepEqual(conflicts.get('a'), ['b']);
  assert.deepEqual(conflicts.get('b'), ['a']);
  assert.equal(conflicts.has('c'), false);
  assert.equal(conflicts.has('d'), false);
});

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

test('buildPipelineOverview groups contacts by stage and calculates weighted forecast', () => {
  const pipeline = buildPipelineOverview([
    { name: 'Lead', email: 'lead@example.com', stage: 'Lead', estimatedValue: 10000 },
    { name: 'Proposal', email: 'proposal@example.com', stage: 'Proposal', estimatedValue: 20000 },
    { name: 'Customer', email: 'customer@example.com', stage: 'Customer', estimatedValue: 5000 }
  ]);

  assert.equal(pipeline.totalValue, 35000);
  assert.equal(pipeline.weightedForecast, 21000);
  assert.equal(pipeline.stages.find((stage) => stage.stage === 'Proposal').itemCount, 1);
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

test('buildUpcomingMeetingQueue keeps future meetings and excludes same-day meetings that already passed', () => {
  const queue = buildUpcomingMeetingQueue(
    [
      { id: 1, title: 'Past morning call', type: 'call', scheduledDate: '2026-04-11', time: '08:00 AM', contactEmail: 'jane@example.com' },
      { id: 5, title: 'Late morning call', type: 'call', scheduledDate: '2026-04-11', time: '11:30 AM', contactEmail: 'jane@example.com' },
      { id: 6, title: 'Untimed follow-up meeting', type: 'meeting', scheduledDate: '2026-04-11', contactEmail: 'jane@example.com' },
      { id: 2, title: 'Future meeting', type: 'meeting', scheduledDate: '2026-04-14', contactEmail: 'jane@example.com' },
      { id: 3, title: 'Old meeting', type: 'meeting', scheduledDate: '2026-04-09', contactEmail: 'jane@example.com' },
      { id: 4, title: 'Not a meeting', type: 'follow-up', scheduledDate: '2026-04-12', contactEmail: 'jane@example.com' }
    ],
    [{ name: 'Jane Doe', email: 'jane@example.com', company: 'Acme' }],
    new Date('2026-04-11T09:30:00')
  );

  assert.equal(queue.length, 3);
  assert.equal(queue[0].task.title, 'Late morning call');
  assert.equal(queue[0].isToday, true);
  assert.equal(queue[0].contact.email, 'jane@example.com');
  assert.equal(queue[1].task.title, 'Untimed follow-up meeting');
  assert.equal(queue[2].task.title, 'Future meeting');
});

test('buildSalesPerformanceSnapshot summarizes response rate, wins, losses, and stalled proposals', () => {
  const snapshot = buildSalesPerformanceSnapshot(
    [
      {
        name: 'Won Deal',
        email: 'won@example.com',
        stage: 'Customer',
        stageHistory: [
          { stage: 'Lead', date: '2026-03-15T09:00:00.000Z' },
          { stage: 'Opportunity', date: '2026-03-20T09:00:00.000Z' },
          { stage: 'Proposal', date: '2026-03-25T09:00:00.000Z' },
          { stage: 'Customer', date: '2026-04-05T09:00:00.000Z' }
        ]
      },
      {
        name: 'Lost Deal',
        email: 'lost@example.com',
        stage: 'Churned',
        stageHistory: [
          { stage: 'Lead', date: '2026-03-18T09:00:00.000Z' },
          { stage: 'Proposal', date: '2026-03-30T09:00:00.000Z' },
          { stage: 'Churned', date: '2026-04-08T09:00:00.000Z' }
        ]
      },
      {
        name: 'Stalled Proposal',
        email: 'stalled@example.com',
        stage: 'Proposal',
        estimatedValue: 12000,
        lastContactedAt: '2026-03-20',
        stageHistory: [
          { stage: 'Opportunity', date: '2026-03-19T09:00:00.000Z' },
          { stage: 'Proposal', date: '2026-03-24T09:00:00.000Z' }
        ]
      }
    ],
    {
      'won@example.com': {
        messages: [
          { date: '2026-03-18T09:00:00.000Z', direction: 'outbound', subject: 'Intro' },
          { date: '2026-03-19T09:00:00.000Z', direction: 'inbound', subject: 'Interested' }
        ]
      },
      'lost@example.com': {
        messages: [
          { date: '2026-03-29T09:00:00.000Z', direction: 'outbound', subject: 'Proposal' }
        ]
      },
      'stalled@example.com': {
        messages: [
          { date: '2026-03-26T09:00:00.000Z', direction: 'outbound', subject: 'Proposal recap' }
        ]
      }
    },
    [
      { id: 1, title: 'Discovery call', type: 'meeting', status: 'completed', scheduledDate: '2026-04-02', contactEmail: 'won@example.com' }
    ],
    new Date('2026-04-11T09:00:00.000Z')
  );

  assert.equal(snapshot.responseRate, 33);
  assert.equal(snapshot.wonCount, 1);
  assert.equal(snapshot.lostCount, 1);
  assert.equal(snapshot.stalledProposalCount, 1);
  assert.equal(snapshot.completedMeetingCount, 1);
  assert.equal(snapshot.proposalCount, 1);
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

test('materializeTaskTemplate expands recurring workflow tasks for the selected day', () => {
  const tasks = materializeTaskTemplate('weekly-pipeline-review', { scheduledDate: '2026-04-11', seed: 99 });

  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].scheduledDate, '2026-04-11');
  assert.equal(tasks[0].templateId, 'weekly-pipeline-review');
  assert.equal(tasks[0].recurrenceLabel, 'Weekly');
});

test('createMeetingPrepPack creates a contact-specific prep bundle', () => {
  const pack = createMeetingPrepPack(
    { name: 'Jane Doe', email: 'jane@example.com', company: 'Acme', nextFollowUpAt: '2026-04-16', priorityScore: 82 },
    { seed: 123 }
  );

  assert.equal(pack.length, 3);
  assert.equal(pack[0].contactEmail, 'jane@example.com');
  assert.equal(pack[0].scheduledDate, '2026-04-16');
  assert.equal(pack[1].type, 'meeting');
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

test('parseAiIdeaOrganizer extracts tasks, CRM note, and outreach angle', () => {
  const plan = parseAiIdeaOrganizer(`SUMMARY: The owner wants a faster close plan for HVAC contractors.
CRM NOTE: Position this around shorter quote turnaround and tighter follow-up discipline.
OUTREACH ANGLE: Offer a quick teardown of their current lead response workflow and show where deals stall.
BEST CONTACT: Operations manager or sales owner
TASK 1: Review current stalled proposals and identify the top 3 blockers
TASK 2: Draft a short HVAC-specific outreach sequence
TASK 3: Build a same-day follow-up checklist for inbound leads`);

  assert.match(plan.summary, /faster close plan/i);
  assert.match(plan.crmNote, /shorter quote turnaround/i);
  assert.match(plan.outreachAngle, /lead response workflow/i);
  assert.match(plan.bestContact, /Operations manager/i);
  assert.equal(plan.taskTitles.length, 3);
  assert.match(plan.taskTitles[1], /hvac-specific outreach sequence/i);
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

test('buildHeuristicTimelineSummary reflects momentum and next move from timeline activity', () => {
  const summary = buildHeuristicTimelineSummary(
    { name: 'Jane Doe', email: 'jane@example.com', nextStep: 'Send recap proposal.' },
    [
      { date: '2026-04-10T10:00:00.000Z', direction: 'outbound', subject: 'Proposal recap' },
      { date: '2026-04-09T10:00:00.000Z', direction: 'inbound', subject: 'Pricing question' },
      { date: '2026-04-08T10:00:00.000Z', type: 'call', direction: 'outbound', subject: 'Discovery call' }
    ]
  );

  assert.match(summary, /Momentum:/);
  assert.match(summary, /Proposal recap/);
  assert.match(summary, /Send recap proposal/);
});