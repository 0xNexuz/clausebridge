/**
 * Contract term extraction with Ling 3.2 Flash, followed by ClauseBridge's own checks.
 *
 * The model proposes terms and must copy the exact contract words each one comes from. ClauseBridge then:
 * - drops any suggestion whose quote is not in the contract text (and records why),
 * - re-anchors each quote to the clause it was actually found in,
 * - reads dates and amounts from the quote with its own parsers; a date or amount the model gives that the
 *   quote does not state is not used,
 * - marks a suggestion "check carefully" whenever any of those checks needs a person's judgement.
 * Nothing becomes a tracked obligation until a workspace member confirms it.
 */
import { clauseAt, type Clause } from '../contract/clauses.ts';
import { addTiming, anchoredToStart, findAmounts, findDates, findQuote, findRecurrence, findRelativeTiming, formatDate,
  formatMoney, isValidIsoDate } from '../contract/terms.ts';
import type { Amount, Check, Due, Extraction, Kind, SuggestionKind } from '../types.ts';
import { chatCompletion, type AntLingConfig, type ChatMessage, type ChatResult } from './ant-ling.ts';
import type { NewSuggestion } from './store.ts';

const CHUNK_CHARS = 9_000;
const MAX_SUGGESTIONS = 80;
const KIND_WORDS: Record<string, Kind> = {
  deadline: 'deadline', deliverable: 'deliverable', delivery: 'deliverable', payment: 'payment', fee: 'payment',
  responsibility: 'responsibility', obligation: 'responsibility', duty: 'responsibility',
};

export const SYSTEM_PROMPT = [
  'You help a contract administrator list what a contract says each party must do, deliver or pay, and by when.',
  'You do not give legal advice, judge whether terms are fair or enforceable, or interpret the law.',
  'Reply with one JSON object and nothing else.',
].join(' ');

function clauseLines(text: string, clauses: Clause[]) {
  return clauses.map(clause => `[${clause.id}] ${clause.label}${clause.heading ? ` (${clause.heading})` : ''}: ${text.slice(clause.start, clause.end).replace(/\n/g, ' ')}`);
}

/** Groups clauses into chunks of about CHUNK_CHARS so long contracts fit the model comfortably. */
export function chunkClauses(text: string, clauses: Clause[]) {
  const lines = clauseLines(text, clauses);
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const line of lines) {
    const clipped = line.length > CHUNK_CHARS ? line.slice(0, CHUNK_CHARS) : line;
    if (size + clipped.length > CHUNK_CHARS && current.length) { chunks.push(current); current = []; size = 0; }
    current.push(clipped);
    size += clipped.length + 1;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function buildMessages(title: string, chunk: string[], part: number, parts: number): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `Contract: ${title.replace(/[{}[\]]/g, '').slice(0, 140)}${parts > 1 ? ` (part ${part} of ${parts})` : ''}`,
        'Clauses, each with an id in square brackets:',
        ...chunk,
        '',
        'List the terms in these clauses as JSON:',
        '{"parties":[{"name":"","role":"","clause":"c1","quote":""}],',
        ' "items":[{"kind":"","title":"","party":"","clause":"c1","quote":"","due":"","due_text":"","amount":"","confidence":"high","reason":""}]}',
        '',
        'Rules:',
        '- parties: each party to the contract, with the name exactly as the contract writes it and its role (for example Client, Supplier).',
        '- kind is one of: deliverable (something to produce or hand over), payment (money to pay), deadline (a dated or timed action that is not a deliverable or payment, such as giving notice), responsibility (an ongoing duty with no single date, such as keeping insurance).',
        '- title: a short plain description of what must happen, under 12 words, starting with a verb.',
        '- party: the party that must act, named as in the contract.',
        '- quote: copy the exact words from the clause that state the term, character for character, one sentence or less. Do not shorten, reword or join sentences.',
        '- due: a calendar date as YYYY-MM-DD only if the quote states that date; otherwise "".',
        '- due_text: the timing words from the quote (for example "within seven (7) days of the Effective Date"), or "".',
        '- amount: the amount of money exactly as written in the quote (for example "USD 4,500"), or "".',
        '- confidence: "high" when the clause clearly states the term, otherwise "low".',
        '- reason: under 15 words on why this is a term to track.',
        '- Skip definitions, governing law, boilerplate and anything that is not a duty, deliverable, payment or deadline.',
        '- Use only the clauses above. Never invent text.',
      ].join('\n'),
    },
  ];
}

/** Reads the first JSON object in a model reply (tolerates code fences and stray prose). */
export function parseModelJson(content: string): Record<string, unknown> | null {
  const cleaned = content.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

const str = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

type Context = { text: string; clauses: Clause[]; effectiveDate: string | null; model: string | null };
type Dropped = Extraction['dropped'][number];

/** Turns one raw model item into a checked suggestion, or a reason it was dropped. */
export function groundItem(raw: Record<string, unknown>, context: Context, kindOverride?: 'party'): NewSuggestion | Dropped {
  const quote = str(raw.quote, 600);
  const kindWord = str(raw.kind, 30).toLowerCase();
  const kind: SuggestionKind | undefined = kindOverride ?? KIND_WORDS[kindWord];
  if (!kind) return { reason: `Unknown term type “${kindWord || 'none'}”`, quote };
  const hinted = context.clauses.find(clause => clause.id === str(raw.clause, 12));
  const found = findQuote(context.text, quote, hinted?.start ?? 0, hinted?.end ?? context.text.length);
  if (!found) return { reason: 'The quoted words are not in the contract', quote };
  const clause = clauseAt(context.clauses, found.start) ?? context.clauses[0];
  const exact = context.text.slice(found.start, found.end);
  const checks: Check[] = [{ id: 'quote', ok: true, text: `Quote found word for word in ${clause.label}` }];

  if (kind === 'party') {
    const name = str(raw.name, 100);
    if (!name) return { reason: 'A party without a name', quote };
    const named = exact.toLowerCase().includes(name.toLowerCase());
    checks.push({ id: 'party', ok: named, text: named ? `“${name}” appears in the quote` : `“${name}” is not written in the quote; check the name` });
    return { kind, title: str(raw.role, 60) || 'Party', party: name, clauseId: clause.id, quote: exact, quoteStart: found.start, quoteEnd: found.end,
      due: emptyDue(), amount: emptyAmount(), confidence: named ? 'high' : 'low', reason: '', checks, model: context.model };
  }

  // ----- due date: only what the quote states -----
  const dates = findDates(exact);
  const modelDate = str(raw.due, 10);
  const due: Due = { ...emptyDue(), options: [...new Set(dates.map(date => date.iso))] };
  if (dates.length === 1) {
    due.date = dates[0].iso; due.source = 'contract'; due.text = dates[0].text; due.ambiguous = Boolean(dates[0].ambiguous);
  } else if (dates.length > 1) {
    const chosen = dates.filter(date => date.iso === modelDate);
    if (chosen.length) { due.date = modelDate; due.source = 'contract'; due.ambiguous = chosen.every(date => date.ambiguous); }
    due.text = dates.map(date => date.text).join(', ');
  }
  if (!dates.length) {
    due.relative = findRelativeTiming(exact);
    due.recurrence = findRecurrence(exact);
    due.text = due.relative?.text ?? due.recurrence ?? '';
    if (due.relative && context.effectiveDate && anchoredToStart(due.relative.anchor)) {
      due.date = addTiming(context.effectiveDate, due.relative);
      due.source = due.date ? 'computed' : null;
    }
  }
  const modelDueText = str(raw.due_text, 160);
  if (!due.text && modelDueText && exact.toLowerCase().includes(modelDueText.toLowerCase())) due.text = modelDueText;

  if (due.date && due.source === 'contract' && due.options.length > 1) {
    // Which of the clause's dates is the due date is a judgement: Ling's choice is shown, never trusted.
    checks.push({ id: 'date', ok: false, text: `The clause states ${due.options.length} dates; Ling chose ${formatDate(due.date)}. Check it is the due date${due.ambiguous ? ' and the day/month order' : ''}` });
  } else if (due.date && due.source === 'contract') {
    checks.push({ id: 'date', ok: !due.ambiguous, text: due.ambiguous
      ? `Due ${formatDate(due.date)}, read as day/month from “${due.text}”; check the order`
      : `Due ${formatDate(due.date)}, read from the clause` });
  } else if (due.date && due.source === 'computed' && due.relative) {
    checks.push({ id: 'date', ok: true, text: `Due ${formatDate(due.date)}: ${due.relative.amount} ${due.relative.unit.replace('_', ' ')}${due.relative.amount === 1 ? '' : 's'} ${due.relative.direction} the effective date (${formatDate(context.effectiveDate!)})` });
  } else if (dates.length > 1) {
    checks.push({ id: 'date', ok: false, text: `The clause states ${dates.length} dates; choose the due date` });
  } else if (due.relative) {
    checks.push({ id: 'date', ok: false, text: anchoredToStart(due.relative.anchor)
      ? `Timing is relative (“${due.relative.text}”). Set the contract’s effective date or enter the date.`
      : `Timing depends on an event (“${due.relative.text}”); enter the date when it is known` });
  } else if (due.recurrence) {
    checks.push({ id: 'date', ok: true, text: `Repeats (“${due.recurrence}”); set the next date when confirming` });
  } else if (kind !== 'responsibility') {
    checks.push({ id: 'date', ok: false, text: 'The clause states no date' });
  }
  if (isValidIsoDate(modelDate) && !due.options.includes(modelDate) && due.date !== modelDate) {
    checks.push({ id: 'model', ok: false, text: `Ling suggested ${formatDate(modelDate)}, which the clause does not state; not used` });
  }

  // ----- amount: only money the quote states -----
  const amounts = findAmounts(exact);
  const amount: Amount = { ...emptyAmount(), options: amounts.map(item => ({ cents: item.cents, currency: item.currency, text: item.text })) };
  const modelAmountText = str(raw.amount, 60);
  const modelAmount = modelAmountText ? findAmounts(modelAmountText)[0] : undefined;
  const pick = amounts.length === 1 ? amounts[0]
    : amounts.find(item => modelAmount && item.cents === modelAmount.cents && item.currency === modelAmount.currency);
  if (pick) { amount.cents = pick.cents; amount.currency = pick.currency; amount.text = pick.text; amount.source = 'contract'; }
  amount.percent = /\b\d{1,3}(?:\.\d{1,2})?\s?%/.exec(exact)?.[0] ?? null;
  const distinctAmounts = new Set(amounts.map(item => `${item.currency} ${item.cents}`)).size;
  if (pick && distinctAmounts > 1) checks.push({ id: 'amount', ok: false, text: `The clause states ${distinctAmounts} amounts; Ling chose ${formatMoney(pick.cents, pick.currency)}. Check it is the amount due` });
  else if (pick) checks.push({ id: 'amount', ok: true, text: `Amount ${formatMoney(pick.cents, pick.currency)}, read from the clause` });
  else if (amounts.length > 1) checks.push({ id: 'amount', ok: false, text: `The clause states ${amounts.length} amounts; choose the right one` });
  else if (kind === 'payment') checks.push({ id: 'amount', ok: false, text: amount.percent ? `The clause gives a percentage (${amount.percent}); enter the amount` : 'The clause states no amount; enter it from the contract' });
  if (modelAmount && !amounts.some(item => item.cents === modelAmount.cents && item.currency === modelAmount.currency)) {
    checks.push({ id: 'model', ok: false, text: `Ling suggested ${formatMoney(modelAmount.cents, modelAmount.currency)}, which the clause does not state; not used` });
  }

  if (str(raw.confidence, 10).toLowerCase() !== 'high') checks.push({ id: 'model', ok: false, text: 'Ling marked this term as uncertain' });
  const title = str(raw.title, 120) || exact.slice(0, 80);
  const confident = checks.every(check => check.ok);
  return { kind, title: title[0].toUpperCase() + title.slice(1), party: str(raw.party, 100), clauseId: clause.id, quote: exact,
    quoteStart: found.start, quoteEnd: found.end, due, amount, confidence: confident ? 'high' : 'low', reason: str(raw.reason, 160),
    checks, model: context.model };
}

export function emptyDue(): Due { return { date: null, text: '', source: null, options: [], relative: null, recurrence: null, ambiguous: false }; }
export function emptyAmount(): Amount { return { cents: null, currency: null, text: '', source: null, options: [], percent: null }; }

/** Grounds every item of one or more model replies, de-duplicating by type and quoted span. */
export function groundReplies(replies: Record<string, unknown>[], context: Context) {
  const suggestions: NewSuggestion[] = [];
  const dropped: Dropped[] = [];
  const seen = new Set<string>();
  const keep = (result: NewSuggestion | Dropped) => {
    if ('reason' in result && !('kind' in result)) { dropped.push(result); return; }
    const item = result as NewSuggestion;
    const key = item.kind === 'party' ? `party\u0000${item.party.toLowerCase()}` : `${item.kind}\u0000${item.quoteStart}\u0000${item.quoteEnd}`;
    if (seen.has(key) || suggestions.length >= MAX_SUGGESTIONS) return;
    seen.add(key);
    suggestions.push(item);
  };
  for (const reply of replies) {
    for (const party of Array.isArray(reply.parties) ? reply.parties : []) {
      if (party && typeof party === 'object') keep(groundItem(party as Record<string, unknown>, context, 'party'));
    }
    for (const item of Array.isArray(reply.items) ? reply.items : []) {
      if (item && typeof item === 'object') keep(groundItem(item as Record<string, unknown>, context));
    }
  }
  return { suggestions, dropped };
}

/** Runs the extraction over every chunk of the contract (sequentially, to respect Ant Ling's rate limit). */
export async function extractTerms(config: AntLingConfig, contract: { title: string; text: string; clauses: Clause[]; effectiveDate: string | null },
  options: { fetchImpl?: (input: string, init: RequestInit) => Promise<Response> } = {}) {
  const chunks = chunkClauses(contract.text, contract.clauses);
  const replies: Record<string, unknown>[] = [];
  const results: ChatResult[] = [];
  let unreadable = 0;
  for (let index = 0; index < chunks.length; index++) {
    const messages = buildMessages(contract.title, chunks[index], index + 1, chunks.length);
    let parsed: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const result = await chatCompletion(config, messages, { fetchImpl: options.fetchImpl, temperature: 0.1, maxTokens: 2600, timeoutMs: 55_000 });
      results.push(result);
      parsed = parseModelJson(result.content);
    }
    if (parsed) replies.push(parsed); else unreadable++;
  }
  const model = results.at(-1)?.model ?? config.model;
  const grounded = groundReplies(replies, { text: contract.text, clauses: contract.clauses, effectiveDate: contract.effectiveDate, model });
  const tokens = results.reduce((sum, result) => sum + (result.usage.totalTokens ?? 0), 0);
  return {
    ...grounded,
    unreadable,
    meta: { model, requestIds: results.map(result => result.requestId).filter((id): id is string => Boolean(id)), tokens: tokens || null, chunks: chunks.length },
  };
}
