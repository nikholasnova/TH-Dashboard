import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/serverAuth';
import { getMeta } from '@/lib/reportStore';

const ID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const meta = await getMeta(id);
  if (!meta || meta.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    filename: meta.filename,
    byte_size: meta.byte_size,
    start: meta.start,
    end: meta.end,
  });
}
