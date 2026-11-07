/**
 * Progress reports linked to the contract text.
 *
 * ClauseBridge writes every figure, date, status and clause reference from confirmed obligations as a
 * "fact". Ling 3.2 Flash only writes the summary wording, and must cite facts as {{tokens}}; a draft with
 * any number of its own is rejected. Before approval the edited report is checked against current data.
 */
import { formatDate, formatMoney } from './contract/terms.ts';
import { buildDashboard, outstandingCents, paymentTotals } from './obligations.ts';
import { KIND_LABEL, STATUS_LABEL, type Obligation } from './types.ts';

export type Fact = { token: string; label: string; text: string; obligationId: string | null; contractId: string | null; clauseId: string | null };
export type Segment = { type: 'text'; text: string } | { type: 'fact'; token: string; text: string; obligationId: string | null; contractId: string | null; clauseId: string | null };
export type Block = { kind: 'title' | 'heading' | 'paragraph' | 'item' | 'note'; segments: Segment[] };
export type ReportDraftContent = { title: string; asOf: string; blocks: Block[]; model: string | null; requestId: string | null; summarySource: 'ling' | 'clausebridge' };

const TOKEN = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;
const NUMBER_WORDS = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|billion|half|double|twice|percent|dozen)\b/i;

/** Every fact a report may cite, keyed by token (without braces). */
export function factSheet(obligations: Obligation[], today: string, contractTitles: Map<string, string>): Map<string, Fact> {
  const facts = new Map<string, Fact>();
  const add = (token: string, label: string, text: string, ob?: Obligation) => facts.set(token, { token, label, text,
    obligationId: ob?.id ?? null, contractId: ob?.contractId ?? null, clauseId: ob?.clauseId ?? null });
  const dash = buildDashboard(obligations, [], today);
  add('date:as_of', 'Report date', formatDate(today));
  add('count:total', 'Confirmed obligations', String(dash.counts.total));
  add('count:done', 'Obligations done', String(dash.counts.done));
  add('count:open', 'Obligations not done', String(dash.counts.open));
  add('count:overdue', 'Obligations overdue', String(dash.counts.overdue));
  add('count:due_soon', 'Obligations due in the next 30 days', String(dash.counts.dueSoon));
  add('count:blocked', 'Obligations blocked', String(dash.counts.blocked));
  add('count:contracts', 'Contracts covered', String(new Set(obligations.map(ob => ob.contractId)).size || contractTitles.size));
  for (const totals of paymentTotals(obligations, today)) {
    const c = totals.currency.toLowerCase();
    add(`money:${c}:scheduled`, `${totals.currency} scheduled in payments`, formatMoney(totals.scheduledCents, totals.currency));
    add(`money:${c}:paid`, `${totals.currency} paid`, formatMoney(totals.paidCents, totals.currency));
    add(`money:${c}:outstanding`, `${totals.currency} outstanding`, formatMoney(totals.outstandingCents, totals.currency));
    add(`money:${c}:overdue`, `${totals.currency} overdue`, formatMoney(totals.overdueCents, totals.currency));
  }
  for (const ob of obligations) {
    const r = ob.ref.toLowerCase();
    add(`ob:${r}`, `${ob.ref} reference`, ob.ref, ob);
    add(`ob:${r}:title`, `${ob.ref} description`, ob.title, ob);
    add(`ob:${r}:status`, `${ob.ref} status`, STATUS_LABEL[ob.status], ob);
    add(`ob:${r}:due`, `${ob.ref} due date`, ob.dueDate ? formatDate(ob.dueDate) : 'no date set', ob);
    add(`ob:${r}:clause`, `${ob.ref} source clause`, `${ob.clauseLabel} of ${contractTitles.get(ob.contractId) ?? ob.contractTitle}`, ob);
    if (ob.kind === 'payment' && ob.amountCents !== null && ob.currency) {
      add(`ob:${r}:amount`, `${ob.ref} amount`, formatMoney(ob.amountCents, ob.currency), ob);
      add(`ob:${r}:outstanding`, `${ob.ref} outstanding`, formatMoney(outstandingCents(ob), ob.currency), ob);
    }
  }
  return facts;
}

function fact(facts: Map<string, Fact>, token: string): Segment {
  const item = facts.get(token);
  if (!item) throw new Error(`Unknown fact ${token}`);
  return { type: 'fact', token, text: item.text, obligationId: item.obligationId, contractId: item.contractId, clauseId: item.clauseId };
}
const text = (value: string): Segment => ({ type: 'text', text: value });

/** One line per obligation: "OB-003 Pay the deposit — Clause 3.2 of …: due 10 Nov 2026, Not started, owner amara." */
function obligationLine(facts: Map<string, Fact>, ob: Obligation, extra: Segment[] = []): Block {
  const r = ob.ref.toLowerCase();
  const segments: Segment[] = [fact(facts, `ob:${r}`), text(' '), fact(facts, `ob:${r}:title`), text(' ('), fact(facts, `ob:${r}:clause`),
    text('): due '), fact(facts, `ob:${r}:due`), text(', '), fact(facts, `ob:${r}:status`)];
  if (ob.kind === 'payment' && facts.has(`ob:${r}:outstanding`)) segments.push(text(', '), fact(facts, `ob:${r}:outstanding`), text(' outstanding'));
  segments.push(text(ob.ownerName ? `, owner ${ob.ownerName}.` : ', no owner yet.'), ...extra);
  return { kind: 'item', segments };
}

/** The deterministic body of the report. `summary` is inserted after the title (from Ling or ClauseBridge). */
export function buildReportBlocks(title: string, obligations: Obligation[], today: string, facts: Map<string, Fact>, summary: Segment[][]): Block[] {
  const dash = buildDashboard(obligations, [], today);
  const blocks: Block[] = [
    { kind: 'title', segments: [text(title)] },
    { kind: 'note', segments: [text('As of '), fact(facts, 'date:as_of'), text('. Prepared with ClauseBridge from confirmed obligations; every figure, date and clause reference comes from the contract records.')] },
    { kind: 'heading', segments: [text('Summary')] },
    ...summary.map(segments => ({ kind: 'paragraph' as const, segments })),
  ];
  const section = (heading: string, items: Obligation[], empty: string) => {
    blocks.push({ kind: 'heading', segments: [text(heading)] });
    if (!items.length) blocks.push({ kind: 'paragraph', segments: [text(empty)] });
    for (const ob of items) blocks.push(obligationLine(facts, ob));
  };
  section('Overdue', dash.overdue, 'Nothing is overdue.');
  section('Due in the next 30 days', dash.dueSoon, 'Nothing else falls due in the next 30 days.');
  const totals = paymentTotals(obligations, today);
  blocks.push({ kind: 'heading', segments: [text('Payments')] });
  if (!totals.length) blocks.push({ kind: 'paragraph', segments: [text('No confirmed payments.')] });
  for (const t of totals) {
    const c = t.currency.toLowerCase();
    blocks.push({ kind: 'item', segments: [fact(facts, `money:${c}:scheduled`), text(' scheduled, '), fact(facts, `money:${c}:paid`), text(' paid, '),
      fact(facts, `money:${c}:outstanding`), text(' outstanding, of which '), fact(facts, `money:${c}:overdue`), text(' is overdue.')] });
  }
  const done = obligations.filter(ob => ob.status === 'done');
  section('Completed', done, 'Nothing has been marked done yet.');
  const noOwner = obligations.filter(ob => ob.status !== 'done' && !ob.ownerId);
  const blocked = obligations.filter(ob => ob.status === 'blocked');
  if (noOwner.length || blocked.length) {
    blocks.push({ kind: 'heading', segments: [text('Needs attention')] });
    for (const ob of blocked) blocks.push(obligationLine(facts, ob));
    for (const ob of noOwner.filter(item => item.status !== 'blocked')) blocks.push(obligationLine(facts, ob));
  }
  blocks.push({ kind: 'note', segments: [text(`${KIND_LABEL.payment} figures are re-checked to the cent. Clause references point to the exact contract text. ClauseBridge supports contract administration and is not legal advice.`)] });
  return blocks;
}

/** A plain summary written by ClauseBridge itself (used when Ant Ling is not connected). */
export function plainSummary(facts: Map<string, Fact>): Segment[][] {
  const paragraph: Segment[] = [text('Of '), fact(facts, 'count:total'), text(' confirmed obligations, '), fact(facts, 'count:done'),
    text(' are done and '), fact(facts, 'count:open'), text(' are still open. '), fact(facts, 'count:overdue'),
    text(' are overdue and '), fact(facts, 'count:due_soon'), text(' fall due in the next 30 days.')];
  return [paragraph];
}

export type Validation = { ok: true; paragraphs: Segment[][]; used: string[] } | { ok: false; reason: string };

/** Accepts a model summary only if every figure is a known token and it writes no numbers of its own. */
export function validateSummary(raw: string, facts: Map<string, Fact>, allowedNames: string[]): Validation {
  const body = raw.replace(/\r\n?/g, '\n').trim();
  if (!body) return { ok: false, reason: 'The summary was empty.' };
  if (body.length > 1400) return { ok: false, reason: 'The summary was longer than 1400 characters.' };
  if (/[*#`|]|^\s*[-•]\s/m.test(body)) return { ok: false, reason: 'The summary used markdown, headings or lists.' };
  const unknown = [...body.matchAll(TOKEN)].map(match => match[1]).filter(token => !facts.has(token));
  if (unknown.length) return { ok: false, reason: `It used tokens that are not in the list: ${[...new Set(unknown)].slice(0, 4).join(', ')}.` };
  let outside = body.replace(TOKEN, ' ');
  for (const name of [...allowedNames].filter(Boolean).sort((a, b) => b.length - a.length)) {
    outside = outside.split(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join(' ');
  }
  if (/[{}]/.test(outside)) return { ok: false, reason: 'It contained a malformed token.' };
  if (/\d/.test(outside)) return { ok: false, reason: 'It wrote a number, date or reference directly instead of using a token.' };
  if (/[%$€£₦¥]/.test(outside)) return { ok: false, reason: 'It wrote a currency or percentage symbol instead of using a token.' };
  const word = outside.match(NUMBER_WORDS);
  if (word) return { ok: false, reason: `It spelled out a number (“${word[0]}”) instead of using a token.` };
  const blocks = body.split(/\n\s*\n+/).map(block => block.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  if (blocks.length > 3) return { ok: false, reason: 'It had more than three paragraphs.' };
  const used = new Set<string>();
  const paragraphs = blocks.map(block => {
    const segments: Segment[] = [];
    let cursor = 0;
    for (const match of block.matchAll(TOKEN)) {
      if (match.index! > cursor) segments.push(text(block.slice(cursor, match.index)));
      used.add(match[1]);
      segments.push(fact(facts, match[1]));
      cursor = match.index! + match[0].length;
    }
    if (cursor < block.length) segments.push(text(block.slice(cursor)));
    return segments;
  });
  if (!used.size) return { ok: false, reason: 'It did not cite any fact.' };
  return { ok: true, paragraphs, used: [...used] };
}

/**
 * Names that may contain digits but are not figures: the workspace, contract titles, parties, members and
 * obligation owners. A name with no letters is left out, so it can never hide a typed number.
 */
export function reportNames(input: { workspaceName?: string | null; contracts: { title: string; parties: { name: string }[] }[];
  members?: { username: string }[]; obligations?: Obligation[] }): string[] {
  const names = [input.workspaceName ?? '', ...input.contracts.map(item => item.title), ...input.contracts.flatMap(item => item.parties.map(p => p.name)),
    ...(input.members ?? []).map(m => m.username), ...(input.obligations ?? []).map(ob => ob.ownerName ?? '')];
  return [...new Set(names.map(name => name.trim()).filter(name => /\p{L}/u.test(name)))];
}

export function blockText(block: Block) {
  return block.segments.map(segment => segment.text).join('');
}

export function draftFacts(blocks: Block[]) {
  const refs: { token: string; text: string }[] = [];
  for (const block of blocks) for (const segment of block.segments) if (segment.type === 'fact') refs.push({ token: segment.token, text: segment.text });
  return refs;
}

// ---------- checking an edited report ----------

export type ReportCheck = {
  ok: boolean;
  verified: number;
  changed: { token: string; label: string; was: string; now: string }[];
  missing: { token: string; was: string }[];
  unverified: { value: string; context: string }[];
  /** ClauseBridge figures that are no longer where ClauseBridge put them, or whose neighbouring words changed. */
  moved: { value: string; context: string }[];
};

function escape(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function whole(value: string, flags = 'g') {
  // Not inside a longer word or number: "2" must not match the start of "2,500.00".
  return new RegExp(`(?<![\\p{L}\\p{N}.]|\\p{N},)${escape(value)}(?![\\p{L}\\p{N}]|[.,]\\p{N})`, `${flags}u`);
}
function contextAround(source: string, index: number, length: number) {
  const start = Math.max(0, index - 40);
  const end = Math.min(source.length, index + length + 40);
  return `${start > 0 ? '…' : ''}${source.slice(start, end).replace(/\s+/g, ' ').trim()}${end < source.length ? '…' : ''}`;
}

/** The report text as the editor shows it: one line per block (see mountReport in lib/univer-docs.ts). */
export function draftText(blocks: Block[]) {
  return blocks.map(block => block.segments.map(segment => segment.text.replace(/[\r\n]+/g, ' ').replace(/[\x00-\x08\x0B-\x1F\x7F]/g, ' ')).join('')).join('\n');
}

// Words that carry no meaning next to a figure, so "1 are done" may be corrected to "1 is done".
const LINK_WORDS = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had']);
const STATUS_TEXTS = Object.values(STATUS_LABEL);

/**
 * Every figure in `text`, keyed by its value and the nearest word or figure on each side within its line.
 * Names (which may contain digits) count as words, never as figures.
 */
function figuresIn(text: string, figures: string[], names: string[]) {
  const candidates = [...figures.map(value => ({ value, figure: true, pattern: whole(value) })),
    ...names.map(value => ({ value, figure: false, pattern: whole(value) }))].sort((a, b) => b.value.length - a.value.length);
  const found: { value: string; key: string; index: number; length: number }[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const spans: { start: number; end: number; token: string; figure: boolean }[] = [];
    for (const candidate of candidates) {
      if (!line.includes(candidate.value)) continue;
      for (const match of line.matchAll(candidate.pattern)) {
        const start = match.index!;
        const end = start + match[0].length;
        if (!spans.some(span => start < span.end && end > span.start)) spans.push({ start, end, token: candidate.figure ? match[0] : match[0].toLowerCase(), figure: candidate.figure });
      }
    }
    const tokens = [...spans];
    for (const match of line.matchAll(/\p{L}[\p{L}\p{N}'’-]*/gu)) {
      const start = match.index!;
      const word = match[0].toLowerCase();
      if (!LINK_WORDS.has(word) && !spans.some(span => start < span.end && start + match[0].length > span.start)) tokens.push({ start, end: start + match[0].length, token: word, figure: false });
    }
    tokens.sort((a, b) => a.start - b.start);
    tokens.forEach((token, index) => {
      if (!token.figure) return;
      const before = tokens[index - 1]?.token ?? '^';
      const after = tokens[index + 1]?.token ?? '$';
      found.push({ value: token.token, key: `${token.token}\u0000${before}\u0000${after}`, index: offset + token.start, length: token.end - token.start });
    });
    offset += line.length + 1;
  }
  return found;
}

/**
 * Compares the edited report text with the draft ClauseBridge wrote and with current facts. Figures
 * ClauseBridge inserted must still match current records and stay where ClauseBridge put them, between the
 * same words; a figure typed elsewhere (even one that equals some other current fact) is flagged. Any other
 * number, amount or date in the text is flagged too.
 */
export function checkReport(reportText: string, blocks: Block[], facts: Map<string, Fact>, allowedPhrases: string[]): ReportCheck {
  const refs = draftFacts(blocks);
  const changed: ReportCheck['changed'] = [];
  const missing: ReportCheck['missing'] = [];
  let verified = 0;
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.token}\u0000${ref.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!/\d/.test(ref.text) && !ref.token.endsWith(':status')) continue; // only figures, dates and statuses are tracked
    if (!whole(ref.text, '').test(reportText)) continue;
    const current = facts.get(ref.token);
    if (!current) missing.push({ token: ref.token, was: ref.text });
    else if (current.text !== ref.text) changed.push({ token: ref.token, label: current.label, was: ref.text, now: current.text });
    else verified++;
  }
  const allowed = [...[...facts.values()].map(item => item.text), ...allowedPhrases, ...changed.map(item => item.was), ...missing.map(item => item.was)]
    .filter(value => /\d/.test(value));
  let rest = reportText;
  for (const value of [...new Set(allowed)].sort((a, b) => b.length - a.length)) rest = rest.replace(whole(value), match => ' '.repeat(match.length));
  const unverified: ReportCheck['unverified'] = [];
  for (const match of rest.matchAll(/(?:[$€£₦¥]\s?)?-?\d[\d,]*(?:\.\d+)?%?/g)) {
    if (!unverified.some(item => item.value === match[0])) unverified.push({ value: match[0], context: contextAround(reportText, match.index!, match[0].length) });
    if (unverified.length >= 20) break;
  }

  // Each figure must sit where the draft put it: same value, same neighbouring word or figure on each side.
  const figures = [...new Set([...[...facts.values()].map(item => item.text), ...refs.map(ref => ref.text)].filter(value => /\d/.test(value)).concat(STATUS_TEXTS))];
  const names = [...new Set(allowedPhrases.filter(name => name.trim() && !figures.includes(name)))];
  const available = new Map<string, number>();
  for (const item of figuresIn(draftText(blocks), figures, names)) available.set(item.key, (available.get(item.key) ?? 0) + 1);
  const moved: ReportCheck['moved'] = [];
  for (const item of figuresIn(reportText, figures, names)) {
    const left = available.get(item.key) ?? 0;
    if (left > 0) { available.set(item.key, left - 1); continue; }
    if (moved.length < 20) moved.push({ value: item.value, context: contextAround(reportText, item.index, item.length) });
  }
  return { ok: verified > 0 && !changed.length && !missing.length && !unverified.length && !moved.length, verified, changed, missing, unverified, moved };
}

/** After approval: which approved facts have since changed. */
export function staleFacts(approved: Record<string, string>, facts: Map<string, Fact>) {
  const changes: { token: string; label: string; was: string; now: string }[] = [];
  for (const [token, was] of Object.entries(approved)) {
    const now = facts.get(token);
    if (!now) changes.push({ token, label: token, was, now: 'no longer tracked' });
    else if (now.text !== was) changes.push({ token, label: now.label, was, now: now.text });
  }
  return changes;
}
