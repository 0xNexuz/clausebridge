'use client';

import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/contract/terms';
import { KIND_LABEL, KINDS, type Kind, type Suggestion } from '@/lib/types';
import type { AppContext } from './App';

const CURRENCIES = ['USD', 'NGN', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR', 'CAD', 'AUD', 'INR'];

export default function SuggestionCard({ ctx, suggestion: s, clauseLabel, focused, onShow, onDecided }: {
  ctx: AppContext; suggestion: Suggestion; clauseLabel: string; focused: boolean; onShow: () => void; onDecided: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState(s.title);
  const [kind, setKind] = useState<Kind>(s.kind === 'party' ? 'deliverable' : s.kind);
  const [party, setParty] = useState(s.party);
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState(s.due.date ?? '');
  const [amount, setAmount] = useState(s.amount.cents !== null ? (s.amount.cents / 100).toFixed(2) : '');
  const [currency, setCurrency] = useState(s.amount.currency ?? s.amount.options[0]?.currency ?? 'USD');
  const isParty = s.kind === 'party';
  const needsInput = !isParty && ((s.kind === 'payment' && s.amount.cents === null) || (!s.due.date && s.kind !== 'responsibility'));

  const decide = async (action: 'confirm' | 'reject') => {
    setBusy(true); setError('');
    try {
      const edits: Record<string, unknown> = {};
      if (action === 'confirm') {
        if (owner) edits.ownerId = owner;
        if (editing || needsInput) {
          if (isParty) { edits.party = party; edits.title = title; }
          else {
            Object.assign(edits, { title, kind, party, dueDate: due || null });
            if (kind === 'payment' || amount) Object.assign(edits, { amount: amount || null, currency });
          }
        }
      }
      await api(`/api/w/${ctx.workspace.id}/suggestions/${s.id}`, { json: { action, edits } });
      await onDecided();
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };

  return (
    <article className={`sug ${focused ? 'focus' : ''}`} data-kind={s.kind}>
      <div className="sug-top">
        <span className={`kind ${s.confidence === 'low' ? 'low' : ''}`}>{KIND_LABEL[s.kind]}</span>
        <span className="clause-link"><button onClick={onShow}>{clauseLabel}</button></span>
      </div>
      <h4>{isParty ? `${s.party}${s.title ? ` (${s.title})` : ''}` : s.title}</h4>
      <button className="quote" onClick={onShow} title="Show in the contract">{s.quote}</button>
      {!isParty && (
        <dl className="facts">
          {s.party && <><dt>Who</dt><dd>{s.party}</dd></>}
          <dt>When</dt><dd>{s.due.date ? `${formatDate(s.due.date)}${s.due.source === 'computed' ? ' (worked out)' : ''}` : s.due.text || 'No date in the clause'}</dd>
          {(s.amount.cents !== null || s.kind === 'payment') && <><dt>Amount</dt><dd>{s.amount.cents !== null && s.amount.currency ? formatMoney(s.amount.cents, s.amount.currency) : 'Not stated'}</dd></>}
        </dl>
      )}
      <ul className="checks">{s.checks.filter(c => c.id !== 'quote' || !c.ok).map((c, i) => <li key={i} className={c.ok ? '' : 'no'}>{c.text}</li>)}</ul>
      {s.reason && <p className="hint" style={{ margin: 0 }}>Why: {s.reason}</p>}
      {(editing || needsInput) && (
        <div className="edit-grid">
          {isParty ? (
            <>
              <label className="field">Name<input value={party} onChange={e => setParty(e.target.value)} /></label>
              <label className="field">Role<input value={title} onChange={e => setTitle(e.target.value)} /></label>
            </>
          ) : (
            <>
              <label className="field wide">Obligation<input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} /></label>
              <label className="field">Type<select value={kind} onChange={e => setKind(e.target.value as Kind)}>{KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
              <label className="field">Responsible party<input value={party} onChange={e => setParty(e.target.value)} /></label>
              <label className="field">Due date
                <input type="date" value={due} onChange={e => setDue(e.target.value)} />
                {s.due.options.length > 1 && <span className="hint">In the clause: {s.due.options.map(formatDate).join(', ')}</span>}
              </label>
              {(kind === 'payment' || amount) && (
                <label className="field">Amount
                  <span className="row" style={{ flexWrap: 'nowrap' }}>
                    <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ width: 76 }} className="input">{[...new Set([currency, ...CURRENCIES])].map(c => <option key={c}>{c}</option>)}</select>
                    <input className="input" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="4,500.00" style={{ flex: 1 }} />
                  </span>
                </label>
              )}
              {s.amount.options.length > 1 && <span className="hint wide">Amounts in the clause: {s.amount.options.map(o => formatMoney(o.cents, o.currency)).join(', ')}</span>}
            </>
          )}
          {(editing || needsInput) && !isParty && <span className="hint wide">Changed values are recorded as set by you, not by the contract.</span>}
        </div>
      )}
      {!isParty && (
        <label className="field">Owner
          <select value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">No owner yet</option>
            {ctx.workspace.members.map(m => <option key={m.userId} value={m.userId}>{m.username}{m.userId === ctx.user.id ? ' (you)' : ''}</option>)}
          </select>
        </label>
      )}
      {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="row">
        <button className="btn primary small" disabled={busy} onClick={() => decide('confirm')}>{isParty ? 'Confirm party' : 'Confirm and track'}</button>
        {!editing && !needsInput && <button className="btn small" disabled={busy} onClick={() => setEditing(true)}>Edit</button>}
        <button className="btn small danger" disabled={busy} onClick={() => decide('reject')}>Reject</button>
      </div>
    </article>
  );
}
