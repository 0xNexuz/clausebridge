import { body, json } from '@/lib/server/http';
import { isId, workspaceRoute } from '@/lib/server/route';
import { StoreError } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { ws: string; id: string };

export const GET = workspaceRoute<P>(async (_request, { store, user, workspaceId }, { id }) => {
  if (!isId(id)) throw new StoreError('not_found', 'Contract not found');
  return json({ contract: await store.getContract(user.id, workspaceId, id) });
});

/** Set or clear the contract's effective date (used to resolve "within N days of the Effective Date"). */
export const PATCH = workspaceRoute<P>(async (request, { store, user, workspaceId }, { id }) => {
  if (!isId(id)) throw new StoreError('not_found', 'Contract not found');
  const data = await body(request);
  if (!('effectiveDate' in data)) throw new StoreError('invalid', 'Nothing to update');
  await store.setEffectiveDate(user.id, workspaceId, id, data.effectiveDate === null || data.effectiveDate === '' ? null : String(data.effectiveDate));
  return json({ contract: await store.getContract(user.id, workspaceId, id) });
}, { write: true });
