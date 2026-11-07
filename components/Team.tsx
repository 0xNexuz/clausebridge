'use client';

import { useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { formatDate } from '@/lib/contract/terms';
import type { AppContext } from './App';
import { localDay, ObligationRow } from './Bits';

export default function Team({ ctx, onWorkspaces }: { ctx: AppContext; onWorkspaces: (prefer?: string) => Promise<void> }) {
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [calendar, setCalendar] = useState<{ hasFeed: boolean; url?: string }>({ hasFeed: false });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api<{ hasFeed: boolean }>('/api/calendar').then(setCalendar).catch(() => {}); }, []);

  const act = async (fn: () => Promise<void>) => { setError(''); setMessage(''); try { await fn(); } catch (e) { setError(errorText(e)); } };
  const mine = ctx.data.reminders;

  return (
    <>
      <div className="page-head"><div><h1>Team and reminders</h1><p>Everyone in {ctx.workspace.name} sees the same contracts, suggestions and obligations. Reminders cover work assigned to you and work with no owner.</p></div></div>
      {error && <p className="notice bad" role="alert">{error}</p>}
      {message && <p className="notice">{message}</p>}
      <div className="grid-3" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
        <section className="card">
          <h2>Your reminders</h2>
          <p className="hint" style={{ marginTop: 0 }}>Overdue, or due in the next 7 days.</p>
          <div className="ob-list">{mine.length ? mine.map(r => <ObligationRow key={r.obligation.id} ob={r.obligation} today={ctx.data.today} onOpen={ctx.openObligation} />) : <p className="hint">Nothing needs you this week.</p>}</div>
          <h2 style={{ marginTop: 18 }}>Calendar reminders</h2>
          <p className="hint" style={{ marginTop: 0 }}>Subscribe to a private calendar link in Google Calendar, Apple Calendar or Outlook. Each due date appears as an all-day event with an alert the day before. It covers your obligations and unowned ones across your workspaces.</p>
          {calendar.url ? (
            <>
              <input className="input" aria-label="Private calendar link" readOnly value={calendar.url} onFocus={e => e.target.select()} style={{ width: '100%' }} />
              <p className="hint">Copy it now; it is shown only once. Anyone with the link can see the due dates, so keep it private.</p>
            </>
          ) : (
            <button className="btn" onClick={() => act(async () => {
              const result = await api<{ url: string }>('/api/calendar', { method: 'POST', json: {} });
              setCalendar({ hasFeed: true, url: result.url });
            })}>{calendar.hasFeed ? 'Create a new calendar link (replaces the old one)' : 'Create my calendar link'}</button>
          )}
        </section>
        <section className="card">
          <h2>Members</h2>
          <ul className="attention">{ctx.workspace.members.map(m => <li key={m.userId} style={{ fontSize: 14 }}>{m.username}{m.userId === ctx.user.id ? ' (you)' : ''} · {m.role}</li>)}</ul>
          <h2 style={{ marginTop: 16 }}>Invite a teammate</h2>
          {invite ? (
            <p className="notice">Invite code <b style={{ letterSpacing: '.08em' }}>{invite.code}</b>, valid until {formatDate(localDay(invite.expiresAt))}. They enter it under “Join a workspace”.</p>
          ) : <button className="btn" onClick={() => act(async () => setInvite(await api(`/api/workspaces`, { json: { action: 'invite', workspaceId: ctx.workspace.id } })))}>Create an invite code</button>}
          <h2 style={{ marginTop: 16 }}>Join a workspace</h2>
          <div className="row">
            <input className="input" aria-label="Invite code" placeholder="8-character code" value={code} onChange={e => setCode(e.target.value)} maxLength={8} style={{ width: 150, textTransform: 'uppercase' }} />
            <button className="btn" disabled={code.trim().length !== 8} onClick={() => act(async () => {
              const result = await api<{ workspaceId: string }>('/api/workspaces', { json: { action: 'join', code } });
              setCode(''); await onWorkspaces(result.workspaceId); setMessage('Joined. The workspace is selected.');
            })}>Join</button>
          </div>
          <h2 style={{ marginTop: 16 }}>New workspace</h2>
          <div className="row">
            <input className="input" aria-label="New workspace name" placeholder="Name" value={name} onChange={e => setName(e.target.value)} maxLength={60} />
            <button className="btn" disabled={!name.trim()} onClick={() => act(async () => {
              const result = await api<{ workspaceId: string }>('/api/workspaces', { json: { action: 'create', name } });
              setName(''); await onWorkspaces(result.workspaceId);
            })}>Create</button>
          </div>
        </section>
      </div>
    </>
  );
}
