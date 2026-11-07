import test from 'node:test';
import assert from 'node:assert/strict';
import { blockText, buildReportBlocks, checkReport, factSheet, plainSummary, reportNames } from '../lib/report.ts';

const base = {
  contractId: 'c1', contractTitle: 'Website Redesign Services Agreement', party: 'Client', dueText: '', dueSource: 'contract',
  amountSource: 'contract', paidDate: null, clauseId: 'k1', quote: 'q', quoteStart: 0, quoteEnd: 1, evidenceCount: 0, version: 1, updatedAt: '2026-11-07T00:00:00Z',
};
const obligations = [
  { ...base, id: 'o1', ref: 'OB-014', kind: 'deadline', title: 'Name project lead', ownerId: 'u1', ownerName: 'live6t44ib', dueDate: '2026-11-10',
    amountCents: null, currency: null, paidCents: 0, status: 'in_progress', clauseLabel: 'Clause 1.2' },
  { ...base, id: 'o2', ref: 'OB-020', kind: 'payment', title: 'Pay deposit of USD 4,500', ownerId: 'u2', ownerName: '4500', dueDate: '2026-11-10',
    amountCents: 450000, currency: 'USD', paidCents: 450000, status: 'done', clauseLabel: 'Clause 3.2' },
];
const contracts = [{ title: 'Website Redesign Services Agreement', parties: [{ name: 'Studio 54 Ltd' }] }];

function report() {
  const facts = factSheet(obligations, '2026-11-07', new Map([['c1', contracts[0].title]]));
  const blocks = buildReportBlocks('Progress report', obligations, '2026-11-07', facts, plainSummary(facts));
  return { facts, blocks, text: blocks.map(blockText).join('\n') };
}

test('names with digits are not figures, but a name made only of digits never hides a number', () => {
  const names = reportNames({ workspaceName: 'Team 7', contracts, members: [{ username: 'live6t44ib' }, { username: '4500' }], obligations });
  assert.ok(names.includes('live6t44ib') && names.includes('Studio 54 Ltd') && names.includes('Team 7'));
  assert.ok(!names.includes('4500'));
});

test('a report owned by a member whose name has digits passes the check; a typed number is still flagged', () => {
  const { facts, blocks, text } = report();
  assert.match(text, /owner live6t44ib/);
  const allowed = [...reportNames({ contracts, obligations }), 'next 30 days', ...obligations.map(ob => ob.ref)];
  const check = checkReport(text, blocks, facts, allowed);
  assert.deepEqual(check.unverified.map(item => item.value), ['4500'], 'the digits-only owner name is checked like any number');
  const clean = checkReport(text.replace('owner 4500', 'owner tobi'), blocks, facts, allowed);
  assert.equal(clean.ok, true);
  const typed = checkReport(`${text.replace('owner 4500', 'owner tobi')}\nWe expect about USD 2,500.00 more next month.`, blocks, facts, allowed);
  assert.deepEqual(typed.unverified.map(item => item.value), ['2,500.00']);
});

test('a figure moved to the wrong place fails the check, even when it equals another current fact', () => {
  const four = [
    { ...base, id: 'p1', ref: 'OB-001', kind: 'deadline', title: 'Name project lead', ownerId: 'u1', ownerName: 'amara', dueDate: '2026-11-05', amountCents: null, currency: null, paidCents: 0, status: 'open', clauseLabel: 'Clause 1.2' },
    { ...base, id: 'p2', ref: 'OB-002', kind: 'payment', title: 'Pay the deposit', ownerId: 'u1', ownerName: 'amara', dueDate: '2026-11-10', amountCents: 450000, currency: 'USD', paidCents: 0, status: 'open', clauseLabel: 'Clause 3.2' },
    { ...base, id: 'p3', ref: 'OB-003', kind: 'payment', title: 'Pay the final instalment', ownerId: 'u1', ownerName: 'amara', dueDate: '2027-01-20', amountCents: 600000, currency: 'USD', paidCents: 0, status: 'done', clauseLabel: 'Clause 3.4' },
    { ...base, id: 'p4', ref: 'OB-004', kind: 'deliverable', title: 'Deliver mockups', ownerId: 'u1', ownerName: 'amara', dueDate: '2026-12-11', amountCents: null, currency: null, paidCents: 0, status: 'in_progress', clauseLabel: 'Clause 2.2' },
  ];
  const facts = factSheet(four, '2026-11-07', new Map([['c1', contracts[0].title]]));
  const blocks = buildReportBlocks('Progress report', four, '2026-11-07', facts, plainSummary(facts));
  const text = blocks.map(blockText).join('\n');
  const allowed = [...reportNames({ contracts, obligations: four }), 'next 30 days', ...four.map(ob => ob.ref)];
  const check = edited => checkReport(edited, blocks, facts, allowed);
  assert.match(text, /Of 4 confirmed obligations, 1 are done and 3 are still open\. 1 are overdue/);
  assert.equal(check(text).ok, true, 'the untouched draft passes');
  assert.equal(check(text.replace('1 are done', '1 is done').replace('3 are still open', '3 is still open')).ok, true, 'grammar fixes pass');
  assert.equal(check(`${text}\nThe client has been reminded about the deposit.`).ok, true, 'commentary without figures passes');
  // Each edit below puts a value that is some current fact where a different fact was: none may pass.
  const edits = {
    'done count replaced by the total': text.replace('1 are done', '4 are done'),
    'overdue count replaced by the open count': text.replace('1 are overdue', '3 are overdue'),
    'counts swapped': text.replace('1 are done and 3 are still open', '3 are done and 1 are still open'),
    'outstanding amount of another payment': text.replace('USD 4,500.00 outstanding', 'USD 6,000.00 outstanding'),
    'due date of another obligation': text.replace('due 10 Nov 2026', 'due 5 Nov 2026'),
    'status word changed': text.replace('due 5 Nov 2026, Not started', 'due 5 Nov 2026, Done'),
    'meaning word beside a figure changed': text.replace('1 are overdue', '1 are blocked'),
    'typed figure equal to a count': `${text}\nA late fee of 3 percent applies.`,
    'typed amount equal to a fact': `${text}\nThe client also owes USD 4,500.00 for hosting.`,
  };
  for (const [label, edited] of Object.entries(edits)) {
    const result = check(edited);
    assert.equal(result.ok, false, label);
    assert.ok(result.moved.length > 0, `${label}: reported as moved`);
  }
});
