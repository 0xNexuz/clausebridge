'use client';

import { useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import type { AuditEntry } from '@/lib/types';
import type { AppContext } from './App';
import { lowerFirst, when } from './Bits';

export default function History({ ctx }: { ctx: AppContext }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ entries: AuditEntry[] }>(`/api/w/${ctx.workspace.id}/audit`).then(r => setEntries(r.entries)).catch(e => setError(errorText(e)));
  }, [ctx.workspace.id, ctx.data]);
  return (
    <>
      <div className="page-head"><div><h1>History</h1><p>Every upload, AI suggestion run, confirmation, rejection, status change, payment, evidence file and report approval in {ctx.workspace.name}. Entries can’t be edited or deleted.</p></div></div>
      {error && <p className="notice bad">{error}</p>}
      <section className="card">
        {!entries ? <p className="hint">Loading…</p> : (
          <ul className="history">{entries.map(entry => (
            <li key={entry.id}>
              <time>{when(entry.createdAt)}</time>
              <span>
                <b>{entry.actor}</b> {lowerFirst(entry.summary)}
                {entry.targetType === 'obligation' && <> · <button className="btn small quiet" onClick={() => ctx.openObligation(entry.targetId)}>Open</button></>}
                {entry.targetType === 'contract' && entry.contractId && <> · <button className="btn small quiet" onClick={() => ctx.go('contract', entry.contractId!)}>Open</button></>}
                {entry.targetType === 'report' && <> · <button className="btn small quiet" onClick={() => ctx.go('reports', entry.targetId)}>Open</button></>}
              </span>
            </li>
          ))}</ul>
        )}
      </section>
    </>
  );
}
