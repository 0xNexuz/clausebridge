'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { formatDate } from '@/lib/contract/terms';
import type { ReportCheck, ReportDraftContent } from '@/lib/report';
import type { ReportView } from '@/lib/univer-docs';
import type { AppContext } from './App';
import { when } from './Bits';
import PixelLoader from './art/PixelLoader';

type ReportSummary = { id: string; title: string; contractId: string | null; asOf: string; status: string; approvedAt: string | null; approvedBy: string | null; createdAt: string; author: string };
type Report = { id: string; title: string; contractId: string | null; asOf: string; draft: ReportDraftContent & { fallbackReason?: string | null; attempts?: number };
  status: 'draft' | 'approved'; approvedText: string | null; approvedAt: string | null; approvedBy: string | null; model: string | null };
type Stale = { token: string; label: string; was: string; now: string }[];

export default function Reports({ ctx, reportId }: { ctx: AppContext; reportId: string | null }) {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [scope, setScope] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const base = `/api/w/${ctx.workspace.id}/reports`;
  const load = useCallback(async () => {
    try { setReports((await api<{ reports: ReportSummary[] }>(base)).reports); } catch (e) { setError(errorText(e)); }
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  const draft = async () => {
    setBusy(ctx.ai.connected ? 'Drafting: ClauseBridge gathers the facts and Ling 3.2 Flash writes the summary…' : 'Drafting the report…'); setError('');
    try {
      const result = await api<{ id: string }>(base, { json: { contractId: scope || null } });
      await load();
      ctx.go('reports', result.id);
    } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };

  if (reportId) return <ReportDetail ctx={ctx} reportId={reportId} onChanged={load} />;
  const titles = new Map(ctx.data.contracts.map(c => [c.id, c.title]));
  return (
    <>
      <div className="page-head">
        <div><h1>Progress reports</h1><p>Management reports built from confirmed obligations. Every figure, date and clause reference is filled in by ClauseBridge and checked before approval.</p></div>
      </div>
      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Prepare a report</h2>
        <div className="row">
          <select className="input" aria-label="Contracts to report on" value={scope} onChange={e => setScope(e.target.value)}>
            <option value="">All contracts in {ctx.workspace.name}</option>
            {ctx.data.contracts.filter(c => c.obligations > 0).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <button className="btn primary" disabled={Boolean(busy) || !ctx.data.obligations.length} onClick={draft}>Draft report</button>
          {!ctx.data.obligations.length && <span className="hint">Confirm some obligations first.</span>}
        </div>
        {busy && <p className="notice" style={{ marginTop: 10 }}>{busy}</p>}
        {error && <p className="notice bad" style={{ marginTop: 10 }}>{error}</p>}
      </section>
      <div className="contracts">
        {reports.length === 0 && <div className="empty">No reports yet.</div>}
        {reports.map(r => (
          <button key={r.id} className="contract-row" onClick={() => ctx.go('reports', r.id)}>
            <div>
              <h3>{r.title}</h3>
              <p>{r.contractId ? titles.get(r.contractId) ?? 'One contract' : 'All contracts'} · as of {formatDate(r.asOf)} · drafted by {r.author}</p>
            </div>
            <span className={`status ${r.status === 'approved' ? 'done' : ''}`}>{r.status === 'approved' ? `Approved by ${r.approvedBy}` : 'Draft'}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function ReportDetail({ ctx, reportId, onChanged }: { ctx: AppContext; reportId: string; onChanged: () => Promise<void> }) {
  const [report, setReport] = useState<Report | null>(null);
  const [stale, setStale] = useState<Stale>([]);
  const [check, setCheck] = useState<ReportCheck | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<ReportView | null>(null);
  const url = `/api/w/${ctx.workspace.id}/reports/${reportId}`;

  const load = useCallback(async () => {
    try {
      const result = await api<{ report: Report; stale: Stale }>(url);
      setReport(result.report); setStale(result.stale);
    } catch (e) { setError(errorText(e)); }
  }, [url]);
  useEffect(() => { void load(); }, [load]);

  const draftKey = report ? `${report.id}:${report.status}` : '';
  useEffect(() => {
    if (!report || !host.current) return;
    let disposed = false;
    const container = document.createElement('div');
    container.style.height = '100%';
    host.current.appendChild(container);
    const blocks = report.status === 'approved' && report.approvedText
      ? report.approvedText.split('\n').map((line, i) => ({ kind: i === 0 ? 'title' as const : 'paragraph' as const, segments: [{ type: 'text' as const, text: line }] }))
      : report.draft.blocks;
    import('@/lib/univer-docs').then(mod => {
      if (disposed) return;
      view.current = mod.mountReport(container, blocks);
      setReady(true);
    }).catch(e => setError(`Univer Docs could not load: ${errorText(e)}`));
    return () => { disposed = true; const v = view.current; view.current = null; setReady(false); setTimeout(() => { v?.dispose(); container.remove(); }, 0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const run = async (action: 'check' | 'approve') => {
    const text = view.current?.readText();
    if (!text) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ check: ReportCheck }>(url, { json: { action, text } });
      setCheck(result.check);
      if (action === 'approve') { await load(); await onChanged(); }
    } catch (e) {
      const data = (e as { data?: { check?: ReportCheck } }).data;
      if (data?.check) setCheck(data.check);
      setError(errorText(e));
    } finally { setBusy(false); }
  };

  if (!report) return error ? <p className="notice bad">{error}</p> : <p className="hint">Opening the report…</p>;
  const sources = report.draft.blocks.flatMap(b => b.segments).filter(s => s.type === 'fact' && s.token.endsWith(':clause'));
  return (
    <>
      <div className="page-head">
        <div>
          <button className="btn small quiet" onClick={() => ctx.go('reports')}>← Reports</button>
          <h1 style={{ marginTop: 4 }}>{report.title}</h1>
          <p>As of {formatDate(report.asOf)}. {report.status === 'approved' ? `Approved by ${report.approvedBy}, ${when(report.approvedAt!)}.` : 'Edit the wording in Univer Docs, then check the figures and approve.'}</p>
        </div>
        {report.status === 'draft' && (
          <div className="row">
            <button className="btn" disabled={busy || !ready} onClick={() => run('check')}>Check figures</button>
            <button className="btn primary" disabled={busy || !ready} onClick={() => run('approve')}>Approve report</button>
          </div>
        )}
      </div>
      {error && <p className="notice bad" role="alert">{error}</p>}
      <div className="report-layout">
        <div className="doc-frame" style={{ height: 'calc(100vh - 170px)' }}>
          <div className="doc-host" ref={host} />
          {!ready && <div className="doc-loading"><PixelLoader label="Opening the report in Univer Docs" /></div>}
        </div>
        <aside className="rail">
          <section className="card">
            <h2>Where the words came from</h2>
            <p className="hint" style={{ marginTop: 0 }}>
              {report.draft.summarySource === 'ling' ? `The summary was written by ${report.model ?? 'Ling 3.2 Flash'} using fact tokens only. ` : `${report.draft.fallbackReason ?? 'ClauseBridge wrote the summary.'} `}
              Everything else, and every tinted figure, was filled in by ClauseBridge from confirmed obligations.
            </p>
          </section>
          {stale.length > 0 && (
            <section className="card">
              <h2>Changed since approval</h2>
              <ul className="check-list">{stale.map(item => <li key={item.token}>{item.label}: was <b>{item.was}</b>, now <b>{item.now}</b></li>)}</ul>
              <p className="hint">Draft a new report to reflect the changes.</p>
            </section>
          )}
          {report.status === 'approved' && !stale.length && <p className="notice">Approved. Nothing in it has changed since.</p>}
          {check && (
            <section className="card">
              <h2>{check.ok ? 'Figures check out' : 'Figures need attention'}</h2>
              <p className="hint" style={{ marginTop: 0 }}>{check.verified} figure{check.verified === 1 ? '' : 's'} match current records.</p>
              {(check.changed.length > 0 || check.missing.length > 0 || check.unverified.length > 0 || check.moved.length > 0) && (
                <ul className="check-list">
                  {check.changed.map(c => <li key={c.token}>{c.label} was <b>{c.was}</b>, now <b>{c.now}</b></li>)}
                  {check.missing.map(c => <li key={c.token}><b>{c.was}</b> is no longer tracked</li>)}
                  {check.unverified.map(u => <li key={u.value}><b>{u.value}</b> isn’t a ClauseBridge figure: “{u.context}”</li>)}
                  {check.moved.map((m, i) => <li key={`moved-${i}`}><b>{m.value}</b> isn’t where ClauseBridge put it, or the words beside it changed: “{m.context}”</li>)}
                </ul>
              )}
            </section>
          )}
          {sources.length > 0 && (
            <section className="card">
              <h2>Linked clauses</h2>
              <ul className="attention">{[...new Map(sources.map(s => [s.type === 'fact' ? s.obligationId : '', s])).values()].map(s => s.type === 'fact' && (
                <li key={s.token}><button onClick={() => s.obligationId && ctx.openObligation(s.obligationId)}>{s.text}</button></li>
              ))}</ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
