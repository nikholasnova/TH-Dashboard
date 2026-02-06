import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Use service role key to bypass RLS (this is a server-only route with secret protection)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type DeviceStatus = 'ok' | 'missing' | 'stale' | 'anomaly';

type LatestReading = {
  created_at: string;
  temperature: number;
  humidity: number;
};

type DeviceAlertState = {
  device_id: string;
  status: DeviceStatus;
  last_seen_at: string | null;
  last_alert_type: string | null;
  last_alert_sent_at: string | null;
  last_recovery_sent_at: string | null;
  updated_at: string;
};

type ChannelResult = {
  channel: string;
  ok: boolean;
  error?: string;
};

type NotificationResult = {
  attempted: number;
  sent: number;
  results: ChannelResult[];
};

const DEFAULT_DEVICES = ['node1', 'node2'];
const DEFAULT_STALE_MINUTES = 10;
const MIN_TEMP_C = -40;
const MAX_TEMP_C = 85;
const MIN_HUMIDITY = 0;
const MAX_HUMIDITY = 100;

function parseDeviceList(): string[] {
  const raw = process.env.MONITORED_DEVICE_IDS;
  if (!raw) return DEFAULT_DEVICES;
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_DEVICES;
}

function parseNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function minutesSince(isoDate: string | null, nowMs: number): number | null {
  if (!isoDate) return null;
  const parsed = new Date(isoDate).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (nowMs - parsed) / 60000);
}

async function getLatestReading(deviceId: string): Promise<LatestReading | null> {
  const { data, error } = await supabase
    .from('readings')
    .select('created_at, temperature, humidity')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed latest reading query for ${deviceId}: ${error.message}`);
  }

  if (!data) return null;
  return data as LatestReading;
}

function classifyDevice(latest: LatestReading | null, staleMinutes: number, nowMs: number): {
  status: DeviceStatus;
  ageMinutes: number | null;
  reason: string;
} {
  if (!latest) {
    return {
      status: 'missing',
      ageMinutes: null,
      reason: 'No readings have ever been received for this device.',
    };
  }

  const ageMinutes = minutesSince(latest.created_at, nowMs);
  if (ageMinutes !== null && ageMinutes > staleMinutes) {
    return {
      status: 'stale',
      ageMinutes,
      reason: `Last reading is ${ageMinutes.toFixed(1)} minutes old (threshold: ${staleMinutes} min).`,
    };
  }

  const outOfRangeTemp = latest.temperature < MIN_TEMP_C || latest.temperature > MAX_TEMP_C;
  const outOfRangeHumidity = latest.humidity < MIN_HUMIDITY || latest.humidity > MAX_HUMIDITY;
  if (outOfRangeTemp || outOfRangeHumidity) {
    return {
      status: 'anomaly',
      ageMinutes,
      reason:
        `Latest reading is outside expected sensor bounds: ` +
        `temp=${latest.temperature.toFixed(2)}C, humidity=${latest.humidity.toFixed(2)}%.`,
    };
  }

  return {
    status: 'ok',
    ageMinutes,
    reason: 'Device is reporting normally.',
  };
}

function shouldSendProblemAlert(
  previous: DeviceAlertState | undefined,
  nextStatus: Exclude<DeviceStatus, 'ok'>
): boolean {
  if (!previous) return true;
  if (previous.status === 'ok') return true;
  if (previous.status !== nextStatus) return true;
  // Same incident state: retry until at least one alert was successfully sent.
  return !previous.last_alert_sent_at;
}

function shouldSendRecoveryAlert(
  previous: DeviceAlertState | undefined,
  recoveryEnabled: boolean
): boolean {
  if (!recoveryEnabled || !previous) return false;
  // Send one recovery alert exactly on transition from non-ok -> ok.
  return previous.status !== 'ok';
}

async function sendEmail(subject: string, body: string): Promise<ChannelResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const toRaw = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !toRaw) {
    return { channel: 'email', ok: false, error: 'RESEND_API_KEY or ALERT_EMAIL_TO missing' };
  }

  const to = toRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) {
    return { channel: 'email', ok: false, error: 'ALERT_EMAIL_TO has no valid recipients' };
  }

  const from = process.env.ALERT_EMAIL_FROM || 'IoT Monitor <onboarding@resend.dev>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text: body,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { channel: 'email', ok: false, error: `Resend ${response.status}: ${errorText}` };
  }

  return { channel: 'email', ok: true };
}

async function dispatchNotifications(
  subject: string,
  message: string
): Promise<NotificationResult> {
  const attempts = await Promise.all([sendEmail(subject, message)]);

  const active = attempts.filter(
    (a) => !a.error || !a.error.toLowerCase().includes('missing')
  );
  const attempted = active.length;
  const sent = active.filter((a) => a.ok).length;

  return {
    attempted,
    sent,
    results: attempts,
  };
}

function buildProblemAlertMessage(params: {
  deviceId: string;
  status: Exclude<DeviceStatus, 'ok'>;
  reason: string;
  latest: LatestReading | null;
  ageMinutes: number | null;
  staleMinutes: number;
}): { subject: string; body: string } {
  const dashboardUrl = process.env.ALERT_DASHBOARD_URL || '';
  const statusTitle =
    params.status === 'missing'
      ? 'NO DATA'
      : params.status === 'stale'
      ? 'OFFLINE / STALE'
      : 'SENSOR ANOMALY';

  const lastSeen = params.latest?.created_at
    ? new Date(params.latest.created_at).toISOString()
    : 'never';

  const tempLine =
    params.latest !== null
      ? `Latest temp: ${params.latest.temperature.toFixed(2)}C`
      : 'Latest temp: n/a';
  const humidityLine =
    params.latest !== null
      ? `Latest humidity: ${params.latest.humidity.toFixed(2)}%`
      : 'Latest humidity: n/a';

  const body = [
    `IoT monitor alert for ${params.deviceId}`,
    ``,
    `Status: ${statusTitle}`,
    `Reason: ${params.reason}`,
    `Last seen: ${lastSeen}`,
    `Age: ${params.ageMinutes === null ? 'n/a' : `${params.ageMinutes.toFixed(1)} minutes`}`,
    `Stale threshold: ${params.staleMinutes} minutes`,
    tempLine,
    humidityLine,
    dashboardUrl ? `Dashboard: ${dashboardUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const subject = `[IoT Alert] ${params.deviceId} ${statusTitle}`;
  return { subject, body };
}

function buildRecoveryAlertMessage(params: {
  deviceId: string;
  latest: LatestReading | null;
}): { subject: string; body: string } {
  const dashboardUrl = process.env.ALERT_DASHBOARD_URL || '';
  const lastSeen = params.latest?.created_at
    ? new Date(params.latest.created_at).toISOString()
    : 'unknown';

  const body = [
    `IoT monitor recovery for ${params.deviceId}`,
    ``,
    `Status: OK`,
    `Last seen: ${lastSeen}`,
    params.latest
      ? `Latest reading: ${params.latest.temperature.toFixed(2)}C, ${params.latest.humidity.toFixed(2)}%`
      : 'Latest reading: n/a',
    dashboardUrl ? `Dashboard: ${dashboardUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const subject = `[IoT Recovery] ${params.deviceId} is reporting again`;
  return { subject, body };
}

async function runMonitoring() {
  const monitoredDevices = parseDeviceList();
  const staleMinutes = parseNumberEnv('ALERT_STALE_MINUTES', DEFAULT_STALE_MINUTES);
  const recoveryEnabled = process.env.ENABLE_RECOVERY_ALERTS !== 'false';
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const latestByDeviceEntries = await Promise.all(
    monitoredDevices.map(async (deviceId) => [deviceId, await getLatestReading(deviceId)] as const)
  );
  const latestByDevice = new Map<string, LatestReading | null>(latestByDeviceEntries);

  const { data: stateRows, error: stateError } = await supabase
    .from('device_alert_state')
    .select('*')
    .in('device_id', monitoredDevices);

  if (stateError) {
    throw new Error(`Failed alert state query: ${stateError.message}`);
  }

  const stateByDevice = new Map<string, DeviceAlertState>(
    (stateRows || []).map((row) => [row.device_id as string, row as DeviceAlertState])
  );

  const deviceResults: Array<Record<string, unknown>> = [];
  const alertEvents: Array<Record<string, unknown>> = [];

  for (const deviceId of monitoredDevices) {
    const latest = latestByDevice.get(deviceId) || null;
    const previous = stateByDevice.get(deviceId);
    const classification = classifyDevice(latest, staleMinutes, nowMs);

    let problemAlertSent = false;
    let recoveryAlertSent = false;
    let notificationSummary: NotificationResult | null = null;

    if (classification.status === 'ok') {
      if (shouldSendRecoveryAlert(previous, recoveryEnabled)) {
        const msg = buildRecoveryAlertMessage({ deviceId, latest });
        notificationSummary = await dispatchNotifications(msg.subject, msg.body);
        recoveryAlertSent = notificationSummary.sent > 0;
      }
    } else {
      if (shouldSendProblemAlert(previous, classification.status)) {
        const msg = buildProblemAlertMessage({
          deviceId,
          status: classification.status,
          reason: classification.reason,
          latest,
          ageMinutes: classification.ageMinutes,
          staleMinutes,
        });
        notificationSummary = await dispatchNotifications(msg.subject, msg.body);
        problemAlertSent = notificationSummary.sent > 0;
      }
    }

    const stateUpdate: Partial<DeviceAlertState> & {
      device_id: string;
      status: DeviceStatus;
      updated_at: string;
      last_seen_at: string | null;
    } = {
      device_id: deviceId,
      status: classification.status,
      last_seen_at: latest?.created_at || null,
      updated_at: nowIso,
    };

    if (problemAlertSent) {
      stateUpdate.last_alert_type = classification.status;
      stateUpdate.last_alert_sent_at = nowIso;
    }

    if (recoveryAlertSent) {
      stateUpdate.last_recovery_sent_at = nowIso;
    }

    const { error: upsertError } = await supabase
      .from('device_alert_state')
      .upsert(stateUpdate, { onConflict: 'device_id' });

    if (upsertError) {
      throw new Error(`Failed alert state upsert for ${deviceId}: ${upsertError.message}`);
    }

    if (notificationSummary) {
      alertEvents.push({
        device_id: deviceId,
        status: classification.status,
        notification: notificationSummary,
      });
    }

    deviceResults.push({
      device_id: deviceId,
      status: classification.status,
      reason: classification.reason,
      age_minutes: classification.ageMinutes,
      last_seen_at: latest?.created_at || null,
      latest_temperature_c: latest?.temperature ?? null,
      latest_humidity: latest?.humidity ?? null,
      problem_alert_sent: problemAlertSent,
      recovery_alert_sent: recoveryAlertSent,
    });
  }

  const alertsAttempted = alertEvents.reduce(
    (sum, e) => sum + ((e.notification as NotificationResult).attempted || 0),
    0
  );
  const alertsSent = alertEvents.reduce(
    (sum, e) => sum + ((e.notification as NotificationResult).sent || 0),
    0
  );

  return {
    checked_at: nowIso,
    monitored_devices: monitoredDevices,
    stale_threshold_minutes: staleMinutes,
    recovery_alerts_enabled: recoveryEnabled,
    alerts_attempted: alertsAttempted,
    alerts_sent: alertsSent,
    devices: deviceResults,
    events: alertEvents,
  };
}

// Pinged by Vercel cron for health checks and lightweight keepalive traffic.
// Protected by CRON_SECRET - only trusted callers should invoke this route.
export async function GET(request: NextRequest) {
  // Validate CRON_SECRET from Authorization header or query param
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');

  const expectedSecret = process.env.CRON_SECRET;
  const providedSecret = authHeader?.replace('Bearer ', '') || querySecret;

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { count, error } = await supabase
    .from('readings')
    .select('*', { count: 'exact', head: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  try {
    const monitoring = await runMonitoring();
    return NextResponse.json({
      ok: true,
      readings: count,
      monitoring,
      timestamp: new Date().toISOString(),
    });
  } catch (monitorError) {
    const message =
      monitorError instanceof Error ? monitorError.message : String(monitorError);

    return NextResponse.json(
      {
        ok: false,
        readings: count,
        error: `Monitoring failed: ${message}`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
