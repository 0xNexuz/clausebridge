// Runs the store against a real PostgreSQL database (the hosted adapter).
// Usage: DATABASE_URL=postgres://user@127.0.0.1:5432/db npm run test:postgres
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPostgres } from '../lib/server/db.ts';
import { migrate } from '../lib/server/schema.ts';
import { ClauseBridgeStore } from '../lib/server/store.ts';
import { normalizeContractText, splitClauses } from '../lib/contract/clauses.ts';
import { groundReplies } from '../lib/server/extract.ts';
import { buildDashboard } from '../lib/obligations.ts';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Set DATABASE_URL to a disposable PostgreSQL database'); process.exit(1); }
const { db, close } = openPostgres(url);
try {
  await migrate(db);
  await migrate(db); // idempotent
  const store = new ClauseBridgeStore(db);
  const suffix = Date.now().toString(36);
  const amara = await store.createUser(`amara${suffix}`, 'aa', 'bb');
  const tobi = await store.createUser(`tobi${suffix}`, 'aa', 'bb');
  await assert.rejects(store.createUser(`AMARA${suffix}`, 'aa', 'bb'), /unavailable/);
  const [ws] = await store.listWorkspaces(amara.id);
  const text = normalizeContractText(readFileSync(new URL('../data/samples/website-redesign.txt', import.meta.url), 'utf8'));
  const clauses = splitClauses(text);
  const contractId = await store.createContract(amara.id, ws.id, { title: 'Website', fileName: 'w.pdf', fileKind: 'pdf', bytes: Buffer.from('%PDF-1.4 x'), text, clauses });
  await store.setEffectiveDate(amara.id, ws.id, contractId, '2026-11-03');
  const reply = JSON.parse(readFileSync(new URL('./fixtures/standin-website-reply.json', import.meta.url), 'utf8'));
  const { suggestions } = groundReplies([reply], { text, clauses, effectiveDate: '2026-11-03', model: 'test' });
  const saved = await store.saveExtraction(amara.id, ws.id, contractId, suggestions, { model: 'test', requestIds: ['r'], ranAt: new Date().toISOString(), suggested: suggestions.length, dropped: [], tokens: 10, ranBy: 'amara' });
  assert.equal(saved.added, suggestions.length);
  const detail = await store.getContract(amara.id, ws.id, contractId);
  const deposit = detail.suggestions.find(s => s.title === 'Pay the deposit');
  const { obligationId } = await store.decideSuggestion(amara.id, ws.id, deposit.id, { action: 'confirm', edits: { ownerId: amara.id } });
  await store.decideSuggestion(amara.id, ws.id, detail.suggestions.find(s => s.kind === 'party').id, { action: 'confirm', edits: {} });
  await store.decideSuggestion(amara.id, ws.id, detail.suggestions.find(s => s.title === 'Launch the completed website').id, { action: 'reject', reason: 'test' });
  const obligations = await store.listObligations(amara.id, ws.id);
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].amountCents, 450000);
  assert.equal(typeof obligations[0].amountCents, 'number');
  assert.equal(obligations[0].dueDate, '2026-11-10');
  const updated = await store.updateObligation(amara.id, ws.id, obligationId, 1, { paidCents: 450000, paidDate: '2026-11-09' });
  assert.equal(updated.obligation.status, 'done');
  await store.addEvidence(amara.id, ws.id, obligationId, { kind: 'file', label: 'Receipt', fileName: 'r.pdf', fileMime: 'application/pdf', bytes: Buffer.from('%PDF-1.4 receipt') });
  const file = await store.evidenceFile(amara.id, ws.id, (await store.getObligation(amara.id, ws.id, obligationId)).evidence[0].id);
  assert.equal(Buffer.from(file.file_bytes).toString(), '%PDF-1.4 receipt');
  const contracts = await store.listContracts(amara.id, ws.id);
  assert.equal(contracts[0].obligations, 1);
  assert.equal(contracts[0].done, 1);
  assert.equal(typeof contracts[0].pending, 'number');
  const dash = buildDashboard(await store.listObligations(amara.id, ws.id), contracts.map(c => ({ contractId: c.id, title: c.title, pending: c.pending })), '2026-11-20');
  assert.equal(dash.payments[0].paidCents, 450000);
  await assert.rejects(store.getContract(tobi.id, ws.id, contractId), /not found/i);
  const invite = await store.createInvite(amara.id, ws.id);
  await store.joinWorkspace(tobi.id, invite.code);
  assert.equal((await store.listWorkspaces(tobi.id)).length, 2);
  const reportId = await store.createReport(amara.id, ws.id, { contractId, title: 'Report', asOf: '2026-11-20', draft: { blocks: [] }, model: null, requestId: null });
  await store.approveReport(tobi.id, ws.id, reportId, 'Report text', { 'count:total': '1' }, 1);
  assert.equal((await store.getReport(amara.id, ws.id, reportId)).status, 'approved');
  const token = await store.createCalendarFeed(amara.id);
  assert.equal((await store.calendarObligations(token)).length, 1);
  const audit = await store.listAudit(amara.id, ws.id);
  assert.ok(audit.length >= 9);
  await assert.rejects(db.run("UPDATE audit SET summary = 'x' WHERE workspace_id = ?", [ws.id]), /append-only/);
  await store.recordLoginFailure(`amara${suffix}`);
  await store.recordLoginSuccess(`amara${suffix}`);
  console.log(`postgres integration ok: ${audit.length} audit entries, ${suggestions.length} suggestions`);
} finally {
  await close();
}
