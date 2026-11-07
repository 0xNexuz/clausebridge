'use client';
// Browser helper for ClauseBridge's API: same-origin header, the viewer's local date, readable errors.

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) { super(message); this.status = status; this.data = data; }
}

export function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function api<T>(path: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-clausebridge-request': '1', 'x-clausebridge-today': localToday() };
  let body: BodyInit | undefined;
  if (init.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(init.json); }
  if (init.form) body = init.form;
  const response = await fetch(path, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, cache: 'no-store' });
  let data: unknown = null;
  try { data = await response.json(); } catch { /* empty or non-JSON body */ }
  if (!response.ok) {
    const message = (data as { error?: unknown } | null)?.error;
    throw new ApiError(typeof message === 'string' ? message : `Request failed (${response.status})`, response.status, data);
  }
  return data as T;
}

export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong';
