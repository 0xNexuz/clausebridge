import { isId, workspaceRoute } from '@/lib/server/route';
import { StoreError } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain; charset=utf-8',
};

/** Downloads the original uploaded file (or the text of a sample). */
export const GET = workspaceRoute<{ ws: string; id: string }>(async (_request, { store, user, workspaceId }, { id }) => {
  if (!isId(id)) throw new StoreError('not_found', 'Contract not found');
  const file = await store.contractFile(user.id, workspaceId, id);
  const bytes = file.file_bytes ?? Buffer.from(file.text, 'utf8');
  return new Response(new Uint8Array(bytes), { headers: {
    'Content-Type': file.file_bytes ? TYPES[file.file_kind] ?? 'application/octet-stream' : TYPES.txt,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  } });
});
