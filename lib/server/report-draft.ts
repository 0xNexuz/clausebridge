import { buildReportBlocks, factSheet, plainSummary, validateSummary, type ReportDraftContent } from '../report.ts';
import type { Obligation } from '../types.ts';
import { chatCompletion, type AntLingConfig, type ChatMessage, type ChatResult } from './ant-ling.ts';

type Complete = (messages: ChatMessage[]) => Promise<ChatResult>;

function messages(title: string, facts: ReturnType<typeof factSheet>, obligations: Obligation[]): ChatMessage[] {
  const totals = [...facts.values()].filter(fact => !fact.token.startsWith('ob:')).map(fact => `{{${fact.token}}} = ${fact.text} (${fact.label})`);
  const items = obligations.map(ob => {
    const r = ob.ref.toLowerCase();
    const outstanding = facts.has(`ob:${r}:outstanding`) ? `, outstanding {{ob:${r}:outstanding}}` : '';
    return `{{ob:${r}}} {{ob:${r}:title}}: status {{ob:${r}:status}}, due {{ob:${r}:due}}, from {{ob:${r}:clause}}${outstanding}  [= ${ob.ref}, ${ob.title}, ${ob.status}, ${ob.dueDate ?? 'no date'}]`;
  });
  return [
    {
      role: 'system',
      content: [
        'You write the short summary at the top of a contract progress report for a manager.',
        'You receive facts, each with a token in double braces.',
        'Rules:',
        '1. Never write a number in any form: no digits, dates, amounts, percentages, references or spelled-out numbers.',
        '2. Whenever you mention a count, amount, date, status, obligation reference or clause, write its token exactly, for example {{count:overdue}}.',
        '3. Use only tokens from the list. Do not invent tokens or facts, and do not guess causes.',
        '4. Do not give legal advice or comment on whether terms are fair or enforceable.',
        '5. Write one or two short paragraphs, under 120 words in total, in plain English. No headings, lists, bold or markdown.',
        '6. Lead with what needs attention (overdue items and outstanding payments), then progress.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Report: ${title.replace(/[{}]/g, '').slice(0, 140)}`,
        'Facts (values are shown for your understanding only; write the token, never the value):',
        ...totals,
        'Obligations:',
        ...items.slice(0, 60),
        'Write the summary now.',
      ].join('\n'),
    },
  ];
}

/** Builds a report draft. With Ant Ling, Ling 3.2 Flash writes the summary; otherwise ClauseBridge writes a plain one. */
export async function draftProgressReport(input: { title: string; obligations: Obligation[]; today: string; contractTitles: Map<string, string>;
  allowedNames: string[]; config: AntLingConfig | null; complete?: Complete }): Promise<ReportDraftContent & { attempts: number; fallbackReason: string | null }> {
  const facts = factSheet(input.obligations, input.today, input.contractTitles);
  let summary = plainSummary(facts);
  let model: string | null = null;
  let requestId: string | null = null;
  let attempts = 0;
  let fallbackReason: string | null = input.config ? null : 'Ant Ling is not connected on this server.';
  if (input.config && input.obligations.length) {
    const complete: Complete = input.complete ?? (msgs => chatCompletion(input.config!, msgs, { maxTokens: 600 }));
    const conversation = messages(input.title, facts, input.obligations);
    for (attempts = 1; attempts <= 2; attempts++) {
      const result = await complete(conversation);
      model = result.model;
      requestId = result.requestId;
      const checked = validateSummary(result.content, facts, input.allowedNames);
      if (checked.ok) { summary = checked.paragraphs; fallbackReason = null; break; }
      fallbackReason = `Ling's summary did not pass the number check (${checked.reason}), so ClauseBridge wrote a plain summary.`;
      conversation.push({ role: 'assistant', content: result.content });
      conversation.push({ role: 'user', content: `That summary broke the rules: ${checked.reason} Rewrite it using tokens for every figure, date, status and reference.` });
    }
    attempts = Math.min(attempts, 2);
  }
  const blocks = buildReportBlocks(input.title, input.obligations, input.today, facts, summary);
  return { title: input.title, asOf: input.today, blocks, model: fallbackReason ? null : model, requestId: fallbackReason ? null : requestId,
    summarySource: fallbackReason ? 'clausebridge' : 'ling', attempts, fallbackReason };
}
