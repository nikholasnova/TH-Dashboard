import { getTex, getMeta } from '@/lib/reportStore';

const ID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!ID_RE.test(id)) {
    return new Response('Bad request', { status: 400 });
  }

  const tex = await getTex(id);
  if (!tex) {
    return new Response('Report expired or not found', { status: 404 });
  }

  const meta = await getMeta(id);
  const filename = meta?.filename ?? 'report.tex';

  return new Response(tex, {
    headers: {
      'Content-Type': 'text/x-latex; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      // Overleaf and client fetches need permissive CORS.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'private, max-age=600',
    },
  });
}
