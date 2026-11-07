import { AntLingError, antLingConfig } from '@/lib/server/ant-ling';
import { extractTerms } from '@/lib/server/extract';
import { json } from '@/lib/server/http';
import { isId, workspaceRoute } from '@/lib/server/route';
import { StoreError } from '@/lib/server/store';
import { createThrottle } from '@/lib/server/throttle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const throttled = createThrottle({ minGapMs: 8_000, maxPerHour: 20 });

/** Asks Ling 3.2 Flash to suggest the contract's terms, then checks every suggestion against the contract text. */
export const POST = workspaceRoute<{ ws: string; id: string }>(async (_request, { store, user, workspaceId }, { id }) => {
  if (!isId(id)) throw new StoreError('not_found', 'Contract not found');
  let config;
  try { config = antLingConfig(); } catch { config = null; }
  if (!config) return json({ error: 'Ant Ling is not connected on this server, so terms cannot be suggested. Set ANT_LING_API_KEY.' }, 503);
  const contract = await store.getContract(user.id, workspaceId, id);
  if (throttled(`${user.id}`)) return json({ error: 'Please wait a few seconds before asking for suggestions again.' }, 429);
  try {
    const result = await extractTerms(config, contract);
    if (!result.suggestions.length && result.unreadable) {
      return json({ error: 'Ant Ling replied, but not in a form ClauseBridge could read. Try again.' }, 502);
    }
    const saved = await store.saveExtraction(user.id, workspaceId, id, result.suggestions, {
      model: result.meta.model, requestIds: result.meta.requestIds, ranAt: new Date().toISOString(), suggested: result.suggestions.length,
      dropped: result.dropped.slice(0, 20), tokens: result.meta.tokens, ranBy: user.username,
    });
    return json({ ...saved, model: result.meta.model, tokens: result.meta.tokens, chunks: result.meta.chunks,
      contract: await store.getContract(user.id, workspaceId, id) });
  } catch (error) {
    if (error instanceof AntLingError) {
      return json({ error: error.message }, error.code === 'rate_limited' ? 429 : error.code === 'timeout' ? 504 : 502);
    }
    throw error;
  }
}, { write: true });
