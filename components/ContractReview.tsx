'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { formatDate } from '@/lib/contract/terms';
import type { ContractDetail, Suggestion } from '@/lib/types';
import type { ContractView, Mark } from '@/lib/univer-docs';
import type { AppContext } from './App';
import { ObligationRow } from './Bits';
import SuggestionCard from './SuggestionCard';
import PixelLoader from './art/PixelLoader';

type Tab = 'pending' | 'tracked' | 'rejected';

export default function ContractReview({ ctx, contractId }: { ctx: AppContext; contractId: string }) {
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState<Tab>('pending');
  const [focus, setFocus] = useState<string | null>(null);
  const [docReady, setDocReady] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<ContractView | null>(null);
  const base = `/api/w/${ctx.workspace.id}/contracts/${contractId}`;

  const load = useCallback(async () => {
    try { setContract((await api<{ contract: ContractDetail }>(base)).contract); }
    catch (e) { setError(errorText(e)); }
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  const obligations = useMemo(() => ctx.data.obligations.filter(ob => ob.contractId === contractId), [ctx.data.obligations, contractId]);
  const marks: Mark[] = useMemo(() => {
    if (!contract) return [];
    const list: Mark[] = contract.suggestions.filter(s => s.status === 'pending').map(s => ({ start: s.quoteStart, end: s.quoteEnd, tone: 'pending' }));
    for (const ob of obligations) list.push({ start: ob.quoteStart, end: ob.quoteEnd, tone: 'confirmed' });
    return list;
  }, [contract, obligations]);

  // Mount Univer Docs once per contract; later changes only re-mark the quotes.
  const textKey = contract ? `${contract.id}:${contract.text.length}` : '';
  useEffect(() => {
    if (!contract || !host.current) return;
    let disposed = false;
    const container = document.createElement('div');
    container.style.height = '100%';
    host.current.appendChild(container);
    import('@/lib/univer-docs').then(mod => {
      if (disposed) return;
      view.current = mod.mountContract(container, contract.text, contract.clauses, marks);
      setDocReady(true);
    }).catch(e => setError(`Univer Docs could not load: ${errorText(e)}`));
    return () => { disposed = true; const v = view.current; view.current = null; setDocReady(false); setTimeout(() => { v?.dispose(); container.remove(); }, 0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textKey]);

  const marksKey = marks.map(m => `${m.start}-${m.end}-${m.tone}`).join(',');
  const firstMarks = useRef(true);
  useEffect(() => {
    if (!docReady) return;
    if (firstMarks.current) { firstMarks.current = false; return; }
    view.current?.setMarks(marks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksKey, docReady]);

  const show = (id: string, start: number, end: number) => { setFocus(id); view.current?.select(start, end); };

  const suggest = async () => {
    setBusy(`Asking ${ctx.ai.model ?? 'Ling'} for the contract’s terms… this takes a few seconds.`); setError('');
    try {
      const result = await api<{ added: number; dropped: number; contract: ContractDetail; tokens: number | null; model: string }>(`${base}/extract`, { method: 'POST', json: {} });
      setContract(result.contract);
      setTab('pending');
      setBusy('');
      setError('');
      await ctx.reload();
    } catch (e) { setBusy(''); setError(errorText(e)); }
  };

  const setEffective = async (value: string) => {
    try {
      setContract((await api<{ contract: ContractDetail }>(base, { method: 'PATCH', json: { effectiveDate: value || null } })).contract);
      await ctx.reload();
    } catch (e) { setError(errorText(e)); }
  };

  const decided = async () => { await Promise.all([load(), ctx.reload()]); };

  if (!contract) return error ? <p className="notice bad">{error}</p> : <PixelLoader label="Opening the contract" />;
  const pending = contract.suggestions.filter(s => s.status === 'pending');
  const rejected = contract.suggestions.filter(s => s.status === 'rejected');
  const parties = pending.filter(s => s.kind === 'party');
  const terms = pending.filter(s => s.kind !== 'party');
  const clauseLabel = (id: string) => contract.clauses.find(c => c.id === id)?.label ?? 'Clause';
  const extraction = contract.extraction;

  return (
    <>
      <div className="page-head">
        <div>
          <button className="btn small quiet" onClick={() => ctx.go('contracts')}>← Contracts</button>
          <h1 style={{ marginTop: 4 }}>{contract.title}</h1>
          <p>{contract.parties.length ? contract.parties.map(p => `${p.name}${p.role ? ` (${p.role})` : ''}`).join(' · ') : 'Parties are confirmed from the suggestions.'}</p>
        </div>
        <div className="row">
          <label className="field" title="Used to work out dates written as “within N days of the Effective Date”">Effective date
            <input type="date" value={contract.effectiveDate ?? ''} onChange={e => setEffective(e.target.value)} />
          </label>
          <a className="btn" href={`${base}/file`}>Original file</a>
          <button className="btn primary" onClick={suggest} disabled={Boolean(busy) || !ctx.ai.connected}
            title={ctx.ai.connected ? undefined : 'Ant Ling is not connected on this server'}>
            {extraction ? 'Suggest again' : `Suggest terms with ${ctx.ai.model?.replace('Ling-3.2-flash', 'Ling 3.2 Flash') ?? 'Ling'}`}
          </button>
        </div>
      </div>
      {busy && <p className="notice">{busy}</p>}
      {error && <p className="notice bad" role="alert">{error}</p>}
      <div className="review">
        <div className="doc-frame">
          <div className="doc-host" ref={host} />
          {!docReady && <div className="doc-loading"><PixelLoader label="Opening the contract in Univer Docs" /></div>}
        </div>
        <aside className="rail" aria-label="Suggested terms">
          <div className="rail-head">
            <div className="tabs" role="tablist">
              <button role="tab" className={tab === 'pending' ? 'on' : ''} onClick={() => setTab('pending')}>To review ({pending.length})</button>
              <button role="tab" className={tab === 'tracked' ? 'on' : ''} onClick={() => setTab('tracked')}>Tracked ({obligations.length})</button>
              <button role="tab" className={tab === 'rejected' ? 'on' : ''} onClick={() => setTab('rejected')}>Rejected ({rejected.length})</button>
            </div>
            {tab === 'pending' && extraction && (
              <p className="hint" style={{ margin: 0 }}>
                {extraction.model ?? 'Ling'} suggested {extraction.suggested} terms on {formatDate(extraction.ranAt.slice(0, 10))}.
                {extraction.dropped.length > 0 && ` ${extraction.dropped.length} were dropped because their quoted words were not in the contract.`}
                {' '}Highlighted text in the contract is waiting for review; green is tracked.
              </p>
            )}
          </div>
          {tab === 'pending' && !extraction && (
            <div className="empty">
              <p><b>No suggestions yet.</b></p>
              <p>{ctx.ai.connected ? 'Ask Ling 3.2 Flash to list the deadlines, deliverables, parties and payment terms. You confirm each one before it is tracked.' : 'Ant Ling is not connected on this server, so terms can’t be suggested here.'}</p>
            </div>
          )}
          {tab === 'pending' && extraction && !pending.length && <div className="empty">Everything suggested has been reviewed.</div>}
          {tab === 'pending' && [...parties, ...terms].map((s: Suggestion) => (
            <SuggestionCard key={s.id} ctx={ctx} suggestion={s} clauseLabel={clauseLabel(s.clauseId)} focused={focus === s.id}
              onShow={() => show(s.id, s.quoteStart, s.quoteEnd)} onDecided={decided} />
          ))}
          {tab === 'tracked' && (obligations.length ? (
            <div className="ob-list">
              {obligations.map(ob => (
                <div key={ob.id} className="sug" data-kind={ob.kind}>
                  <ObligationRow ob={ob} today={ctx.data.today} onOpen={ctx.openObligation} />
                  <button className="quote confirmed" onClick={() => show(ob.id, ob.quoteStart, ob.quoteEnd)}>{ob.quote}</button>
                  <span className="clause-link">{ob.clauseLabel} · <button onClick={() => show(ob.id, ob.quoteStart, ob.quoteEnd)}>Show in contract</button></span>
                </div>
              ))}
            </div>
          ) : <div className="empty">No confirmed obligations from this contract yet.</div>)}
          {tab === 'rejected' && (rejected.length ? rejected.map(s => (
            <div key={s.id} className="sug" data-kind={s.kind}>
              <div className="sug-top"><span className="kind">{s.kind}</span><span className="decided">Rejected</span></div>
              <h4>{s.title}</h4>
              <button className="quote" onClick={() => show(s.id, s.quoteStart, s.quoteEnd)}>{s.quote}</button>
            </div>
          )) : <div className="empty">Nothing rejected.</div>)}
        </aside>
      </div>
    </>
  );
}
