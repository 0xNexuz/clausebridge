// Shapes shared by the server routes and the browser.
import type { Clause } from './contract/clauses.ts';
import type { RelativeTiming } from './contract/terms.ts';

export type Kind = 'deadline' | 'deliverable' | 'payment' | 'responsibility';
export type SuggestionKind = Kind | 'party';
export type Status = 'open' | 'in_progress' | 'blocked' | 'done';
export type Source = 'contract' | 'computed' | 'person' | null;

export const KINDS: Kind[] = ['deliverable', 'payment', 'deadline', 'responsibility'];
export const STATUSES: Status[] = ['open', 'in_progress', 'blocked', 'done'];
export const KIND_LABEL: Record<SuggestionKind, string> = {
  deliverable: 'Deliverable', payment: 'Payment', deadline: 'Deadline', responsibility: 'Responsibility', party: 'Party',
};
export const STATUS_LABEL: Record<Status, string> = { open: 'Not started', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' };

export type Due = {
  date: string | null;
  text: string;
  source: Source;
  /** Other dates written in the quote, when it states more than one. */
  options: string[];
  relative: RelativeTiming | null;
  recurrence: string | null;
  ambiguous: boolean;
};

export type Amount = {
  cents: number | null;
  currency: string | null;
  text: string;
  source: Source;
  options: { cents: number; currency: string; text: string }[];
  percent: string | null;
};

export type Check = { id: 'quote' | 'date' | 'amount' | 'party' | 'model'; ok: boolean; text: string };

export type Suggestion = {
  id: string;
  contractId: string;
  kind: SuggestionKind;
  title: string;
  party: string;
  clauseId: string;
  quote: string;
  quoteStart: number;
  quoteEnd: number;
  due: Due;
  amount: Amount;
  confidence: 'high' | 'low';
  reason: string;
  checks: Check[];
  status: 'pending' | 'confirmed' | 'rejected';
  model: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  obligationId: string | null;
};

export type Party = { name: string; role: string; clauseId: string; quote: string };

export type Obligation = {
  id: string;
  ref: string;
  contractId: string;
  contractTitle: string;
  kind: Kind;
  title: string;
  party: string;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  dueText: string;
  dueSource: Source;
  amountCents: number | null;
  currency: string | null;
  amountSource: Source;
  paidCents: number;
  paidDate: string | null;
  status: Status;
  clauseId: string;
  clauseLabel: string;
  quote: string;
  quoteStart: number;
  quoteEnd: number;
  evidenceCount: number;
  version: number;
  updatedAt: string;
};

export type Evidence = {
  id: string;
  kind: 'file' | 'link' | 'note';
  label: string;
  url: string | null;
  note: string | null;
  fileName: string | null;
  fileMime: string | null;
  fileSize: number | null;
  addedBy: string;
  createdAt: string;
};

export type Extraction = {
  model: string | null;
  requestIds: string[];
  ranAt: string;
  suggested: number;
  dropped: { reason: string; quote: string }[];
  tokens: number | null;
  ranBy: string;
};

export type ContractSummary = {
  id: string;
  title: string;
  fileName: string;
  fileKind: string;
  effectiveDate: string | null;
  createdAt: string;
  uploadedBy: string;
  parties: Party[];
  pending: number;
  obligations: number;
  done: number;
  extracted: boolean;
};

export type ContractDetail = ContractSummary & {
  text: string;
  clauses: Clause[];
  suggestions: Suggestion[];
  extraction: Extraction | null;
};

export type Member = { userId: string; username: string; role: 'owner' | 'member' };
export type Workspace = { id: string; name: string; role: 'owner' | 'member'; members: Member[] };

export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  contractId: string | null;
  summary: string;
  detail: unknown;
  createdAt: string;
};
