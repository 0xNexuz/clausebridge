import { parseMoneyInput } from '@/lib/contract/terms';
import { body, json } from '@/lib/server/http';
import { isId, workspaceRoute } from '@/lib/server/route';
import { StoreError, type ConfirmEdits } from '@/lib/server/store';
import { KINDS, type Kind } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Confirm (optionally with edits) or reject one suggested term. Only confirmation creates an obligation. */
export const POST = workspaceRoute<{ ws: string; sid: string }>(async (request, { store, user, workspaceId }, { sid }) => {
  if (!isId(sid)) throw new StoreError('not_found', 'Suggestion not found');
  const data = await body(request);
  if (data.action === 'reject') {
    await store.decideSuggestion(user.id, workspaceId, sid, { action: 'reject', reason: typeof data.reason === 'string' ? data.reason : '' });
    return json({ ok: true });
  }
  if (data.action !== 'confirm') throw new StoreError('invalid', 'Unknown action');
  const raw = (data.edits && typeof data.edits === 'object' ? data.edits : {}) as Record<string, unknown>;
  const edits: ConfirmEdits = {};
  if (typeof raw.kind === 'string') {
    if (!KINDS.includes(raw.kind as Kind)) throw new StoreError('invalid', 'Unknown obligation type');
    edits.kind = raw.kind as Kind;
  }
  if (typeof raw.title === 'string') edits.title = raw.title;
  if (typeof raw.party === 'string') edits.party = raw.party;
  if ('ownerId' in raw) edits.ownerId = isId(raw.ownerId) ? raw.ownerId : null;
  if ('dueDate' in raw) edits.dueDate = typeof raw.dueDate === 'string' && raw.dueDate ? raw.dueDate : null;
  if ('amount' in raw) {
    if (raw.amount === null || raw.amount === '') edits.amountCents = null;
    else {
      const cents = parseMoneyInput(raw.amount);
      if (cents === null || cents === 0) throw new StoreError('invalid', 'Enter the amount as a number, for example 4500 or 4,500.00');
      edits.amountCents = cents;
    }
  }
  if (typeof raw.currency === 'string') edits.currency = raw.currency.trim().toUpperCase() || null;
  const result = await store.decideSuggestion(user.id, workspaceId, sid, { action: 'confirm', edits });
  return json(result);
}, { write: true });
