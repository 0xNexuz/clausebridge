import { antLingConfig } from '@/lib/server/ant-ling';
import { json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Whether Ant Ling is connected on this server, and which model. Never returns the key. */
export async function GET() {
  try {
    const config = antLingConfig();
    return json({ connected: Boolean(config), model: config?.model ?? null });
  } catch {
    return json({ connected: false, model: null });
  }
}
