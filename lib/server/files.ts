/**
 * Turns an uploaded contract file into plain text. Supported: text-based PDF, Word .docx, .txt and .md.
 * Files are checked by their content (magic bytes), not only their name.
 */
import { StoreError } from './errors.ts';

export type ContractKind = 'pdf' | 'docx' | 'txt';
export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

export function detectKind(fileName: string, bytes: Buffer): ContractKind {
  const lower = fileName.toLowerCase();
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && lower.endsWith('.docx')) return 'docx';
  if ((lower.endsWith('.txt') || lower.endsWith('.md')) && !bytes.includes(0)) return 'txt';
  if (lower.endsWith('.doc')) throw new StoreError('invalid', 'Old .doc files are not supported. Save the contract as .docx or PDF and upload it again.');
  throw new StoreError('invalid', 'Upload a PDF, Word (.docx) or text file');
}

async function pdfText(bytes: Buffer) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  let pdf;
  try { pdf = await getDocumentProxy(new Uint8Array(bytes)); }
  catch { throw new StoreError('invalid', 'This PDF could not be opened. It may be damaged or password-protected.'); }
  if (pdf.numPages > 80) throw new StoreError('invalid', 'PDFs can have up to 80 pages');
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map(page => page.trim());
  const letters = pages.join('\n').replace(/[^\p{L}]/gu, '').length;
  if (letters < 80 * Math.min(pages.length, 3)) {
    throw new StoreError('invalid', 'This PDF has little or no selectable text, so it looks like a scan. ClauseBridge reads text-based PDFs; scanned contracts need OCR first.');
  }
  return pages.join('\n\n');
}

async function docxText(bytes: Buffer) {
  const mammoth = await import('mammoth');
  try {
    const result = await (mammoth.default ?? mammoth).extractRawText({ buffer: bytes });
    return result.value;
  } catch {
    throw new StoreError('invalid', 'This Word file could not be read. Save it again as .docx and retry.');
  }
}

export async function extractContractText(fileName: string, bytes: Buffer): Promise<{ kind: ContractKind; text: string }> {
  const kind = detectKind(fileName, bytes);
  const text = kind === 'pdf' ? await pdfText(bytes) : kind === 'docx' ? await docxText(bytes) : bytes.toString('utf8');
  if (text.replace(/\s/g, '').length < 40) throw new StoreError('invalid', 'The file has almost no text to review');
  return { kind, text };
}
