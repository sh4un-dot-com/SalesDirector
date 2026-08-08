import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail,
  isValidEmail,
  splitCsvRows,
  parseCsvLine,
  toContactFromRow,
  applyTaskPrioritization,
  parseInboxScoreSummary
} from '../utils/dataParsers.mjs';

test('normalizeEmail lowercases and trims', () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com');
});

test('isValidEmail validates basic email format', () => {
  assert.equal(isValidEmail('valid@example.com'), true);
  assert.equal(isValidEmail('invalid@email'), false);
});

test('splitCsvRows keeps newlines inside quoted cells', () => {
  const csv = 'name,email,notes\n"Jane Doe",jane@example.com,"line1\nline2"\n"Bob",bob@example.com,"ok"';
  const rows = splitCsvRows(csv);
  assert.equal(rows.length, 3);
  assert.match(rows[1], /line1\nline2/);
});

test('parseCsvLine handles quoted commas and escapes', () => {
  const parsed = parseCsvLine('"Jane, Doe",jane@example.com,"He said ""hi"""');
  assert.deepEqual(parsed, ['Jane, Doe', 'jane@example.com', 'He said "hi"']);
});

test('toContactFromRow builds contact object', () => {
  const headers = ['firstname', 'lastname', 'email', 'company'];
  const row = ['Jane', 'Doe', 'JANE@EXAMPLE.COM', 'Acme'];
  const contact = toContactFromRow(headers, row);
  assert.equal(contact.name, 'Jane Doe');
  assert.equal(contact.email, 'jane@example.com');
  assert.equal(contact.company, 'Acme');
});

test('applyTaskPrioritization updates and sorts tasks', () => {
  const tasks = [
    { id: 1, status: 'pending', priority: null, time: '', rationale: '' },
    { id: 2, status: 'pending', priority: 10, time: '', rationale: '' },
    { id: 3, status: 'completed', priority: 99, time: '', rationale: '' }
  ];

  const lines = [
    '[2] || [85] || [09:00 AM] || [Call first]',
    '[1] || [35] || [11:00 AM] || [Follow up later]'
  ];

  const updated = applyTaskPrioritization(lines, tasks);
  assert.equal(updated[0].id, 2);
  assert.equal(updated[0].priority, 85);
  assert.equal(updated[2].id, 3);
});

test('parseInboxScoreSummary extracts score and summary', () => {
  const parsed = parseInboxScoreSummary('Score: 92 || Summary: High intent and asks for pricing details.');
  assert.equal(parsed.score, 92);
  assert.equal(parsed.summary, 'High intent and asks for pricing details.');
});

test('parseInboxScoreSummary handles alternate score formatting', () => {
  const parsed = parseInboxScoreSummary('Score - 88/100\nSummary - Clear demo intent and wants a concrete next step.');
  assert.equal(parsed.score, 88);
  assert.equal(parsed.summary, 'Clear demo intent and wants a concrete next step.');
});
