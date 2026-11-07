'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorText } from '@/lib/api';
import type { Dashboard } from '@/lib/obligations';
import type { ContractSummary, Obligation, Workspace } from '@/lib/types';
import Auth from './Auth';
import PixelLoader from './art/PixelLoader';
import ContractReview from './ContractReview';
import Contracts from './Contracts';
import History from './History';
import ObligationDrawer from './ObligationDrawer';
import Overview from './Overview';
import Register from './Register';
import Reports from './Reports';
import Team from './Team';

export type View = 'overview' | 'contracts' | 'contract' | 'register' | 'reports' | 'team' | 'history';
export type Reminder = { obligation: Obligation; daysLeft: number };
export type WorkspaceData = { today: string; contracts: ContractSummary[]; obligations: Obligation[]; dashboard: Dashboard; reminders: Reminder[] };
export type Nav = (view: View, id?: string | null) => void;
export type AppContext = {
  user: { id: string; username: string };
  workspace: Workspace;
  data: WorkspaceData;
  ai: { connected: boolean; model: string | null };
  reload: () => Promise<void>;
  go: Nav;
  openObligation: (id: string) => void;
};

const WS_KEY = 'clausebridge:workspace';

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  return { w: params.get('w'), v: (params.get('v') as View | null) ?? 'overview', id: params.get('id'), ob: params.get('obligation') ?? params.get('ob') };
}

export default function App() {
  const [user, setUser] = useState<{ id: string; username: string } | null | undefined>(undefined);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [view, setView] = useState<{ name: View; id: string | null }>({ name: 'overview', id: null });
  const [obligationId, setObligationId] = useState<string | null>(null);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [ai, setAi] = useState({ connected: false, model: null as string | null });
  const [error, setError] = useState('');

  useEffect(() => {
    const url = readUrl();
    setView({ name: url.v, id: url.id });
    setObligationId(url.ob);
    api<{ user: { id: string; username: string } | null }>('/api/auth').then(r => setUser(r.user)).catch(() => setUser(null));
    api<{ connected: boolean; model: string | null }>('/api/ai/status').then(setAi).catch(() => {});
    const onPop = () => { const u = readUrl(); setView({ name: u.v, id: u.id }); setObligationId(u.ob); if (u.w) setWorkspaceId(u.w); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const loadWorkspaces = useCallback(async (prefer?: string) => {
    const result = await api<{ workspaces: Workspace[] }>('/api/workspaces');
    setWorkspaces(result.workspaces);
    let remembered: string | null = null;
    try { remembered = window.localStorage.getItem(WS_KEY); } catch { /* storage unavailable */ }
    const wanted = prefer ?? readUrl().w ?? remembered;
    const chosen = result.workspaces.find(w => w.id === wanted) ?? result.workspaces[0];
    setWorkspaceId(chosen?.id ?? null);
  }, []);

  useEffect(() => { if (user) loadWorkspaces().catch(e => setError(errorText(e))); }, [user, loadWorkspaces]);

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setData(await api<WorkspaceData>(`/api/w/${workspaceId}/overview`));
      setError('');
    } catch (e) { setError(errorText(e)); }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    setData(null);
    try { window.localStorage.setItem(WS_KEY, workspaceId); } catch { /* storage unavailable */ }
    void reload();
  }, [workspaceId, reload]);

  const pushUrl = useCallback((next: { v: View; id: string | null; ob: string | null }) => {
    const params = new URLSearchParams();
    if (workspaceId) params.set('w', workspaceId);
    if (next.v !== 'overview') params.set('v', next.v);
    if (next.id) params.set('id', next.id);
    if (next.ob) params.set('ob', next.ob);
    window.history.pushState(null, '', `/app${params.size ? `?${params}` : ''}`);
  }, [workspaceId]);

  const go: Nav = useCallback((name, id = null) => {
    setView({ name, id });
    setObligationId(null);
    pushUrl({ v: name, id, ob: null });
    window.scrollTo(0, 0);
  }, [pushUrl]);

  const openObligation = useCallback((id: string) => { setObligationId(id); pushUrl({ v: view.name, id: view.id, ob: id }); }, [pushUrl, view]);
  const closeObligation = useCallback(() => { setObligationId(null); pushUrl({ v: view.name, id: view.id, ob: null }); }, [pushUrl, view]);

  const workspace = workspaces.find(w => w.id === workspaceId) ?? null;
  const ctx: AppContext | null = useMemo(() => user && workspace && data ? { user, workspace, data, ai, reload, go, openObligation } : null,
    [user, workspace, data, ai, reload, go, openObligation]);

  if (user === undefined) return <div className="doc-loading" style={{ position: 'fixed', inset: 0 }}><PixelLoader label="Loading" /></div>;
  if (!user) return <Auth onSignedIn={setUser} />;

  const counts = data?.dashboard.counts;
  const navItems: { view: View; label: string; badge?: number; red?: boolean }[] = [
    { view: 'overview', label: 'Overview', badge: counts?.overdue || undefined, red: true },
    { view: 'contracts', label: 'Contracts', badge: counts?.pending || undefined },
    { view: 'register', label: 'Register & payments' },
    { view: 'reports', label: 'Reports' },
    { view: 'team', label: 'Team & reminders', badge: data?.reminders.length || undefined },
    { view: 'history', label: 'History' },
  ];
  const active = view.name === 'contract' ? 'contracts' : view.name;

  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href="/">ClauseBridge</a>
        <label className="field">Workspace
          <select className="ws-select" value={workspaceId ?? ''} onChange={e => { setWorkspaceId(e.target.value); go('overview'); }}>
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <nav className="nav" aria-label="Workspace">
          {navItems.map(item => (
            <button key={item.view} className={active === item.view ? 'on' : ''} onClick={() => go(item.view)}>
              {item.label}{item.badge ? <span className={`count ${item.red ? 'red' : ''}`}>{item.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <span>{ai.connected ? `Suggestions by ${ai.model ?? 'Ant Ling'}` : 'Ant Ling not connected'}</span>
          <span>Signed in as <b>{user.username}</b></span>
          <button className="btn small" onClick={async () => { await api('/api/auth', { json: { action: 'logout' } }); setUser(null); setData(null); }}>Sign out</button>
          <span className="legal">Contract administration support, not legal advice.</span>
        </div>
      </aside>
      <main className="main">
        {error && <p className="notice bad">{error}</p>}
        {!ctx ? <PixelLoader label="Loading the workspace" /> : (
          <div className="view-in" key={`${view.name}:${view.id ?? ''}`}>
            {view.name === 'overview' && <Overview ctx={ctx} />}
            {view.name === 'contracts' && <Contracts ctx={ctx} />}
            {view.name === 'contract' && view.id && <ContractReview key={view.id} ctx={ctx} contractId={view.id} />}
            {view.name === 'register' && <Register ctx={ctx} tab={view.id === 'payments' ? 'payments' : 'register'} />}
            {view.name === 'reports' && <Reports ctx={ctx} reportId={view.id} />}
            {view.name === 'team' && <Team ctx={ctx} onWorkspaces={loadWorkspaces} />}
            {view.name === 'history' && <History ctx={ctx} />}
          </div>
        )}
        {ctx && obligationId && <ObligationDrawer key={obligationId} ctx={ctx} obligationId={obligationId} onClose={closeObligation} />}
      </main>
    </div>
  );
}
