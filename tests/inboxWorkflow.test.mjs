import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canReplyToInboxEmail,
  createComposerResetState,
  buildComposerStateFromInboxEmail,
  buildOutreachPlayContext,
  buildHandledInboxEmailUpdate,
  getRecommendedOutreachStrategy,
  getInboxReplyMetadata,
  buildHeuristicInboxInsight,
  createFollowUpTaskFromInboxEmail,
  createSequenceTasksFromSteps,
  getSequenceCadenceById,
  parseSequenceSteps,
  selectUrgentInboxEmails,
  selectLowPriorityInboxEmails
} from '../utils/inboxWorkflow.mjs';

const sampleInboxEmail = {
  id: 'email-1',
  fromName: 'Jane Doe',
  fromEmail: 'jane@example.com',
  company: 'Acme',
  subject: 'Pricing question',
  body: 'Can you send pricing and next steps?',
  date: '4/11/2026',
  isRead: false,
  needsResponse: true,
  isArchived: false,
  folder: 'INBOX'
};

test('createComposerResetState uses provided defaults and clears workflow fields', () => {
  const state = createComposerResetState({ defaultTone: 'Professional', defaultLength: 'Detailed' });
  assert.equal(state.tone, 'Professional');
  assert.equal(state.length, 'Detailed');
  assert.equal(state.hubspotId, null);
  assert.equal(state.body, '');
  assert.equal(state.aiContext, '');
  assert.equal(state.objection, '');
  assert.equal(state.selectedPlaybookId, '');
  assert.equal(state.sequenceCadenceId, 'standard');
  assert.equal(state.sequenceStepCount, 3);
  assert.deepEqual(state.sequenceSteps, []);
});

test('getInboxReplyMetadata normalizes reply subject and thread history', () => {
  const metadata = getInboxReplyMetadata(sampleInboxEmail);
  assert.equal(metadata.to, 'jane@example.com');
  assert.equal(metadata.subject, 'Re: Pricing question');
  assert.match(metadata.threadHistory, /Jane Doe wrote/);
  assert.match(metadata.threadHistory, /Can you send pricing/);
});

test('buildComposerStateFromInboxEmail returns a fresh draft for inbox selection', () => {
  const state = buildComposerStateFromInboxEmail({
    email: sampleInboxEmail,
    defaultTone: 'Friendly',
    defaultLength: 'Standard',
    aiContext: 'Drafting reply from inbox selection.'
  });

  assert.equal(state.to, 'jane@example.com');
  assert.equal(state.subject, 'Re: Pricing question');
  assert.equal(state.body, '');
  assert.equal(state.hubspotId, null);
  assert.equal(state.objection, '');
  assert.equal(state.tone, 'Friendly');
  assert.equal(state.length, 'Standard');
  assert.equal(state.aiContext, 'Drafting reply from inbox selection.');
  assert.deepEqual(state.suggestedSubjects, []);
});

test('buildComposerStateFromInboxEmail supports AI reply output without stale state carry-over', () => {
  const state = buildComposerStateFromInboxEmail({
    email: sampleInboxEmail,
    defaultTone: 'Professional',
    defaultLength: 'Concise',
    subjectOverride: 'Re: Pricing question for Acme',
    body: 'Thanks, Jane. Here are the next steps.',
    aiContext: 'Generated from inbox AI reply.'
  });

  assert.equal(state.subject, 'Re: Pricing question for Acme');
  assert.equal(state.body, 'Thanks, Jane. Here are the next steps.');
  assert.equal(state.aiContext, 'Generated from inbox AI reply.');
  assert.equal(state.jobTitle, '');
  assert.equal(state.hubspotId, null);
  assert.deepEqual(state.sequenceSteps, []);
});

test('buildHandledInboxEmailUpdate marks source email handled and archives optionally', () => {
  const updated = buildHandledInboxEmailUpdate(sampleInboxEmail, {
    archiveOriginal: true,
    resultingFolder: 'Archive'
  });

  assert.equal(updated.isRead, true);
  assert.equal(updated.needsResponse, false);
  assert.equal(updated.isArchived, true);
  assert.equal(updated.folder, 'Archive');
});

test('canReplyToInboxEmail rejects inbox records without a valid sender address', () => {
  assert.equal(canReplyToInboxEmail(sampleInboxEmail), true);
  assert.equal(canReplyToInboxEmail({ fromEmail: 'invalid' }), false);
  assert.equal(canReplyToInboxEmail({ fromEmail: '' }), false);
});

test('buildHeuristicInboxInsight scores pricing and next-step intent strongly', () => {
  const insight = buildHeuristicInboxInsight(sampleInboxEmail);
  assert.ok(insight.score >= 70);
  assert.match(insight.summary, /pricing interest|next step|commercial intent/i);
});

test('createFollowUpTaskFromInboxEmail creates a pending follow-up task', () => {
  const task = createFollowUpTaskFromInboxEmail(sampleInboxEmail);
  assert.equal(task.contact, 'Jane Doe');
  assert.equal(task.company, 'Acme');
  assert.equal(task.status, 'pending');
  assert.equal(task.priority, 70);
  assert.match(task.type, /Follow up if Jane Doe has not replied/i);
  assert.equal(task.sourceInboxId, 'email-1');
});

test('selectUrgentInboxEmails returns highest-priority actionable emails first', () => {
  const emails = [
    { ...sampleInboxEmail, id: '1', aiScore: 74, dateRaw: '2026-04-10T00:00:00.000Z' },
    { ...sampleInboxEmail, id: '2', aiScore: 91, dateRaw: '2026-04-11T00:00:00.000Z' },
    { ...sampleInboxEmail, id: '3', aiScore: 65, dateRaw: '2026-04-12T00:00:00.000Z' },
    { ...sampleInboxEmail, id: '4', aiScore: 88, isArchived: true, dateRaw: '2026-04-13T00:00:00.000Z' }
  ];

  const selected = selectUrgentInboxEmails(emails, { limit: 2, minScore: 70 });
  assert.deepEqual(selected.map((email) => email.id), ['2', '1']);
});

test('selectLowPriorityInboxEmails returns actionable low-score emails', () => {
  const emails = [
    { ...sampleInboxEmail, id: '1', aiScore: 22, dateRaw: '2026-04-11T00:00:00.000Z' },
    { ...sampleInboxEmail, id: '2', aiScore: 41, dateRaw: '2026-04-12T00:00:00.000Z' },
    { ...sampleInboxEmail, id: '3', aiScore: 18, needsResponse: false, dateRaw: '2026-04-13T00:00:00.000Z' }
  ];

  const selected = selectLowPriorityInboxEmails(emails, { maxScore: 40 });
  assert.deepEqual(selected.map((email) => email.id), ['1']);
});

test('parseSequenceSteps supports structured delay and goal metadata', () => {
  const parsed = parseSequenceSteps(`Step 1 - Initial Hook
Delay: 0 days
Goal: Open the conversation with a sharp value point.
Subject: Quick idea for Acme
Body: Jane, I noticed your team is hiring.

Step 2 - Value Add
Delay: 3 days
Goal: Share proof and make the next step feel easy.
Subject: Acme follow-up
Body: Sharing a customer example here.`);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].stepNumber, 1);
  assert.equal(parsed[0].delayDays, 0);
  assert.equal(parsed[0].goal, 'Open the conversation with a sharp value point.');
  assert.equal(parsed[1].delayLabel, '3 days');
  assert.equal(parsed[1].subject, 'Acme follow-up');
});

test('createSequenceTasksFromSteps creates dated follow-up tasks from parsed steps', () => {
  const tasks = createSequenceTasksFromSteps([
    { stepNumber: 1, stepTitle: 'Initial Hook', delayDays: 0, goal: 'Start the sequence.', subject: 'Hi', body: 'Hello there' },
    { stepNumber: 2, stepTitle: 'Proof', delayDays: 4, goal: 'Add social proof.', subject: 'Case study', body: 'Sharing proof' },
    { stepNumber: 3, stepTitle: 'Final Attempt', delayDays: 2, goal: 'Close the loop.', subject: 'Last try', body: 'Closing the loop' }
  ], {
    baseDateKey: '2026-04-12',
    recipientName: 'Jane Doe',
    companyName: 'Acme',
    recipientEmail: 'jane@example.com',
    owner: 'Shaun'
  });

  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].scheduledDate, '2026-04-12');
  assert.equal(tasks[1].scheduledDate, '2026-04-16');
  assert.equal(tasks[2].scheduledDate, '2026-04-18');
  assert.equal(tasks[1].contactEmail, 'jane@example.com');
  assert.match(tasks[1].notes, /Case study/);
  assert.equal(tasks[2].recurrenceLabel, 'Step 3');
});

test('getRecommendedOutreachStrategy prefers proposal-close and reactivation when context demands it', () => {
  assert.deepEqual(getRecommendedOutreachStrategy({ stage: 'Proposal' }), {
    playbookId: 'proposal-close',
    cadenceId: 'proposal-close'
  });

  assert.deepEqual(getRecommendedOutreachStrategy({ stage: 'Opportunity', isStale: true }), {
    playbookId: 'reactivation',
    cadenceId: 'reactivation'
  });
});

test('getSequenceCadenceById returns the requested number of step delays', () => {
  const cadence = getSequenceCadenceById('same-week', 4);
  assert.equal(cadence.id, 'same-week');
  assert.deepEqual(cadence.delays, [0, 2, 4, 7]);
});

test('buildOutreachPlayContext formats play, cadence, and relationship context for prompts', () => {
  const context = buildOutreachPlayContext({
    playbookId: 'opportunity-advance',
    cadenceId: 'same-week',
    stepCount: 4,
    recipientName: 'Jane Doe',
    companyName: 'Acme',
    stage: 'Opportunity',
    nextStep: 'Book the pricing review',
    followUpAt: '2026-04-15'
  });

  assert.match(context, /OUTREACH PLAY: Advance Opportunity/);
  assert.match(context, /Cadence: Same Week Push/);
  assert.match(context, /Step 4: Day 7/);
  assert.match(context, /Book the pricing review/);
});