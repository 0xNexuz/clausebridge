import { isId, workspaceRoute } from '@/lib/server/route';
import { StoreError } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = workspaceRoute<{ ws: string; eid: string }>(async (_request, { store, user, workspaceId }, { eid }) => {
  if (!isId(eid)) throw new StoreError('not_found', 'File not found');
  const file = await store.evidenceFile(user.id, workspaceId, eid);
  return new Response(new Uint8Array(file.file_bytes!), { headers: {
    'Content-Type': file.file_mime ?? 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name ?? 'evidence')}`,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
  } });
});
