import type { NextRequest } from 'next/server';
import { failure, json, requireUser, writeGuard } from '@/lib/server/http';
import { getStore } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return auth.response;
    return json({ hasFeed: await (await getStore()).hasCalendarFeed(auth.user.id) });
  } catch (error) { return failure(error); }
}

/** Creates (or replaces) the caller's private calendar link. The link is shown once; replacing it revokes the old one. */
export async function POST(request: NextRequest) {
  const denied = writeGuard(request);
  if (denied) return denied;
  try {
    const auth = await requireUser(request);
    if (!auth.user) return auth.response;
    const token = await (await getStore()).createCalendarFeed(auth.user.id);
    return json({ url: `${request.nextUrl.origin}/api/calendar/${token}.ics` });
  } catch (error) { return failure(error); }
}
