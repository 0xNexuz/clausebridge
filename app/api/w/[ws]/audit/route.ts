import { json } from '@/lib/server/http';
import { workspaceRoute } from '@/lib/server/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = workspaceRoute(async (request, { store, user, workspaceId }) =>
  json({ entries: await store.listAudit(user.id, workspaceId, Number(request.nextUrl.searchParams.get('limit') ?? 200)) }));
