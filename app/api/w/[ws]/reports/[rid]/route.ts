import { checkReport, draftFacts, factSheet, reportNames, staleFacts, type ReportDraftContent } from '@/lib/report';
import { body, json } from '@/lib/server/http';
import { isId, requestToday, workspaceRoute, type Ctx } from '@/lib/server/route';
import { StoreError } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { ws: string; rid: string };

async function context(ctx: Ctx, reportId: string, today: string) {
  const report = await ctx.store.getReport(ctx.user.id, ctx.workspaceId, reportId);
  const [contracts, all] = await Promise.all([ctx.store.listContracts(ctx.user.id, ctx.workspaceId), ctx.store.listObligations(ctx.user.id, ctx.workspaceId)]);
  const obligations = report.contractId ? all.filter(ob => ob.contractId === report.contractId) : all;
  // An approved report is compared on its own date; a draft is checked against today's data.
  const asOf = report.status === 'approved' ? report.asOf : today;
  const facts = factSheet(obligations, asOf, new Map(contracts.map(item => [item.id, item.title])));
  const workspace = (await ctx.store.listWorkspaces(ctx.user.id)).find(item => item.id === ctx.workspaceId);
  // Names and ClauseBridge's own template wording may contain digits; they are not figures.
  const allowed = [...reportNames({ workspaceName: workspace?.name, contracts, members: workspace?.members, obligations }), 'next 30 days', ...obligations.map(ob => ob.ref)];
  return { report, facts, allowed, obligations };
}

export const GET = workspaceRoute<P>(async (request, ctx, { rid }) => {
  if (!isId(rid)) throw new StoreError('not_found', 'Report not found');
  const { report, facts } = await context(ctx, rid, requestToday(request));
  const stale = report.status === 'approved' && report.approvedFacts ? staleFacts(report.approvedFacts as Record<string, string>, facts) : [];
  return json({ report, stale });
});

/** check | approve the edited report text. Approval is refused unless the check passes. */
export const POST = workspaceRoute<P>(async (request, ctx, { rid }) => {
  if (!isId(rid)) throw new StoreError('not_found', 'Report not found');
  const data = await body(request);
  const text = typeof data.text === 'string' ? data.text : '';
  if (!text.trim()) throw new StoreError('invalid', 'The report is empty');
  if (text.length > 40_000) throw new StoreError('invalid', 'The report is longer than 40,000 characters');
  const { report, facts, allowed } = await context(ctx, rid, requestToday(request));
  const refs = draftFacts((report.draft as ReportDraftContent).blocks);
  const check = checkReport(text, refs, facts, allowed);
  if (data.action === 'check') return json({ check });
  if (data.action !== 'approve') throw new StoreError('invalid', 'Unknown action');
  if (!check.ok) return json({ check, error: 'Fix the flagged figures before approving.' }, 409);
  const approvedFacts = Object.fromEntries(refs.filter(ref => facts.get(ref.token)?.text === ref.text && text.includes(ref.text)).map(ref => [ref.token, ref.text]));
  const result = await ctx.store.approveReport(ctx.user.id, ctx.workspaceId, rid, text, approvedFacts, check.verified);
  return json({ check, ...result });
}, { write: true });
