import type { NextRequest } from 'next/server';
import { body, failure, json, requireUser, writeGuard } from '@/lib/server/http';
import { getStore, StoreError } from '@/lib/server/store';
import { isId } from '@/lib/server/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return auth.response!;
    return json({ workspaces: await (await getStore()).listWorkspaces(auth.user.id) });
  } catch (error) { return failure(error); }
}

/** create | join | invite | rename */
export async function POST(request: NextRequest) {
  const denied = writeGuard(request);
  if (denied) return denied;
  try {
    const auth = await requireUser(request);
    if (!auth.user) return auth.response!;
    const store = await getStore();
    const data = await body(request);
    const name = typeof data.name === 'string' ? data.name : '';
    if (data.action === 'create') return json({ workspaceId: await store.createWorkspace(auth.user.id, name) });
    if (data.action === 'join') return json({ workspaceId: await store.joinWorkspace(auth.user.id, typeof data.code === 'string' ? data.code : '') });
    if (!isId(data.workspaceId)) throw new StoreError('invalid', 'Choose a workspace');
    if (data.action === 'invite') return json(await store.createInvite(auth.user.id, data.workspaceId));
    if (data.action === 'rename') { await store.renameWorkspace(auth.user.id, data.workspaceId, name); return json({ ok: true }); }
    throw new StoreError('invalid', 'Unknown workspace action');
  } catch (error) { return failure(error); }
}
