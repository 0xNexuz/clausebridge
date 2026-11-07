import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';
import { normalizeContractText, splitClauses } from '@/lib/contract/clauses';
import { extractContractText } from '@/lib/server/files';
import { json } from '@/lib/server/http';
import { workspaceRoute } from '@/lib/server/route';
import { MAX_CONTRACT_FILE_BYTES, StoreError } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAMPLES: Record<string, { file: string; title: string }> = {
  'website-redesign': { file: 'website-redesign.txt', title: 'Website Redesign Services Agreement' },
  'office-supplies': { file: 'office-supplies.txt', title: 'Supply Framework Agreement' },
};

export const GET = workspaceRoute(async (_request, { store, user, workspaceId }) =>
  json({ contracts: await store.listContracts(user.id, workspaceId) }));

/** Upload a contract (multipart: file, title) or add a built-in sample (JSON: { sample }). */
export const POST = workspaceRoute(async (request: NextRequest, { store, user, workspaceId }) => {
  let title = '';
  let fileName = '';
  let raw = '';
  let kind = 'txt';
  let bytes: Buffer | null = null;
  if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_CONTRACT_FILE_BYTES + 64_000) throw new StoreError('invalid', 'Contract files can be up to 4 MB');
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new StoreError('invalid', 'Choose a contract file to upload');
    if (file.size > MAX_CONTRACT_FILE_BYTES) throw new StoreError('invalid', 'Contract files can be up to 4 MB');
    bytes = Buffer.from(await file.arrayBuffer());
    fileName = file.name.replace(/[\\/]/g, '_').slice(0, 160) || 'contract';
    const extracted = await extractContractText(fileName, bytes);
    raw = extracted.text;
    kind = extracted.kind;
    title = String(form.get('title') ?? '').trim();
  } else {
    const data = await request.json() as { sample?: unknown };
    const sample = typeof data.sample === 'string' ? SAMPLES[data.sample] : undefined;
    if (!sample) throw new StoreError('invalid', 'Unknown sample contract');
    raw = await readFile(path.join(process.cwd(), 'data', 'samples', sample.file), 'utf8');
    fileName = `${sample.file.replace('.txt', '')} (sample).txt`;
    title = sample.title;
  }
  let text: string;
  try { text = normalizeContractText(raw); } catch (error) { throw new StoreError('invalid', error instanceof Error ? error.message : 'Unreadable contract'); }
  const clauses = splitClauses(text);
  if (!clauses.length) throw new StoreError('invalid', 'No contract text was found in the file');
  if (!title) {
    const first = text.split('\n')[0] ?? '';
    title = first.length <= 90 ? first.replace(/\b([A-Z])([A-Z]+)\b/g, (_m, a: string, b: string) => a + b.toLowerCase()) : fileName.replace(/\.[^.]+$/, '');
  }
  const id = await store.createContract(user.id, workspaceId, { title, fileName, fileKind: kind, bytes, text, clauses });
  return json({ id }, 201);
}, { write: true });
