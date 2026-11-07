import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openSqlite } from '../lib/server/db.ts';
import { migrate } from '../lib/server/schema.ts';
import { ClauseBridgeStore } from '../lib/server/store.ts';
import { normalizeContractText, splitClauses } from '../lib/contract/clauses.ts';
import { groundReplies } from '../lib/server/extract.ts';
import { buildDashboard, paymentTotals } from '../lib/obligations.ts';
import { obligationsCalendar } from '../lib/ics.ts';

// A stand-in reply in Ling's output format, written for tests. It is not real model output.
const reply = JSON.parse(readFileSync(new URL('./fixtures/standin-website-reply.json', import.meta.url), 'utf8'));
const text = normalizeContractText(readFileSync(new URL('../data/samples/website-redesign.txt', import.meta.url), 'utf8'));
const clauses = splitClauses(text);

async function setup() {
  const { db } = await openSqlite(':memory:');
  await migrate(db);
  const store = new ClauseBridgeStore(db);
  const amara = await store.createUser('amara', 'aa', 'bb');
  const tobi = await store.createUser('tobi', 'aa', 'bb');
  const [ws] = await store.listWorkspaces(amara.id);
  const contractId = await store.createContract(amara.id, ws.id, { title: 'Website Redesign Services Agreement', fileName: 'w.txt', fileKind: 'txt', bytes: null, text, clauses });
  return { store, db, amara, tobi, ws, contractId };
}

test('grounding keeps only quotes found in the contract and reads dates and amounts itself', () => {
  const { suggestions, dropped } = groundReplies([reply], { text, clauses, effectiveDate: null, model: 'Ling-3.2-flash' });
  assert.equal(dropped.length, 1, 'the invented launch bonus is dropped');
  assert.match(dropped[0].reason, /not in the contract/);
  assert.equal(suggestions.filter(s => s.kind === 'party').length, 2);
  const deposit = suggestions.find(s => s.title === 'Pay the deposit');
  assert.equal(deposit.amount.cents, 450000);
  assert.equal(deposit.amount.source, 'contract');
  assert.equal(deposit.due.date, null, 'relative timing needs the effective date');
  assert.equal(deposit.confidence, 'low');
  assert.equal(clauses.find(c => c.id === deposit.clauseId).ref, '3.2');
  const mockups = suggestions.find(s => s.title === 'Deliver the design mockups');
  assert.equal(mockups.due.date, '2026-12-11');
  assert.equal(mockups.confidence, 'high');
  const insurance = suggestions.find(s => s.kind === 'responsibility' && /insurance/.test(s.title));
  assert.equal(insurance.amount.cents, 25000000);
});

test('the effective date resolves "within N days of the Effective Date"', () => {
  const { suggestions } = groundReplies([reply], { text, clauses, effectiveDate: '2026-11-03', model: 'Ling-3.2-flash' });
  const deposit = suggestions.find(s => s.title === 'Pay the deposit');
  assert.equal(deposit.due.date, '2026-11-10');
  assert.equal(deposit.due.source, 'computed');
  const lead = suggestions.find(s => /project lead/.test(s.title));
  assert.equal(lead.due.date, '2026-11-10', 'five business days after Tue 3 Nov');
});

test('a model date or amount the clause does not state is never used', () => {
  const tampered = { items: [{ ...reply.items[1], due: '2026-11-30', amount: 'USD 9,999' }] };
  const [item] = groundReplies([tampered], { text, clauses, effectiveDate: null, model: 'm' }).suggestions;
  assert.equal(item.due.date, '2026-11-20');
  assert.equal(item.amount.cents, null);
  assert.ok(item.checks.some(c => c.id === 'model' && !c.ok && /30 Nov 2026/.test(c.text)));
  assert.ok(item.checks.some(c => c.id === 'model' && !c.ok && /9,999/.test(c.text)));
  assert.equal(item.confidence, 'low');
});

test('confirmation is the only way a suggestion becomes an obligation, and workspaces stay private', async () => {
  const { store, db, amara, tobi, ws, contractId } = await setup();
  await store.setEffectiveDate(amara.id, ws.id, contractId, '2026-11-03');
  const { suggestions } = groundReplies([reply], { text, clauses, effectiveDate: '2026-11-03', model: 'Ling-3.2-flash' });
  await store.saveExtraction(amara.id, ws.id, contractId, suggestions, { model: 'Ling-3.2-flash', requestIds: ['r1'], ranAt: '', suggested: suggestions.length, dropped: [], tokens: 100, ranBy: 'amara' });
  assert.equal((await store.listObligations(amara.id, ws.id)).length, 0, 'suggestions are not obligations');

  await assert.rejects(store.getContract(tobi.id, ws.id, contractId), /not found/i);
  const invite = await store.createInvite(amara.id, ws.id);
  await store.joinWorkspace(tobi.id, invite.code.toLowerCase());
  assert.equal((await store.getContract(tobi.id, ws.id, contractId)).suggestions.length, suggestions.length);

  const detail = await store.getContract(amara.id, ws.id, contractId);
  const deposit = detail.suggestions.find(s => s.title === 'Pay the deposit');
  const { obligationId } = await store.decideSuggestion(tobi.id, ws.id, deposit.id, { action: 'confirm', edits: { ownerId: tobi.id } });
  await assert.rejects(store.decideSuggestion(amara.id, ws.id, deposit.id, { action: 'reject' }), /already been decided/);
  const party = detail.suggestions.find(s => s.kind === 'party');
  await store.decideSuggestion(amara.id, ws.id, party.id, { action: 'confirm', edits: {} });
  const mockups = detail.suggestions.find(s => s.title === 'Deliver the design mockups');
  await store.decideSuggestion(amara.id, ws.id, mockups.id, { action: 'confirm', edits: { dueDate: '2026-12-15', title: 'Deliver the four design mockups' } });

  const obligations = await store.listObligations(amara.id, ws.id);
  assert.deepEqual(obligations.map(o => o.ref), ['OB-001', 'OB-002']);
  const ob = obligations.find(o => o.id === obligationId);
  assert.equal(ob.dueDate, '2026-11-10');
  assert.equal(ob.dueSource, 'computed');
  assert.equal(ob.amountCents, 450000);
  assert.equal(ob.ownerName, 'tobi');
  assert.equal(ob.clauseLabel, 'Clause 3.2');
  assert.equal(obligations.find(o => o.ref === 'OB-002').dueSource, 'person', 'a date the person typed is marked as theirs');
  assert.equal((await store.getContract(amara.id, ws.id, contractId)).parties[0].name, 'Harbor & Pine Foods Ltd');

  // Payments: a partial payment keeps it open; full payment marks it done; stale versions are refused.
  const partial = await store.updateObligation(amara.id, ws.id, obligationId, 1, { paidCents: 200000, paidDate: '2026-11-08' });
  assert.equal(partial.obligation.status, 'open');
  await assert.rejects(store.updateObligation(amara.id, ws.id, obligationId, 1, { status: 'done' }), /Someone else changed/);
  const full = await store.updateObligation(amara.id, ws.id, obligationId, 2, { paidCents: 450000 });
  assert.equal(full.obligation.status, 'done');
  await assert.rejects(store.updateObligation(amara.id, ws.id, obligationId, 3, { paidCents: 450001 }), /between 0 and/);

  await store.addEvidence(amara.id, ws.id, obligationId, { kind: 'file', label: 'Bank receipt', fileName: 'receipt.pdf', fileMime: 'application/pdf', bytes: Buffer.from('%PDF-1.4 test') });
  const withEvidence = await store.getObligation(amara.id, ws.id, obligationId);
  assert.equal(withEvidence.evidence.length, 1);
  assert.ok(withEvidence.history.some(h => h.action === 'suggestion_confirmed'));
  assert.ok(withEvidence.history.some(h => h.action === 'evidence_added'));

  const audit = await store.listAudit(amara.id, ws.id);
  assert.ok(audit.some(a => a.action === 'terms_suggested' && /Ling-3.2-flash/.test(a.summary)));
  await assert.rejects(db.run("UPDATE audit SET summary = 'x'"), /append-only/);
  await assert.rejects(db.run('DELETE FROM audit'), /append-only/);
});

test('dashboard, payment totals and calendar feed come from confirmed obligations only', async () => {
  const { store, amara, ws, contractId } = await setup();
  await store.setEffectiveDate(amara.id, ws.id, contractId, '2026-11-03');
  const { suggestions } = groundReplies([reply], { text, clauses, effectiveDate: '2026-11-03', model: 'm' });
  await store.saveExtraction(amara.id, ws.id, contractId, suggestions, { model: 'm', requestIds: [], ranAt: '', suggested: 0, dropped: [], tokens: null, ranBy: 'amara' });
  const pending = (await store.getContract(amara.id, ws.id, contractId)).suggestions;
  for (const title of ['Pay the deposit', 'Pay the design-stage instalment', 'Pay the final instalment', 'Deliver the discovery report']) {
    await store.decideSuggestion(amara.id, ws.id, pending.find(s => s.title === title).id, { action: 'confirm', edits: {} });
  }
  const obligations = await store.listObligations(amara.id, ws.id);
  const totals = paymentTotals(obligations, '2026-11-20');
  assert.deepEqual(totals.map(t => [t.currency, t.scheduledCents, t.outstandingCents, t.overdueCents]), [['USD', 1500000, 1500000, 450000]]);
  const dash = buildDashboard(obligations, [{ contractId, title: 'W', pending: pending.length - 4 }], '2026-11-20');
  assert.deepEqual(dash.overdue.map(o => o.title), ['Pay the deposit']);
  assert.deepEqual(dash.dueSoon.map(o => o.title), ['Deliver the discovery report', 'Pay the design-stage instalment']);
  assert.ok(dash.attention.some(a => a.kind === 'pending'));
  assert.ok(dash.attention.some(a => a.kind === 'no_owner'));
  const ics = obligationsCalendar(obligations, 'https://example.test', new Date('2026-11-07T00:00:00Z'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 4);
  assert.match(ics, /DTSTART;VALUE=DATE:20261110/);
  assert.match(ics, /TRIGGER:-PT15H/);
  assert.ok(ics.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
});
