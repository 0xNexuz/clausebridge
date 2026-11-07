import type { NextRequest } from 'next/server';
import { obligationsCalendar } from '@/lib/ics';
import { getStore } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The private calendar feed. Anyone with the link can read it, so it holds only due dates, titles and clause quotes. */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const clean = token.replace(/\.ics$/, '');
  if (!/^[A-Za-z0-9_-]{32}$/.test(clean)) return new Response('Not found', { status: 404 });
  const obligations = await (await getStore()).calendarObligations(clean);
  if (!obligations) return new Response('Not found', { status: 404 });
  return new Response(obligationsCalendar(obligations, request.nextUrl.origin), { headers: {
    'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="clausebridge.ics"', 'Cache-Control': 'private, max-age=900',
  } });
}
