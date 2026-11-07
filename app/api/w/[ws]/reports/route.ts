import { antLingConfig } from '@/lib/server/ant-ling';
import { body, json } from '@/lib/server/http';
import { draftProgressReport } from '@/lib/server/report-draft';
import { isId, requestToday, workspaceRoute } from '@/lib/server/route';
import { StoreError } from '@/lib/server/store';
import { createThrottle } from '@/lib/server/throttle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const throttled = createThrottle({ minGapMs: 5_000, maxPerHour: 30 });

export const GET = workspaceRoute(async (_request, { store, user, workspaceId }) => json({ reports: await store.listReports(user.id, workspaceId) }));

/** Drafts a progress report for one contract or the whole workspace. */
export const POST = workspaceRoute(async (request, { store, user, workspaceId }) => {
  const data = await body(request);
  const contractId = isId(data.contractId) ? data.contractId : null;
  if (throttled(user.id)) return json({ error: 'Please wait a few seconds before drafting again.' }, 429);
  const today = requestToday(request);
  const [contracts, all, workspaces] = await Promise.all([store.listContracts(user.id, workspaceId), store.listObligations(user.id, workspaceId),
    store.listWorkspaces(user.id)]);
  const contract = contractId ? contracts.find(item => item.id === contractId) : null;
  if (contractId && !contract) throw new StoreError('not_found', 'Contract not found');
  const obligations = contract ? all.filter(ob => ob.contractId === contract.id) : all;
  if (!obligations.length) throw new StoreError('invalid', 'Confirm at least one obligation before drafting a report');
  const workspaceName = workspaces.find(w => w.id === workspaceId)?.name ?? 'Workspace';
  const title = `${contract ? contract.title : workspaceName}: progress report`;
  let config = null;
  try { config = antLingConfig(); } catch { config = null; }
  const contractTitles = new Map(contracts.map(item => [item.id, item.title]));
  let draft;
  try {
    draft = await draftProgressReport({ title, obligations, today, contractTitles, config,
      allowedNames: [workspaceName, ...contracts.map(item => item.title), ...contracts.flatMap(item => item.parties.map(p => p.name))] });
  } catch {
    // Ant Ling unreachable: still produce the report with ClauseBridge's own summary.
    draft = await draftProgressReport({ title, obligations, today, contractTitles, config: null, allowedNames: [] });
    draft.fallbackReason = 'Ant Ling could not be reached, so ClauseBridge wrote a plain summary.';
  }
  const id = await store.createReport(user.id, workspaceId, { contractId, title, asOf: today, draft, model: draft.model, requestId: draft.requestId });
  return json({ id, report: await store.getReport(user.id, workspaceId, id) }, 201);
}, { write: true });
