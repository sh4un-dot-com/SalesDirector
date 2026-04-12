import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canReplyToInboxEmail,
  createComposerResetState,
  buildComposerStateFromInboxEmail,
  buildHandledInboxEmailUpdate,
  getInboxReplyMetadata,
  buildHeuristicInboxInsight,
  createFollowUpTaskFromInboxEmail,
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