import { parseMoneyInput } from '@/lib/contract/terms';
import { body, json } from '@/lib/server/http';
import { isId, workspaceRoute } from '@/lib/server/route';
import { StoreError } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Saves the "Paid" and "Paid on" cells edited in the Univer payment schedule. Each row carries the
 * obligation version the sheet was built from, so a concurrent change is refused rather than overwritten.
 */
export const POST = workspaceRoute(async (request, { store, user, workspaceId }) => {
  const data = await body(request);
  if (!Array.isArray(data.rows) || data.rows.length > 300) throw new StoreError('invalid', 'No payment rows to save');
  const results: { id: string; ref: string; changed: boolean; error?: string }[] = [];
  for (const item of data.rows as Record<string, unknown>[]) {
    if (!isId(item?.id)) throw new StoreError('invalid', 'Malformed payment row');
    const version = Number(item.version);
    const paid = item.paid === '' || item.paid === null || item.paid === undefined ? 0 : parseMoneyInput(item.paid);
    const ref = typeof item.ref === 'string' ? item.ref : item.id;
    if (paid === null) { results.push({ id: item.id, ref, changed: false, error: 'Paid is not a number' }); continue; }
    const paidDate = typeof item.paidDate === 'string' && item.paidDate ? item.paidDate : null;
    try {
      const result = await store.updateObligation(user.id, workspaceId, item.id, version, { paidCents: paid, paidDate });
      results.push({ id: item.id, ref, changed: result.changed });
    } catch (error) {
      if (error instanceof StoreError && error.code !== 'not_found') results.push({ id: item.id, ref, changed: false, error: error.message });
      else throw error;
    }
  }
  return json({ results, saved: results.filter(r => r.changed).length, failed: results.filter(r => r.error).length });
}, { write: true });
