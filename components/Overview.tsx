'use client';

import { formatDate } from '@/lib/contract/terms';
import type { AppContext } from './App';
import { money, ObligationRow } from './Bits';

export default function Overview({ ctx }: { ctx: AppContext }) {
  const { dashboard: d, contracts, today } = ctx.data;
  if (!contracts.length) {
    return (
      <>
        <div className="page-head"><div><h1>Overview</h1><p>Deadlines, payments and open items across {ctx.workspace.name}.</p></div></div>
        <div className="empty">
          <p style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>Start with a contract</p>
          <p>Upload a PDF or Word contract, or try one of the sample contracts, then confirm the terms ClauseBridge finds.</p>
          <button className="btn primary" onClick={() => ctx.go('contracts')}>Add a contract</button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="page-head">
        <div><h1>Overview</h1><p>{ctx.workspace.name} on {formatDate(today)}. Only confirmed obligations are tracked here.</p></div>
        <button className="btn" onClick={() => ctx.go('reports')}>Prepare a progress report</button>
      </div>
      <div className="stat-row">
        <div className={`stat ${d.counts.overdue ? 'red' : ''}`}><b>{d.counts.overdue}</b><span>overdue</span></div>
        <div className="stat"><b>{d.counts.dueSoon}</b><span>due in 30 days</span></div>
        <div className="stat"><b>{d.counts.open}</b><span>open obligation{d.counts.open === 1 ? '' : 's'}</span></div>
        <div className="stat"><b>{d.counts.done}</b><span>done</span></div>
        <div className="stat"><b>{d.counts.pending}</b><span>suggestion{d.counts.pending === 1 ? '' : 's'} to review</span></div>
      </div>
      <div className="grid-3">
        <section className="card">
          <h2>Overdue</h2>
          <div className="ob-list">
            {d.overdue.length ? d.overdue.map(ob => <ObligationRow key={ob.id} ob={ob} today={today} onOpen={ctx.openObligation} />) : <p className="hint">Nothing is overdue.</p>}
          </div>
          <h2 style={{ marginTop: 18 }}>Due in the next 30 days</h2>
          <div className="ob-list">
            {d.dueSoon.length ? d.dueSoon.map(ob => <ObligationRow key={ob.id} ob={ob} today={today} onOpen={ctx.openObligation} />) : <p className="hint">Nothing falls due in the next 30 days.</p>}
          </div>
          {d.later.length > 0 && <p className="hint" style={{ marginTop: 12 }}>{d.later.length} more due later. <button className="btn small quiet" onClick={() => ctx.go('register')}>See the register</button></p>}
        </section>
        <section className="card">
          <h2>Outstanding payments</h2>
          {d.payments.length ? (
            <table className="money-table">
              <thead><tr><th>Currency</th><th className="num">Outstanding</th><th className="num">Overdue</th></tr></thead>
              <tbody>{d.payments.map(t => (
                <tr key={t.currency}><td>{t.currency}<div className="hint">{t.payments} payment{t.payments === 1 ? '' : 's'}, {money(t.paidCents, t.currency)} paid</div></td>
                  <td className="num">{money(t.outstandingCents, t.currency)}</td>
                  <td className="num" style={{ color: t.overdueCents ? 'var(--red)' : undefined }}>{money(t.overdueCents, t.currency)}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="hint">No confirmed payments yet.</p>}
          {d.payments.some(t => t.nextDue) && (
            <p className="hint" style={{ marginTop: 10 }}>Next: {d.payments.filter(t => t.nextDue).map(t => `${t.nextDue!.ref} ${money(t.nextDue!.cents, t.currency)} on ${formatDate(t.nextDue!.dueDate)}`).join('; ')}</p>
          )}
          <button className="btn small" style={{ marginTop: 10 }} onClick={() => ctx.go('register', 'payments')}>Open the payment schedule</button>
        </section>
        <section className="card">
          <h2>Needs attention</h2>
          {d.attention.length ? (
            <ul className="attention">{d.attention.slice(0, 14).map(item => (
              <li key={item.id}><button onClick={() => item.obligationId ? ctx.openObligation(item.obligationId) : ctx.go('contract', item.contractId)}>{item.label}</button></li>
            ))}</ul>
          ) : <p className="hint">Everything has an owner, a date and evidence where needed.</p>}
          {d.attention.length > 14 && <p className="hint">and {d.attention.length - 14} more</p>}
        </section>
      </div>
    </>
  );
}
