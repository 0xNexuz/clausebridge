'use client';
// Small shared pieces: due-date pill, status pill, obligation row, money.

import { formatDate, formatMoney } from '@/lib/contract/terms';
import { daysBetween, dueLabel } from '@/lib/obligations';
import { KIND_LABEL, STATUS_LABEL, type Obligation, type Status } from '@/lib/types';

export function DuePill({ date, today, done }: { date: string | null; today: string; done?: boolean }) {
  if (done) return <span className="due">{date ? formatDate(date) : 'No date'}</span>;
  const days = date ? daysBetween(today, date) : null;
  const tone = days === null ? '' : days < 0 ? 'over' : days <= 7 ? 'soon' : '';
  return <span className={`due ${tone}`} title={date ? formatDate(date) : undefined}>{days !== null && Math.abs(days) > 30 ? formatDate(date!) : dueLabel(date, today)}</span>;
}

export function StatusPill({ status }: { status: Status }) {
  return <span className={`status ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function money(cents: number | null, currency: string | null) {
  return cents === null || !currency ? '—' : formatMoney(cents, currency);
}

export function ObligationRow({ ob, today, onOpen }: { ob: Obligation; today: string; onOpen: (id: string) => void }) {
  const amount = ob.kind === 'payment' && ob.amountCents !== null ? ` · ${money(ob.amountCents - ob.paidCents, ob.currency)} outstanding` : '';
  return (
    <button className="ob" data-kind={ob.kind} onClick={() => onOpen(ob.id)}>
      <span className="ref">{ob.ref}</span>
      <span>
        <span className="ob-title">{ob.title}</span>
        <span className="ob-sub" style={{ display: 'block' }}>
          {ob.status !== 'open' && <><StatusPill status={ob.status} />{' '}</>}
          <span className="kind-dot" aria-hidden />{KIND_LABEL[ob.kind]} · {ob.contractTitle}, {ob.clauseLabel} · {ob.ownerName ?? 'No owner'}{amount}
        </span>
      </span>
      <DuePill date={ob.dueDate} today={today} done={ob.status === 'done'} />
    </button>
  );
}

export function when(iso: string) {
  const d = new Date(iso);
  return `${formatDate(iso.slice(0, 10))}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Audit summaries read after the actor's name: "amara confirmed OB-001 …". */
export function lowerFirst(text: string) {
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}
