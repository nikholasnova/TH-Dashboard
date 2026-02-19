import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

type ServiceRoleClient = SupabaseClient;

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return {
      client: null,
      error:
        'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    } as const;
  }

  return { client: createClient(url, serviceRoleKey), error: null } as const;
}

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

export function parseDeviceList(): string[] {
  const raw = process.env.MONITORED_DEVICE_IDS;
  if (!raw) return DEFAULT_DEVICES;
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_DEVICES;
}

async function getMonitoredDevices(supabase: ServiceRoleClient): Promise<string[]> {
  const envList = process.env.MONITORED_DEVICE_IDS;
  if (envList) {
    const parsed = envList.split(',').map(s => s.trim()).filter(Boolean);
    if (parsed.length > 0) return parsed;
  }

  try {
    const { data, error } = await supabase
      .from('devices')
      .select('id')
      .eq('monitor_enabled', true)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!error && data) {
      return data.map(d => d.id);
    }
  } catch (e) {
    console.error('Failed to fetch devices for monitoring:', e);
  }

  return DEFAULT_DEVICES;
}

export function parseNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function minutesSince(isoDate: string | null, nowMs: number): number | null {
  if (!isoDate) return null;
  const parsed = new Date(isoDate).getTime();
  if (!Number.isFinite(parsed)) return null;
  return (nowMs - parsed) / 60000;
}

async function getLatestReading(
  supabase: ServiceRoleClient,
  deviceId: string
): Promise<LatestReading | null> {
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

export function classifyDevice(latest: LatestReading | null, staleMinutes: number, nowMs: number): {
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
  if (ageMinutes !== null && ageMinutes < 0) {
    return {
      status: 'stale' as const,
      ageMinutes,
      reason: `Latest reading has a future timestamp (${latest.created_at}). Treating as stale.`,
    };
  }
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

export function shouldSendProblemAlert(
  previous: DeviceAlertState | undefined,
  nextStatus: Exclude<DeviceStatus, 'ok'>
): boolean {
  if (!previous) return true;
  if (previous.status === 'ok') return true;
  if (previous.status !== nextStatus) return true;
  // Same incident state: only alert once (last_alert_sent_at is set on attempt).
  return !previous.last_alert_sent_at;
}

export function shouldSendRecoveryAlert(
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
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    text: body,
  });

  if (error) {
    return { channel: 'email', ok: false, error: `Resend error: ${error.message}` };
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

async function runMonitoring(supabase: ServiceRoleClient) {
  const monitoredDevices = await getMonitoredDevices(supabase);
  if (monitoredDevices.length === 0) {
    return { status: 'ok', monitoredDevices: [], message: 'No devices to monitor', results: [] };
  }
  const staleMinutes = parseNumberEnv('ALERT_STALE_MINUTES', DEFAULT_STALE_MINUTES);
  const recoveryEnabled = process.env.ENABLE_RECOVERY_ALERTS !== 'false';
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const latestByDeviceEntries = await Promise.all(
    monitoredDevices.map(async (deviceId) => [
      deviceId,
      await getLatestReading(supabase, deviceId),
    ] as const)
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

    let problemAlertAttempted = false;
    let recoveryAlertAttempted = false;
    let notificationSummary: NotificationResult | null = null;

    if (classification.status === 'ok') {
      if (shouldSendRecoveryAlert(previous, recoveryEnabled)) {
        const msg = buildRecoveryAlertMessage({ deviceId, latest });
        notificationSummary = await dispatchNotifications(msg.subject, msg.body);
        recoveryAlertAttempted = true;
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
        problemAlertAttempted = true;
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

    // Record the attempt timestamp regardless of delivery success.
    // This prevents infinite retries when the email provider is down;
    // operators should check Vercel logs for dispatch failures.
    if (problemAlertAttempted) {
      stateUpdate.last_alert_type = classification.status;
      stateUpdate.last_alert_sent_at = nowIso;
    }

    if (recoveryAlertAttempted) {
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
      problem_alert_attempted: problemAlertAttempted,
      recovery_alert_attempted: recoveryAlertAttempted,
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
  const authHeader = request.headers.get('authorization');

  const expectedSecret = process.env.CRON_SECRET;
  const providedSecret = authHeader?.replace('Bearer ', '');

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { client: supabase, error: supabaseConfigError } = getServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: `Server Supabase configuration missing: ${supabaseConfigError}`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }

  try {
    const monitoring = await runMonitoring(supabase);
    return NextResponse.json({
      ok: true,
      monitoring,
      timestamp: new Date().toISOString(),
    });
  } catch (monitorError) {
    const message =
      monitorError instanceof Error ? monitorError.message : String(monitorError);

    return NextResponse.json(
      {
        ok: false,
        error: `Monitoring failed: ${message}`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
