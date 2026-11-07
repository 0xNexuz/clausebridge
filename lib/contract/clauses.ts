/**
 * Contract text normalisation and clause splitting.
 *
 * The normalised text is the single source of offsets used everywhere: suggestion quotes, obligations,
 * the Univer Docs contract view (each "\n" becomes a paragraph break) and report links. Paragraphs are
 * separated by exactly one "\n".
 */

export type Clause = {
  /** Stable id within the contract, e.g. "c7". */
  id: string;
  /** The contract's own numbering: "4.2", "Schedule A", "Preamble" or "¶3". */
  ref: string;
  /** How to show it: "Clause 4.2", "Schedule A", "Preamble", "Paragraph 3". */
  label: string;
  heading: string;
  level: number;
  start: number;
  end: number;
};

export const MAX_CONTRACT_CHARS = 150_000;

const NUMBERED = /^(\d{1,2}(?:\.\d{1,2}){0,3})(?:\.(?=\s)|(?=\s))\s*/;
const TOP_LEVEL_NUMBER = /^\d{1,2}\.\s/;
const WORDED = /^(?:clause|section|article)\s+(\d{1,2}(?:\.\d{1,2}){0,3})\b[.:]?\s*/i;
const SCHEDULE = /^(schedule|annex|appendix|exhibit)\s+([A-Z]|\d{1,2}|[IVX]{1,4})\b[.:]?\s*/i;
const PAGE_NUMBER = /^(?:page\s+)?\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?$/i;
const LIST_ITEM = /^(?:\(?[a-z]\)|\(?[ivx]{1,4}\)|[•\-–*])\s+/i;

/** Returns the clause marker at the start of a paragraph, if any. */
export function clauseMarker(paragraph: string): { ref: string; label: string; level: number; rest: string } | null {
  const worded = WORDED.exec(paragraph);
  if (worded) return { ref: worded[1], label: `Clause ${worded[1]}`, level: worded[1].split('.').length, rest: paragraph.slice(worded[0].length) };
  const schedule = SCHEDULE.exec(paragraph);
  if (schedule) {
    const word = schedule[1][0].toUpperCase() + schedule[1].slice(1).toLowerCase();
    return { ref: `${word} ${schedule[2].toUpperCase()}`, label: `${word} ${schedule[2].toUpperCase()}`, level: 1, rest: paragraph.slice(schedule[0].length) };
  }
  const numbered = NUMBERED.exec(paragraph);
  if (numbered) {
    const ref = numbered[1];
    // "1 March 2026 ..." is a date, not clause 1: a single number must be written "1." to count.
    if (!ref.includes('.') && !TOP_LEVEL_NUMBER.test(paragraph)) return null;
    if (/^\d{1,2}\.\s*\d{2,4}\b/.test(paragraph) && !ref.includes('.')) return null;
    return { ref, label: `Clause ${ref}`, level: ref.split('.').length, rest: paragraph.slice(numbered[0].length) };
  }
  return null;
}

function cleanLine(line: string) {
  return line.replace(/[   \t]/g, ' ').replace(/[​﻿]/g, '').replace(/ {2,}/g, ' ').trim();
}

/**
 * Normalises extracted text: unifies line endings and spaces, drops bare page numbers, and re-joins lines
 * that a PDF wrapped mid-sentence. A new paragraph starts after a blank line, at a clause marker or list
 * item, or after a line that ends a sentence or heading.
 */
export function normalizeContractText(raw: string): string {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').map(cleanLine);
  const paragraphs: string[] = [];
  let current = '';
  const flush = () => { if (current.trim()) paragraphs.push(current.trim()); current = ''; };
  for (const line of lines) {
    if (!line) { flush(); continue; }
    if (PAGE_NUMBER.test(line)) continue;
    const startsNew = clauseMarker(line) !== null || LIST_ITEM.test(line);
    const previousEnded = /[.:;!?)]$/.test(current) || /^[A-Z0-9 ,&'’()-]{3,80}$/.test(current);
    if (!current || startsNew || previousEnded) { flush(); current = line; }
    else current = current.endsWith('-') && /^[a-z]/.test(line) ? current.slice(0, -1) + line : `${current} ${line}`;
  }
  flush();
  const text = paragraphs.join('\n');
  if (text.length > MAX_CONTRACT_CHARS) throw new Error(`The contract text is longer than ${MAX_CONTRACT_CHARS.toLocaleString('en')} characters`);
  return text;
}

function shortHeading(rest: string) {
  const firstSentence = rest.split(/(?<=[.:;])\s/)[0] ?? '';
  if (rest.length <= 80 && !/[.;]$/.test(rest.trim())) return rest.trim().replace(/[:.]$/, '');
  if (firstSentence.length <= 60 && /^[A-Z][^.]*[.:]$/.test(firstSentence) && /^[A-Z][a-z]+(?:\s+(?:and|of|&|[A-Z][a-z]+)){0,5}[.:]$/.test(firstSentence)) {
    return firstSentence.slice(0, -1);
  }
  return '';
}

/** Splits normalised text into clauses with character offsets. */
export function splitClauses(text: string): Clause[] {
  const paragraphs: { text: string; start: number; end: number }[] = [];
  let offset = 0;
  for (const paragraph of text.split('\n')) {
    paragraphs.push({ text: paragraph, start: offset, end: offset + paragraph.length });
    offset += paragraph.length + 1;
  }
  const marked = paragraphs.map(paragraph => clauseMarker(paragraph.text));
  const clauses: Clause[] = [];
  const add = (fields: Omit<Clause, 'id'>) => clauses.push({ id: `c${clauses.length + 1}`, ...fields });

  if (!marked.some(Boolean)) {
    paragraphs.forEach((paragraph, index) => {
      if (paragraph.text) add({ ref: `¶${index + 1}`, label: `Paragraph ${index + 1}`, heading: '', level: 1, start: paragraph.start, end: paragraph.end });
    });
    return clauses;
  }

  let open: Omit<Clause, 'id'> | null = null;
  paragraphs.forEach((paragraph, index) => {
    const marker = marked[index];
    if (marker) {
      if (open) add(open);
      open = { ref: marker.ref, label: marker.label, heading: shortHeading(marker.rest), level: marker.level, start: paragraph.start, end: paragraph.end };
    } else if (open) {
      open.end = paragraph.end;
    } else {
      open = { ref: 'Preamble', label: 'Preamble', heading: '', level: 0, start: paragraph.start, end: paragraph.end };
    }
  });
  if (open) add(open);
  return clauses;
}

export function clauseAt(clauses: Clause[], offset: number): Clause | undefined {
  return clauses.find(clause => offset >= clause.start && offset < clause.end) ?? clauses.findLast(clause => clause.start <= offset);
}
