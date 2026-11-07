/**
 * Deterministic views over confirmed obligations: what is overdue, what is coming up, what money is
 * outstanding and what still needs a person's attention. All money is integer cents, per currency.
 */
import type { Obligation, Suggestion } from './types.ts';

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export function todayIso(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export const isOpen = (ob: Obligation) => ob.status !== 'done';
export const outstandingCents = (ob: Obligation) => ob.kind === 'payment' && ob.amountCents !== null ? ob.amountCents - ob.paidCents : 0;

export type CurrencyTotals = { currency: string; scheduledCents: number; paidCents: number; outstandingCents: number; overdueCents: number;
  payments: number; nextDue: { ref: string; dueDate: string; cents: number } | null };

/** Payment totals per currency, as of `today`. These are the figures the payment sheet's formulas must match. */
export function paymentTotals(obligations: Obligation[], today: string): CurrencyTotals[] {
  const byCurrency = new Map<string, CurrencyTotals>();
  for (const ob of obligations) {
    if (ob.kind !== 'payment' || ob.amountCents === null || !ob.currency) continue;
    const totals = byCurrency.get(ob.currency) ?? { currency: ob.currency, scheduledCents: 0, paidCents: 0, outstandingCents: 0,
      overdueCents: 0, payments: 0, nextDue: null };
    const outstanding = ob.amountCents - ob.paidCents;
    totals.payments++;
    totals.scheduledCents += ob.amountCents;
    totals.paidCents += ob.paidCents;
    totals.outstandingCents += outstanding;
    if (outstanding > 0 && ob.dueDate && ob.dueDate < today) totals.overdueCents += outstanding;
    if (outstanding > 0 && ob.dueDate && ob.dueDate >= today && (!totals.nextDue || ob.dueDate < totals.nextDue.dueDate)) {
      totals.nextDue = { ref: ob.ref, dueDate: ob.dueDate, cents: outstanding };
    }
    byCurrency.set(ob.currency, totals);
  }
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export type Attention = { id: string; kind: 'pending' | 'no_owner' | 'no_date' | 'blocked' | 'done_without_evidence' | 'ambiguous';
  label: string; obligationId?: string; contractId: string; count?: number };

export type Dashboard = {
  today: string;
  overdue: Obligation[];
  dueSoon: Obligation[];
  later: Obligation[];
  payments: CurrencyTotals[];
  attention: Attention[];
  counts: { total: number; done: number; open: number; overdue: number; dueSoon: number; blocked: number; pending: number };
};

/** The dashboard: overdue and upcoming work (next `soonDays` days), outstanding payments and unresolved items. */
export function buildDashboard(obligations: Obligation[], pendingByContract: { contractId: string; title: string; pending: number }[],
  today: string, soonDays = 30): Dashboard {
  const open = obligations.filter(isOpen);
  const dated = open.filter(ob => ob.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.ref.localeCompare(b.ref));
  const overdue = dated.filter(ob => ob.dueDate! < today);
  const dueSoon = dated.filter(ob => ob.dueDate! >= today && daysBetween(today, ob.dueDate!) <= soonDays);
  const later = dated.filter(ob => daysBetween(today, ob.dueDate!) > soonDays);
  const attention: Attention[] = [];
  for (const contract of pendingByContract) {
    if (contract.pending > 0) attention.push({ id: `pending:${contract.contractId}`, kind: 'pending', contractId: contract.contractId, count: contract.pending,
      label: `${contract.pending} suggested term${contract.pending === 1 ? '' : 's'} to review in “${contract.title}”` });
  }
  for (const ob of obligations) {
    const base = { obligationId: ob.id, contractId: ob.contractId };
    if (ob.status === 'blocked') attention.push({ id: `blocked:${ob.id}`, kind: 'blocked', ...base, label: `${ob.ref} is blocked: ${ob.title}` });
    if (isOpen(ob) && !ob.ownerId) attention.push({ id: `owner:${ob.id}`, kind: 'no_owner', ...base, label: `${ob.ref} has no owner: ${ob.title}` });
    if (isOpen(ob) && !ob.dueDate && ob.kind !== 'responsibility') attention.push({ id: `date:${ob.id}`, kind: 'no_date', ...base, label: `${ob.ref} has no due date: ${ob.title}` });
    if (ob.status === 'done' && ob.evidenceCount === 0 && ob.kind !== 'payment') attention.push({ id: `evidence:${ob.id}`, kind: 'done_without_evidence', ...base, label: `${ob.ref} is marked done without evidence: ${ob.title}` });
  }
  return {
    today, overdue, dueSoon, later, payments: paymentTotals(obligations, today), attention,
    counts: { total: obligations.length, done: obligations.length - open.length, open: open.length, overdue: overdue.length,
      dueSoon: dueSoon.length, blocked: open.filter(ob => ob.status === 'blocked').length,
      pending: pendingByContract.reduce((sum, contract) => sum + contract.pending, 0) },
  };
}

/** Reminders for one person: their open obligations (and unowned ones) that are overdue or due within `days`. */
export function remindersFor(obligations: Obligation[], userId: string, today: string, days = 7) {
  return obligations
    .filter(ob => isOpen(ob) && ob.dueDate && (ob.ownerId === userId || ob.ownerId === null) && daysBetween(today, ob.dueDate) <= days)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .map(ob => ({ obligation: ob, daysLeft: daysBetween(today, ob.dueDate!) }));
}

export function pendingSuggestions(suggestions: Suggestion[]) {
  return suggestions.filter(item => item.status === 'pending');
}

export function dueLabel(dueDate: string | null, today: string) {
  if (!dueDate) return 'No date';
  const days = daysBetween(today, dueDate);
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}
