import { formDataLimited } from '@/lib/server/files';
import { body, json } from '@/lib/server/http';
import { isId, workspaceRoute } from '@/lib/server/route';
import { MAX_EVIDENCE_BYTES, StoreError } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = /^(application\/pdf|image\/(png|jpeg|webp|gif)|text\/plain|text\/csv|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|application\/zip|message\/rfc822)$/;

/** Attach evidence: a file (multipart), or a link or note (JSON). */
export const POST = workspaceRoute<{ ws: string; oid: string }>(async (request, { store, user, workspaceId }, { oid }) => {
  if (!isId(oid)) throw new StoreError('not_found', 'Obligation not found');
  if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const form = await formDataLimited(request, MAX_EVIDENCE_BYTES + 64_000, 'Evidence files can be up to 3 MB');
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new StoreError('invalid', 'Choose a file');
    if (file.size > MAX_EVIDENCE_BYTES) throw new StoreError('invalid', 'Evidence files can be up to 3 MB');
    const mime = file.type || 'application/octet-stream';
    if (!ALLOWED_TYPES.test(mime)) throw new StoreError('invalid', 'Attach a PDF, image, Office document, text, CSV, ZIP or email file');
    const id = await store.addEvidence(user.id, workspaceId, oid, { kind: 'file', label: String(form.get('label') ?? ''),
      fileName: file.name.replace(/[\\/]/g, '_').slice(0, 160), fileMime: mime, bytes: Buffer.from(await file.arrayBuffer()) });
    return json({ id }, 201);
  }
  const data = await body(request);
  const label = typeof data.label === 'string' ? data.label : '';
  if (data.kind === 'link') {
    let url: URL;
    try { url = new URL(String(data.url ?? '')); } catch { throw new StoreError('invalid', 'Enter a full link, starting with https://'); }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new StoreError('invalid', 'Links must start with https://');
    return json({ id: await store.addEvidence(user.id, workspaceId, oid, { kind: 'link', label: label || url.hostname, url: url.toString().slice(0, 1000) }) }, 201);
  }
  if (data.kind === 'note') {
    const note = typeof data.note === 'string' ? data.note.trim() : '';
    if (!note || note.length > 2000) throw new StoreError('invalid', 'Notes are 1–2000 characters');
    return json({ id: await store.addEvidence(user.id, workspaceId, oid, { kind: 'note', label: label || 'Note', note }) }, 201);
  }
  throw new StoreError('invalid', 'Unknown evidence type');
}, { write: true });
