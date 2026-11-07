import { parseMoneyInput } from '@/lib/contract/terms';
import { body, json } from '@/lib/server/http';
import { isId, requestToday, workspaceRoute } from '@/lib/server/route';
import { StoreError, type ObligationPatch } from '@/lib/server/store';
import { STATUSES, type Status } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { ws: string; oid: string };

export const GET = workspaceRoute<P>(async (_request, { store, user, workspaceId }, { oid }) => {
  if (!isId(oid)) throw new StoreError('not_found', 'Obligation not found');
  return json(await store.getObligation(user.id, workspaceId, oid));
});

/** Change status, owner, due date, title or (for payments) the amount paid. Requires the version you last saw. */
export const PATCH = workspaceRoute<P>(async (request, { store, user, workspaceId }, { oid }) => {
  if (!isId(oid)) throw new StoreError('not_found', 'Obligation not found');
  const data = await body(request);
  const version = Number(data.version);
  if (!Number.isSafeInteger(version) || version < 1) throw new StoreError('invalid', 'Missing version');
  const patch: ObligationPatch = {};
  if (typeof data.status === 'string') {
    if (!STATUSES.includes(data.status as Status)) throw new StoreError('invalid', 'Unknown status');
    patch.status = data.status as Status;
  }
  if ('ownerId' in data) patch.ownerId = isId(data.ownerId) ? data.ownerId : null;
  if ('dueDate' in data) patch.dueDate = typeof data.dueDate === 'string' && data.dueDate ? data.dueDate : null;
  if (typeof data.title === 'string') patch.title = data.title;
  if ('paid' in data) {
    const cents = data.paid === '' || data.paid === null ? 0 : parseMoneyInput(data.paid);
    if (cents === null) throw new StoreError('invalid', 'Enter the amount paid as a number');
    patch.paidCents = cents;
  }
  if ('paidDate' in data) patch.paidDate = typeof data.paidDate === 'string' && data.paidDate ? data.paidDate : null;
  return json(await store.updateObligation(user.id, workspaceId, oid, version, patch, requestToday(request)));
}, { write: true });
