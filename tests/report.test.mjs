import test from 'node:test';
import assert from 'node:assert/strict';
import { blockText, buildReportBlocks, checkReport, draftFacts, factSheet, plainSummary, reportNames } from '../lib/report.ts';

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
  return { facts, refs: draftFacts(blocks), text: blocks.map(blockText).join('\n') };
}

test('names with digits are not figures, but a name made only of digits never hides a number', () => {
  const names = reportNames({ workspaceName: 'Team 7', contracts, members: [{ username: 'live6t44ib' }, { username: '4500' }], obligations });
  assert.ok(names.includes('live6t44ib') && names.includes('Studio 54 Ltd') && names.includes('Team 7'));
  assert.ok(!names.includes('4500'));
});

test('a report owned by a member whose name has digits passes the check; a typed number is still flagged', () => {
  const { facts, refs, text } = report();
  assert.match(text, /owner live6t44ib/);
  const allowed = [...reportNames({ contracts, obligations }), 'next 30 days', ...obligations.map(ob => ob.ref)];
  const check = checkReport(text, refs, facts, allowed);
  assert.deepEqual(check.unverified.map(item => item.value), ['4500'], 'the digits-only owner name is checked like any number');
  const clean = checkReport(text.replace('owner 4500', 'owner tobi'), refs, facts, allowed);
  assert.equal(clean.ok, true);
  const typed = checkReport(`${text.replace('owner 4500', 'owner tobi')}\nWe expect about USD 2,500.00 more next month.`, refs, facts, allowed);
  assert.deepEqual(typed.unverified.map(item => item.value), ['2,500.00']);
});
