import { getTex, getMeta } from '@/lib/reportStore';
import { getServerUser } from '@/lib/serverAuth';

const ID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  if (!ID_RE.test(id)) {
    return new Response('Bad request', { status: 400 });
  }

  const meta = await getMeta(id);
  if (!meta || meta.user_id !== user.id) {
    return new Response('Report expired or not found', { status: 404 });
  }

  const tex = await getTex(id);
  if (!tex) {
    return new Response('Report expired or not found', { status: 404 });
  }

  const filename = meta.filename;

  return new Response(tex, {
    headers: {
      'Content-Type': 'text/x-latex; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=600',
    },
  });
}
