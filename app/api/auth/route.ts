import { NextResponse, type NextRequest } from 'next/server';
import { hashPassword, hashToken, newSession, SESSION_COOKIE, sessionUser, validPassword, validUsername, verifyPassword } from '@/lib/server/auth';
import { body, failure, json, writeGuard } from '@/lib/server/http';
import { getStore, StoreError } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return json({ user: await sessionUser(request) });
}

export async function POST(request: NextRequest) {
  const denied = writeGuard(request);
  if (denied) return denied;
  try {
    const data = await body(request);
    const action = data.action;
    if (action === 'logout') {
      const token = request.cookies.get(SESSION_COOKIE)?.value;
      if (token) await (await getStore()).deleteSession(hashToken(token));
      const response = json({ user: null });
      response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: 0 });
      return response;
    }
    if (!validUsername(data.username) || !validPassword(data.password)) {
      throw new StoreError('invalid', 'Use a 3–32 character username and a 12–128 character password');
    }
    const username = data.username;
    const password = data.password;
    let user: { id: string; username: string };
    if (action === 'register') {
      const credentials = await hashPassword(password);
      user = await (await getStore()).createUser(username, credentials.salt, credentials.hash);
    } else if (action === 'login') {
      const store = await getStore();
      await store.assertLoginAllowed(username);
      const existing = await store.findUser(username);
      const matches = existing ? await verifyPassword(password, existing.password_salt, existing.password_hash) :
        await verifyPassword(password, '00000000000000000000000000000000', '00'.repeat(64));
      if (!existing || !matches) {
        await store.recordLoginFailure(username);
        return json({ error: 'Invalid username or password' }, 401);
      }
      await store.recordLoginSuccess(username);
      user = { id: existing.id, username: existing.username };
    } else throw new StoreError('invalid', 'Unknown authentication action');
    const { token, expiresAt } = await newSession(user.id);
    const response = NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict',
      secure: request.nextUrl.protocol === 'https:', path: '/', expires: expiresAt });
    return response;
  } catch (error) { return failure(error); }
}
