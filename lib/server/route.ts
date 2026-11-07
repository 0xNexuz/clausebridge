import type { NextRequest } from 'next/server';
import { failure, json, requireUser, writeGuard } from './http.ts';
import { getStore, type ClauseBridgeStore } from './store.ts';

export type Ctx = { user: { id: string; username: string }; store: ClauseBridgeStore; workspaceId: string };

/**
 * Wraps a workspace-scoped handler: requires a session, a same-origin header for writes, and a valid
 * workspace id. Membership itself is checked by the store on every query.
 */
export function workspaceRoute<P extends { ws: string }>(handler: (request: NextRequest, ctx: Ctx, params: P) => Promise<Response>, options: { write?: boolean } = {}) {
  return async (request: NextRequest, context: { params: Promise<P> }) => {
    if (options.write) { const denied = writeGuard(request); if (denied) return denied; }
    try {
      const auth = await requireUser(request);
      if (!auth.user) return auth.response;
      const params = await context.params;
      if (!/^[0-9a-f-]{36}$/i.test(params.ws)) return json({ error: 'Workspace not found' }, 404);
      return await handler(request, { user: auth.user, store: await getStore(), workspaceId: params.ws }, params);
    } catch (error) { return failure(error); }
  };
}

export const isId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);

/** The caller's "today" (their local date), falling back to the server's UTC date. */
export function requestToday(request: NextRequest) {
  const value = request.nextUrl.searchParams.get('today') ?? request.headers.get('x-clausebridge-today');
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const diff = Math.abs(Date.parse(`${value}T12:00:00Z`) - Date.now());
    if (diff < 36 * 60 * 60 * 1000) return value;
  }
  return new Date().toISOString().slice(0, 10);
}
