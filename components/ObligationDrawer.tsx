'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/contract/terms';
import { KIND_LABEL, STATUS_LABEL, STATUSES, type AuditEntry, type Evidence, type Obligation, type Status } from '@/lib/types';
import type { AppContext } from './App';
import { DuePill, lowerFirst, StatusPill, when } from './Bits';

type Detail = { obligation: Obligation; evidence: Evidence[]; history: AuditEntry[] };
const SOURCE: Record<string, string> = { contract: 'from the contract', computed: 'worked out from the effective date', person: 'set by a person' };

export default function ObligationDrawer({ ctx, obligationId, onClose }: { ctx: AppContext; obligationId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [evidenceKind, setEvidenceKind] = useState<'file' | 'link' | 'note'>('file');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [paid, setPaid] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const base = `/api/w/${ctx.workspace.id}/obligations/${obligationId}`;

  const load = useCallback(async () => {
    try {
      const next = await api<Detail>(base);
      setDetail(next);
      setPaid((next.obligation.paidCents / 100).toFixed(2));
    } catch (e) { setError(errorText(e)); }
  }, [base]);
  useEffect(() => { void load(); }, [load]);
  // A modal dialog takes focus when it opens and gives it back when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = async (patch: Record<string, unknown>) => {
    if (!detail) return;
    setBusy(true); setError('');
    try {
      await api(base, { method: 'PATCH', json: { version: detail.obligation.version, ...patch } });
      await Promise.all([load(), ctx.reload()]);
    } catch (e) { setError(errorText(e)); await load(); } finally { setBusy(false); }
  };

  const addEvidence = async (file?: File) => {
    setBusy(true); setError('');
    try {
      if (evidenceKind === 'file') {
        if (!file) return;
        const form = new FormData();
        form.set('file', file);
        form.set('label', label);
        await api(`${base}/evidence`, { form });
      } else {
        await api(`${base}/evidence`, { json: { kind: evidenceKind, label, url, note } });
      }
      setLabel(''); setUrl(''); setNote('');
      await Promise.all([load(), ctx.reload()]);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const ob = detail?.obligation;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Obligation" ref={panel} tabIndex={-1}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="ref">{ob?.ref ?? 'Obligation'}</span>
          <button className="btn small quiet" onClick={onClose} aria-label="Close">Close</button>
        </div>
        {error && <p className="notice bad" role="alert">{error}</p>}
        {!ob ? <p className="hint">Loading…</p> : (
          <>
            <div>
              <h2>{ob.title}</h2>
              <p className="hint" style={{ margin: '4px 0 0' }}>{KIND_LABEL[ob.kind]} for {ob.party || 'a party'} · {ob.contractTitle}</p>
              <div className="row" style={{ marginTop: 8 }}><StatusPill status={ob.status} /><DuePill date={ob.dueDate} today={ctx.data.today} done={ob.status === 'done'} /></div>
            </div>
            <section className="card">
              <h2>What the contract says</h2>
              <p className="quote confirmed" style={{ margin: 0, display: 'inline' }}>{ob.quote}</p>
              <p className="clause-link" style={{ marginBottom: 0 }}>{ob.clauseLabel} · <button onClick={() => { onClose(); ctx.go('contract', ob.contractId); }}>Open the contract</button></p>
              <dl className="facts" style={{ marginTop: 10 }}>
                <dt>Due</dt><dd>{ob.dueDate ? `${formatDate(ob.dueDate)}${ob.dueSource ? ` (${SOURCE[ob.dueSource]})` : ''}` : ob.dueText || 'No date set'}</dd>
                {ob.kind === 'payment' && ob.amountCents !== null && ob.currency && <><dt>Amount</dt><dd>{formatMoney(ob.amountCents, ob.currency)}{ob.amountSource ? ` (${SOURCE[ob.amountSource]})` : ''}</dd></>}
              </dl>
            </section>
            <section className="card">
              <h2>Track it</h2>
              <div className="edit-grid">
                <label className="field">Status
                  <select value={ob.status} disabled={busy} onChange={e => update({ status: e.target.value as Status })}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </label>
                <label className="field">Owner
                  <select value={ob.ownerId ?? ''} disabled={busy} onChange={e => update({ ownerId: e.target.value || null })}>
                    <option value="">No owner</option>
                    {ctx.workspace.members.map(m => <option key={m.userId} value={m.userId}>{m.username}</option>)}
                  </select>
                </label>
                <label className="field">Due date
                  <input type="date" value={ob.dueDate ?? ''} disabled={busy} onChange={e => update({ dueDate: e.target.value || null })} />
                </label>
                {ob.kind === 'payment' && ob.currency && (
                  <label className="field">Paid ({ob.currency})
                    <span className="row" style={{ flexWrap: 'nowrap' }}>
                      <input className="input" value={paid} onChange={e => setPaid(e.target.value)} inputMode="decimal" style={{ flex: 1 }} />
                      <button className="btn small" disabled={busy} onClick={() => update({ paid })}>Save</button>
                    </span>
                  </label>
                )}
              </div>
              {ob.kind === 'payment' && ob.amountCents !== null && ob.currency && (
                <p className="hint" style={{ marginBottom: 0 }}>{formatMoney(ob.amountCents - ob.paidCents, ob.currency)} outstanding{ob.paidDate ? `; last paid ${formatDate(ob.paidDate)}` : ''}. Fully paid payments are marked done automatically.</p>
              )}
            </section>
            <section className="card">
              <h2>Evidence ({detail!.evidence.length})</h2>
              {detail!.evidence.length > 0 && (
                <ul className="evidence">{detail!.evidence.map(item => (
                  <li key={item.id}>
                    <b>{item.label}</b>{' '}
                    {item.kind === 'file' && <a href={`/api/w/${ctx.workspace.id}/evidence/${item.id}`}>{item.fileName} ({Math.ceil((item.fileSize ?? 0) / 1024)} KB)</a>}
                    {item.kind === 'link' && item.url && <a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a>}
                    {item.kind === 'note' && <span style={{ whiteSpace: 'pre-wrap' }}>{item.note}</span>}
                    <div className="hint">Added by {item.addedBy}, {when(item.createdAt)}</div>
                  </li>
                ))}</ul>
              )}
              <div className="tabs" style={{ marginTop: 8 }}>
                {(['file', 'link', 'note'] as const).map(k => <button key={k} className={evidenceKind === k ? 'on' : ''} onClick={() => setEvidenceKind(k)}>{k === 'file' ? 'Upload a file' : k === 'link' ? 'Add a link' : 'Write a note'}</button>)}
              </div>
              <div className="edit-grid" style={{ marginTop: 8 }}>
                <label className="field wide">Label<input value={label} onChange={e => setLabel(e.target.value)} placeholder={evidenceKind === 'file' ? 'Bank receipt, signed delivery note…' : evidenceKind === 'link' ? 'Shared folder, ticket…' : 'Note'} maxLength={120} /></label>
                {evidenceKind === 'link' && <label className="field wide">Link<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" /></label>}
                {evidenceKind === 'note' && <label className="field wide">Note<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} /></label>}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {evidenceKind === 'file' ? (
                  <>
                    <button className="btn small" disabled={busy} onClick={() => fileInput.current?.click()}>Choose a file (up to 3 MB)</button>
                    <input ref={fileInput} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.docx,.xlsx,.pptx,.zip,.eml"
                      onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void addEvidence(file); }} />
                  </>
                ) : <button className="btn small" disabled={busy} onClick={() => addEvidence()}>Add {evidenceKind}</button>}
              </div>
            </section>
            <section className="card">
              <h2>History</h2>
              <ul className="history">{detail!.history.map(entry => (
                <li key={entry.id}><time>{when(entry.createdAt)}</time><span><b>{entry.actor}</b> {lowerFirst(entry.summary)}</span></li>
              ))}</ul>
            </section>
          </>
        )}
      </aside>
    </>
  );
}
