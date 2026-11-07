'use client';
// Univer Docs for ClauseBridge: the read-only contract review view and the editable report. Loaded lazily.
import { UniverDocsCorePreset } from '@univerjs/preset-docs-core';
import UniverPresetDocsCoreEnUS from '@univerjs/preset-docs-core/locales/en-US';
import { BooleanNumber, createUniver, LocaleType, mergeLocales, type IDocumentData, type IParagraph, type ITextRun, type ITextStyle } from '@univerjs/presets';
import '@univerjs/preset-docs-core/lib/index.css';
import type { Clause } from './contract/clauses.ts';
import type { Block } from './report.ts';

export type Mark = { start: number; end: number; tone: 'pending' | 'confirmed' | 'focus' };

const TONES: Record<Mark['tone'], ITextStyle> = {
  pending: { bg: { rgb: '#FCEBA4' } },
  confirmed: { bg: { rgb: '#D6ECE1' } },
  focus: { bg: { rgb: '#F6CB45' } },
};

type StyledRange = { start: number; end: number; style: ITextStyle };

/** Merges possibly overlapping styled ranges into the non-overlapping text runs Univer expects. */
function toRuns(ranges: StyledRange[], length: number): ITextRun[] {
  const cuts = new Set<number>([0, length]);
  for (const range of ranges) { cuts.add(Math.max(0, range.start)); cuts.add(Math.min(length, range.end)); }
  const points = [...cuts].sort((a, b) => a - b);
  const runs: ITextRun[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const st = points[i], ed = points[i + 1];
    if (ed <= st) continue;
    const style: ITextStyle = {};
    for (const range of ranges) if (range.start <= st && range.end >= ed) Object.assign(style, range.style);
    if (Object.keys(style).length) runs.push({ st, ed, ts: style });
  }
  return runs;
}

function body(stream: string, ranges: StyledRange[], paragraphStyle: (index: number, start: number) => IParagraph['paragraphStyle']) {
  const paragraphs: IParagraph[] = [];
  let paragraphStart = 0;
  for (let i = 0; i < stream.length; i++) {
    if (stream[i] === '\r') {
      paragraphs.push({ startIndex: i, paragraphId: `p${paragraphs.length}`, paragraphStyle: paragraphStyle(paragraphs.length, paragraphStart) });
      paragraphStart = i + 1;
    }
  }
  return { dataStream: stream, paragraphs, textRuns: toRuns(ranges, stream.length - 2), sectionBreaks: [{ sectionId: 's0', startIndex: stream.length - 1 }] };
}

const PAGE = { pageSize: { width: 700, height: 990 }, marginTop: 56, marginBottom: 56, marginLeft: 64, marginRight: 64, autoHyphenation: BooleanNumber.FALSE };
const SERIF = 'Source Serif 4 Variable';

/** The contract as a Univer document: clause numbers in bold, headings set apart, suggestion quotes highlighted. */
export function contractDocument(id: string, text: string, clauses: Clause[], marks: Mark[]): Partial<IDocumentData> {
  const stream = text.replace(/\n/g, '\r') + '\r\n';
  const ranges: StyledRange[] = [{ start: 0, end: text.length, style: { ff: SERIF, fs: 11.5, cl: { rgb: '#1B1F24' } } }];
  const headingStarts = new Set<number>();
  const firstBreak = text.indexOf('\n');
  if (firstBreak > 0 && firstBreak < 100 && text.slice(0, firstBreak) === text.slice(0, firstBreak).toUpperCase()) {
    ranges.push({ start: 0, end: firstBreak, style: { bl: BooleanNumber.TRUE, fs: 15 } });
    headingStarts.add(0);
  }
  for (const clause of clauses) {
    const firstLineEnd = text.indexOf('\n', clause.start);
    const lineEnd = firstLineEnd < 0 || firstLineEnd > clause.end ? clause.end : firstLineEnd;
    const line = text.slice(clause.start, lineEnd);
    const isHeading = clause.heading && line.length <= clause.heading.length + 18;
    if (isHeading) { ranges.push({ start: clause.start, end: lineEnd, style: { bl: BooleanNumber.TRUE, fs: 12.5 } }); headingStarts.add(clause.start); }
    else if (clause.ref !== 'Preamble' && !clause.ref.startsWith('¶')) {
      const marker = /^(?:(?:clause|section|article)\s+)?[\dA-Za-z.]+[.:]?\s/i.exec(line);
      if (marker) ranges.push({ start: clause.start, end: clause.start + marker[0].length, style: { bl: BooleanNumber.TRUE, cl: { rgb: '#145C4C' } } });
    }
  }
  for (const mark of marks) ranges.push({ start: mark.start, end: mark.end, style: TONES[mark.tone] });
  return {
    id,
    documentStyle: PAGE,
    body: body(stream, ranges, (_index, start) => headingStarts.has(start) && start > 0
      ? { spaceAbove: { v: 14 }, spaceBelow: { v: 4 } } : { spaceBelow: { v: 7 }, lineSpacing: 1.25 }),
  };
}

export type ContractView = { select: (start: number, end: number) => void; setMarks: (marks: Mark[]) => void; dispose: () => void };

/** Mounts the read-only contract. The contract text is locked so every clause reference keeps its exact position. */
export function mountContract(container: HTMLElement, text: string, clauses: Clause[], marks: Mark[]): ContractView {
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: { [LocaleType.EN_US]: mergeLocales(UniverPresetDocsCoreEnUS) },
    presets: [UniverDocsCorePreset({ container, header: false, toolbar: false, footer: false, contextMenu: false, disableAutoFocus: true })],
  });
  // The contract is locked: any command that would change its text or formatting is cancelled before it runs,
  // while selecting, scrolling and copying still work.
  const guard = univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, event => {
    if (/^doc\.(command|mutation)\./.test(event.id) && !/(copy|select|cursor|scroll|zoom|focus)/i.test(event.id)) event.cancel = true;
  });
  let version = 0;
  let current = univerAPI.createDocument(contractDocument(`contract-${version}`, text, clauses, marks));
  return {
    select(start, end) {
      try { univerAPI.getActiveDocument()?.setSelection(start, end); } catch { /* selection is best effort */ }
    },
    setMarks(next) {
      const previous = current.getId();
      version++;
      current = univerAPI.createDocument(contractDocument(`contract-${version}`, text, clauses, next));
      univerAPI.disposeUnit(previous);
    },
    dispose: () => { guard.dispose(); univer.dispose(); },
  };
}

// ---------- report ----------

export type ReportView = { readText: () => string; dispose: () => void };

/** Mounts an editable report. Figures ClauseBridge inserted are tinted so readers can see where they came from. */
export function mountReport(container: HTMLElement, blocks: Block[]): ReportView {
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: { [LocaleType.EN_US]: mergeLocales(UniverPresetDocsCoreEnUS) },
    presets: [UniverDocsCorePreset({ container, footer: false })],
  });
  let stream = '';
  const ranges: StyledRange[] = [];
  const kinds: Block['kind'][] = [];
  for (const block of blocks) {
    const start = stream.length;
    const prefix = block.kind === 'item' ? '• ' : '';
    stream += prefix;
    for (const segment of block.segments) {
      const segStart = stream.length;
      stream += segment.text.replace(/[\r\n]+/g, ' ');
      if (segment.type === 'fact') ranges.push({ start: segStart, end: stream.length, style: { cl: { rgb: '#145C4C' }, bg: { rgb: '#E7F3EC' } } });
    }
    if (block.kind === 'title') ranges.push({ start, end: stream.length, style: { bl: BooleanNumber.TRUE, fs: 18 } });
    if (block.kind === 'heading') ranges.push({ start, end: stream.length, style: { bl: BooleanNumber.TRUE, fs: 13 } });
    if (block.kind === 'note') ranges.push({ start, end: stream.length, style: { it: BooleanNumber.TRUE, fs: 9.5, cl: { rgb: '#5E6672' } } });
    stream += '\r';
    kinds.push(block.kind);
  }
  stream += '\n';
  ranges.unshift({ start: 0, end: stream.length - 2, style: { ff: SERIF, fs: 11.5 } });
  const doc = univerAPI.createDocument({
    id: 'report',
    documentStyle: PAGE,
    body: body(stream, ranges, index => kinds[index] === 'heading' ? { spaceAbove: { v: 16 }, spaceBelow: { v: 4 } }
      : kinds[index] === 'item' ? { spaceBelow: { v: 4 }, indentStart: { v: 10 }, lineSpacing: 1.2 } : { spaceBelow: { v: 8 }, lineSpacing: 1.25 }),
  });
  return {
    readText: () => (doc.getBody().dataStream ?? '').replace(/\r\n$/, '').replace(/\n$/, '').split('\r').join('\n').trim(),
    dispose: () => univer.dispose(),
  };
}
