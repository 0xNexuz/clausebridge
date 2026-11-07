import { buildDashboard, remindersFor } from '@/lib/obligations';
import { json } from '@/lib/server/http';
import { requestToday, workspaceRoute } from '@/lib/server/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything the workspace screens need at once: contracts, obligations, dashboard and the caller's reminders. */
export const GET = workspaceRoute(async (request, { store, user, workspaceId }) => {
  const today = requestToday(request);
  const [contracts, obligations] = await Promise.all([store.listContracts(user.id, workspaceId), store.listObligations(user.id, workspaceId)]);
  const dashboard = buildDashboard(obligations, contracts.map(c => ({ contractId: c.id, title: c.title, pending: c.pending })), today);
  return json({ today, contracts, obligations, dashboard, reminders: remindersFor(obligations, user.id, today) });
});
