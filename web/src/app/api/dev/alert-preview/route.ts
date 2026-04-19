import { NextRequest } from 'next/server';
import {
  buildProblemAlertMessage,
  buildRecoveryAlertMessage,
  type DeviceContext,
} from '@/app/api/keepalive/route';

type Kind = 'missing' | 'stale' | 'anomaly' | 'recovery';

const SAMPLE_CONTEXT: DeviceContext = {
  deviceId: 'node1',
  displayName: 'Kitchen Node',
  deployment: {
    name: 'Spring semester — kitchen window',
    location: 'Kitchen window sill',
    zipCode: '85142',
  },
};

const SAMPLE_LATEST = {
  created_at: new Date(Date.now() - 14.2 * 60_000).toISOString(),
  temperature: 22.47,
  humidity: 48.91,
};

function isKind(v: string | null): v is Kind {
  return v === 'missing' || v === 'stale' || v === 'anomaly' || v === 'recovery';
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }

  // Preview only: show the CTA button even if the env var isn't set locally.
  const envSnapshot = process.env.ALERT_DASHBOARD_URL;
  if (!envSnapshot) {
    process.env.ALERT_DASHBOARD_URL = 'https://ths.novachuk.dev';
  }

  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');
  const kind: Kind = isKind(kindParam) ? kindParam : 'stale';
  const format = url.searchParams.get('format') === 'text' ? 'text' : 'html';

  let built: { subject: string; text: string; html: string };
  if (kind === 'recovery') {
    built = buildRecoveryAlertMessage({
      context: SAMPLE_CONTEXT,
      latest: SAMPLE_LATEST,
    });
  } else {
    built = buildProblemAlertMessage({
      context: SAMPLE_CONTEXT,
      status: kind,
      reason:
        kind === 'missing'
          ? 'No readings have ever been received for this device.'
          : kind === 'stale'
          ? 'Last reading is 14.2 minutes old (threshold: 10 min).'
          : 'Latest reading is outside expected sensor bounds: temp=120.5C, humidity=102%.',
      latest: kind === 'missing' ? null : SAMPLE_LATEST,
      ageMinutes: kind === 'missing' ? null : 14.2,
      staleMinutes: 10,
    });
  }

  // Restore the original env var (or leave unset) so preview doesn't leak
  // into subsequent cron-route invocations in the same dev process.
  if (envSnapshot === undefined) {
    delete process.env.ALERT_DASHBOARD_URL;
  } else {
    process.env.ALERT_DASHBOARD_URL = envSnapshot;
  }

  if (format === 'text') {
    return new Response(`Subject: ${built.subject}\n\n${built.text}`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(built.html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
