import { type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient, verifyCronSecret } from '@/lib/serverAuth';
import type { DeviceAlertState } from '@/lib/supabase';
import { celsiusToFahrenheit } from '@/lib/supabase/queries/conversions';

type ServiceRoleClient = SupabaseClient;

type DeviceStatus = DeviceAlertState['status'];

type LatestReading = {
  created_at: string;
  temperature: number;
  humidity: number;
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
  return Math.max(0, (nowMs - parsed) / 60000);
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
  nextStatus: Exclude<DeviceStatus, 'ok'>,
  currentDeploymentId: string
): boolean {
  if (!previous) return true;
  if (previous.status === 'ok') return true;
  if (previous.status !== nextStatus) return true;
  // Same incident state: re-fire if we haven't alerted from this deployment
  // yet. Keeps the user in the loop after a redeploy without spamming within
  // a single deploy window.
  if (previous.last_alert_deployment_id !== currentDeploymentId) return true;
  // Edge case: previously never successfully alerted.
  return !previous.last_alert_sent_at;
}

// VERCEL_DEPLOYMENT_ID is unique per Vercel deployment and changes on every
// build or redeploy. Local/self-hosted runs fall back to 'local' so reloads
// don't trigger fake "new deploy" alerts.
export function getCurrentDeploymentId(): string {
  return process.env.VERCEL_DEPLOYMENT_ID || 'local';
}

export function shouldSendRecoveryAlert(
  previous: DeviceAlertState | undefined,
  recoveryEnabled: boolean
): boolean {
  if (!recoveryEnabled || !previous) return false;
  // Send one recovery alert exactly on transition from non-ok -> ok.
  return previous.status !== 'ok';
}

const ALERT_TZ = 'America/Phoenix';

export type DeviceContext = {
  deviceId: string;
  displayName: string;
  deployment: { name: string; location: string; zipCode: string | null } | null;
};

type AlertKind = 'missing' | 'stale' | 'anomaly' | 'recovery';

// Colors from the dashboard palette (globals.css):
// --error #C47878, --warning #D1A875, --accent #C89B4A, --success #8FB58F
const STATUS_META: Record<AlertKind, { label: string; color: string }> = {
  missing: { label: 'No data', color: '#C47878' },
  stale: { label: 'Offline / stale', color: '#D1A875' },
  anomaly: { label: 'Sensor anomaly', color: '#C89B4A' },
  recovery: { label: 'Back online', color: '#8FB58F' },
};

function suggestedAction(kind: Exclude<AlertKind, 'recovery'>): string {
  switch (kind) {
    case 'missing':
      return "Confirm the node is powered and on 2.4GHz WiFi. Verify its device_id is registered under Manage Devices and that secrets.h has the right SUPABASE_URL and SUPABASE_ANON_KEY. Open the serial monitor at 115200 baud to see connection errors.";
    case 'stale':
      return "Check the node's WiFi link and power. A 2-3 min stall often self-recovers. If it doesn't, power-cycle the Uno R4. Persistent silence usually means WiFi drop or power - the serial monitor will tell you which.";
    case 'anomaly':
      return "Readings outside the DHT20's calibrated range usually indicate a wiring or sensor fault. Check SDA/SCL connections, let the sensor stabilize ~100ms after power, and replace the DHT20 if values stay out of range.";
  }
}

function formatPhoenixTime(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'unknown';
  const date = d.toLocaleDateString('en-US', {
    timeZone: ALERT_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    timeZone: ALERT_TZ,
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} \u00b7 ${time} AZ`;
}

function formatTempBoth(temperatureC: number): string {
  return `${celsiusToFahrenheit(temperatureC).toFixed(1)} \u00b0F \u00b7 ${temperatureC.toFixed(1)} \u00b0C`;
}

function formatDeploymentLine(ctx: DeviceContext): string | null {
  if (!ctx.deployment) return null;
  const parts = [ctx.deployment.name];
  if (ctx.deployment.location) parts.push(ctx.deployment.location);
  if (ctx.deployment.zipCode) parts.push(ctx.deployment.zipCode);
  return parts.join(' \u00b7 ');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getDeviceContexts(
  supabase: ServiceRoleClient,
  deviceIds: string[]
): Promise<Map<string, DeviceContext>> {
  const result = new Map<string, DeviceContext>();
  for (const id of deviceIds) {
    result.set(id, { deviceId: id, displayName: id, deployment: null });
  }
  if (deviceIds.length === 0) return result;

  const [devicesRes, deploymentsRes] = await Promise.all([
    supabase.from('devices').select('id, display_name').in('id', deviceIds),
    supabase
      .from('deployments')
      .select('device_id, name, location, zip_code, started_at')
      .in('device_id', deviceIds)
      .is('ended_at', null)
      .order('started_at', { ascending: false }),
  ]);

  if (!devicesRes.error && devicesRes.data) {
    for (const row of devicesRes.data) {
      const existing = result.get(row.id as string);
      if (existing) {
        const displayName = (row.display_name as string | null)?.trim() || (row.id as string);
        existing.displayName = displayName;
      }
    }
  }

  if (!deploymentsRes.error && deploymentsRes.data) {
    const seen = new Set<string>();
    for (const row of deploymentsRes.data) {
      const deviceId = row.device_id as string;
      if (seen.has(deviceId)) continue;
      seen.add(deviceId);
      const existing = result.get(deviceId);
      if (existing) {
        existing.deployment = {
          name: ((row.name as string | null) || '').trim(),
          location: ((row.location as string | null) || '').trim(),
          zipCode: ((row.zip_code as string | null) || '').trim() || null,
        };
      }
    }
  }

  return result;
}

function buildAlertHtml(p: {
  kind: AlertKind;
  displayName: string;
  deviceId: string;
  deploymentLine: string | null;
  reason: string;
  metrics: { label: string; value: string }[];
  action: string;
  dashboardUrl: string;
}): string {
  const meta = STATUS_META[p.kind];

  // Dashboard-matched type stacks. Emails can't reliably load Google Fonts,
  // so we fall back to the same system families the dashboard uses.
  const serifStack = "Georgia,'Times New Roman',ui-serif,serif";
  const monoStack = "'SF Mono',Menlo,Consolas,ui-monospace,monospace";

  const metricRows = p.metrics
    .map(
      (m) =>
        `<tr><td class="metric-label e-muted" style="padding:7px 0;color:#A3A29E;font-size:13px;font-family:${serifStack};">${escapeHtml(m.label)}</td><td align="right" class="metric-value e-fg" style="padding:7px 0;color:#F5F4F0;font-size:13px;font-family:${monoStack};font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1;">${escapeHtml(m.value)}</td></tr>`
    )
    .join('');

  const deploymentRow = p.deploymentLine
    ? `<tr><td class="row-pad e-muted" style="padding:0 28px 20px 28px;font-size:13px;color:#A3A29E;font-family:${serifStack};">Deployment: <span class="e-dim" style="color:#C9C7C2;">${escapeHtml(p.deploymentLine)}</span></td></tr>`
    : '';

  const ctaRow = p.dashboardUrl
    ? `<tr><td class="cta-row" style="padding:4px 28px 24px 28px;"><a href="${escapeHtml(p.dashboardUrl)}" class="cta" style="display:inline-block;background:#C89B4A;color:#1D1C1B;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;font-size:14px;font-family:${serifStack};letter-spacing:-0.01em;line-height:1.3;">Open dashboard \u2192</a></td></tr>`
    : '';

  const sentAt = formatPhoenixTime(new Date().toISOString());

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="x-apple-disable-message-reformatting">
<title>IoT Monitor</title>
<style>
  /* Signal dark-only design to the UA and Gmail / Apple Mail. */
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { color-scheme: dark; }

  /* Gmail dark mode re-inverts "light" emails; re-assert our colors in
     prefers-color-scheme:dark so we lock the palette instead of Gmail
     flipping it. The !important is what bypasses Gmail's inline override. */
  @media (prefers-color-scheme: dark) {
    .e-bg { background-color: #1D1C1B !important; }
    .e-card { background-color: #2F2F2D !important; }
    .e-fg { color: #F5F4F0 !important; }
    .e-muted { color: #A3A29E !important; }
    .e-dim { color: #C9C7C2 !important; }
    .e-cta { background-color: #C89B4A !important; color: #1D1C1B !important; }
    .e-banner-missing { background-color: #C47878 !important; color: #1D1C1B !important; }
    .e-banner-stale { background-color: #D1A875 !important; color: #1D1C1B !important; }
    .e-banner-anomaly { background-color: #C89B4A !important; color: #1D1C1B !important; }
    .e-banner-recovery { background-color: #8FB58F !important; color: #1D1C1B !important; }
  }

  /* Mobile polish (Apple Mail / iOS Mail / Gmail web support these). */
  @media only screen and (max-width: 480px) {
    .outer-pad { padding: 16px 10px !important; }
    .row-pad { padding-left: 18px !important; padding-right: 18px !important; }
    .banner-pad { padding: 12px 18px !important; font-size: 9.5px !important; }
    .device-title { font-size: 20px !important; }
    .device-subtitle { font-size: 13px !important; display: inline-block !important; }
    .section-body { font-size: 15px !important; }
    .metric-label, .metric-value { font-size: 14px !important; padding: 8px 0 !important; }
    .cta { display: block !important; text-align: center !important; padding: 14px 20px !important; font-size: 15px !important; }
    .cta-row { padding-left: 18px !important; padding-right: 18px !important; }
    .footer { font-size: 11px !important; }
  }
  /* iOS blue link override */
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
</style>
</head>
<body class="e-bg" style="margin:0;padding:0;background:#1D1C1B;font-family:${serifStack};color:#F5F4F0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-bg" style="background:#1D1C1B;">
<tr><td align="center" class="outer-pad" style="padding:32px 16px;">
<table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" class="e-card" style="background:#2F2F2D;border:1px solid rgba(255,255,255,0.18);border-radius:10px;max-width:540px;width:100%;">
<tr><td class="banner-pad e-banner-${p.kind}" style="background:${meta.color};padding:12px 28px;color:#1D1C1B;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;border-radius:10px 10px 0 0;font-family:${serifStack};">${escapeHtml(meta.label)}</td></tr>
<tr><td class="row-pad" style="padding:24px 28px 4px 28px;">
<div class="e-muted" style="font-size:10px;color:#A3A29E;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;font-weight:600;font-family:${serifStack};">Device</div>
<div class="device-title e-fg" style="font-size:24px;font-weight:500;color:#F5F4F0;line-height:1.25;letter-spacing:-0.01em;font-family:${serifStack};">${escapeHtml(p.displayName)} <span class="device-subtitle e-muted" style="font-size:15px;color:#A3A29E;font-weight:400;">(${escapeHtml(p.deviceId)})</span></div>
</td></tr>
${deploymentRow}
<tr><td class="row-pad" style="padding:16px 28px;border-top:1px solid rgba(255,255,255,0.12);">
<div class="e-muted" style="font-size:10px;color:#A3A29E;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;font-weight:600;font-family:${serifStack};">What happened</div>
<div class="section-body e-fg" style="font-size:14px;line-height:1.55;color:#F5F4F0;font-family:${serifStack};">${escapeHtml(p.reason)}</div>
</td></tr>
<tr><td class="row-pad" style="padding:2px 28px 14px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${metricRows}</table>
</td></tr>
<tr><td class="row-pad" style="padding:16px 28px;border-top:1px solid rgba(255,255,255,0.12);">
<div class="e-muted" style="font-size:10px;color:#A3A29E;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;font-weight:600;font-family:${serifStack};">Suggested action</div>
<div class="section-body e-fg" style="font-size:14px;line-height:1.55;color:#F5F4F0;font-family:${serifStack};">${escapeHtml(p.action)}</div>
</td></tr>
${ctaRow.replace('class="cta"', 'class="cta e-cta"')}
<tr><td class="row-pad footer e-muted" style="padding:12px 28px;border-top:1px solid rgba(255,255,255,0.12);border-radius:0 0 10px 10px;font-size:11px;color:#A3A29E;font-family:${serifStack};">IoT Temp/Humidity Monitor \u00b7 sent ${escapeHtml(sentAt)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendEmail(
  subject: string,
  text: string,
  html?: string
): Promise<ChannelResult> {
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
  const payload: { from: string; to: string[]; subject: string; text: string; html?: string } = {
    from,
    to,
    subject,
    text,
  };
  if (html) payload.html = html;
  const { error } = await resend.emails.send(payload);

  if (error) {
    return { channel: 'email', ok: false, error: `Resend error: ${error.message}` };
  }

  return { channel: 'email', ok: true };
}

async function dispatchNotifications(
  subject: string,
  text: string,
  html?: string
): Promise<NotificationResult> {
  const attempts = await Promise.all([sendEmail(subject, text, html)]);

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

export function buildProblemAlertMessage(params: {
  context: DeviceContext;
  status: Exclude<DeviceStatus, 'ok'>;
  reason: string;
  latest: LatestReading | null;
  ageMinutes: number | null;
  staleMinutes: number;
}): { subject: string; text: string; html: string } {
  const { context, status, reason, latest, ageMinutes, staleMinutes } = params;
  const meta = STATUS_META[status];
  const action = suggestedAction(status);
  const dashboardUrl = process.env.ALERT_DASHBOARD_URL || '';
  const displayName = context.displayName;
  const lastSeen = formatPhoenixTime(latest?.created_at ?? null);
  const tempValue = latest ? formatTempBoth(latest.temperature) : 'n/a';
  const humidityValue = latest ? `${latest.humidity.toFixed(1)} %` : 'n/a';
  const deploymentLine = formatDeploymentLine(context);

  const metrics: { label: string; value: string }[] = [
    { label: 'Last seen', value: lastSeen },
    {
      label: 'Age',
      value: ageMinutes === null ? 'n/a' : `${ageMinutes.toFixed(1)} min`,
    },
    { label: 'Stale threshold', value: `${staleMinutes} min` },
    { label: 'Temperature', value: tempValue },
    { label: 'Humidity', value: humidityValue },
  ];

  const textLines: (string | null)[] = [
    `[${meta.label.toUpperCase()}] ${displayName} (${context.deviceId})`,
    deploymentLine ? `Deployment: ${deploymentLine}` : null,
    '',
    `What happened: ${reason}`,
    ...metrics.map((m) => `${m.label}: ${m.value}`),
    '',
    `Suggested action: ${action}`,
    dashboardUrl ? `Open dashboard: ${dashboardUrl}` : null,
  ];
  const text = textLines.filter((l) => l !== null).join('\n');

  const html = buildAlertHtml({
    kind: status,
    displayName,
    deviceId: context.deviceId,
    deploymentLine,
    reason,
    metrics,
    action,
    dashboardUrl,
  });

  const subject = `[IoT ${meta.label}] ${displayName}`;
  return { subject, text, html };
}

export function buildRecoveryAlertMessage(params: {
  context: DeviceContext;
  latest: LatestReading | null;
}): { subject: string; text: string; html: string } {
  const { context, latest } = params;
  const meta = STATUS_META.recovery;
  const dashboardUrl = process.env.ALERT_DASHBOARD_URL || '';
  const displayName = context.displayName;
  const lastSeen = formatPhoenixTime(latest?.created_at ?? null);
  const tempValue = latest ? formatTempBoth(latest.temperature) : 'n/a';
  const humidityValue = latest ? `${latest.humidity.toFixed(1)} %` : 'n/a';
  const deploymentLine = formatDeploymentLine(context);

  const metrics: { label: string; value: string }[] = [
    { label: 'Last seen', value: lastSeen },
    { label: 'Temperature', value: tempValue },
    { label: 'Humidity', value: humidityValue },
  ];

  const textLines: (string | null)[] = [
    `[BACK ONLINE] ${displayName} (${context.deviceId}) is reporting again`,
    deploymentLine ? `Deployment: ${deploymentLine}` : null,
    '',
    ...metrics.map((m) => `${m.label}: ${m.value}`),
    '',
    dashboardUrl ? `Open dashboard: ${dashboardUrl}` : null,
  ];
  const text = textLines.filter((l) => l !== null).join('\n');

  const html = buildAlertHtml({
    kind: 'recovery',
    displayName,
    deviceId: context.deviceId,
    deploymentLine,
    reason: 'The device has started reporting again.',
    metrics,
    action: 'No action needed - this is an informational alert.',
    dashboardUrl,
  });

  const subject = `[IoT ${meta.label}] ${displayName}`;
  return { subject, text, html };
}

async function runMonitoring(supabase: ServiceRoleClient) {
  const monitoredDevices = await getMonitoredDevices(supabase);
  if (monitoredDevices.length === 0) {
    return { status: 'ok', monitoredDevices: [], message: 'No devices to monitor', results: [] };
  }
  const staleMinutes = parseNumberEnv('ALERT_STALE_MINUTES', DEFAULT_STALE_MINUTES);
  const recoveryEnabled = process.env.ENABLE_RECOVERY_ALERTS !== 'false';
  const currentDeploymentId = getCurrentDeploymentId();
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const [latestByDeviceEntries, contextByDevice] = await Promise.all([
    Promise.all(
      monitoredDevices.map(async (deviceId) => [
        deviceId,
        await getLatestReading(supabase, deviceId),
      ] as const)
    ),
    getDeviceContexts(supabase, monitoredDevices),
  ]);
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
    const context =
      contextByDevice.get(deviceId) ||
      { deviceId, displayName: deviceId, deployment: null };
    const previous = stateByDevice.get(deviceId);
    const classification = classifyDevice(latest, staleMinutes, nowMs);

    let problemAlertAttempted = false;
    let recoveryAlertAttempted = false;
    let notificationSummary: NotificationResult | null = null;

    if (classification.status === 'ok') {
      if (shouldSendRecoveryAlert(previous, recoveryEnabled)) {
        const msg = buildRecoveryAlertMessage({ context, latest });
        notificationSummary = await dispatchNotifications(msg.subject, msg.text, msg.html);
        recoveryAlertAttempted = true;
      }
    } else {
      if (shouldSendProblemAlert(previous, classification.status, currentDeploymentId)) {
        const msg = buildProblemAlertMessage({
          context,
          status: classification.status,
          reason: classification.reason,
          latest,
          ageMinutes: classification.ageMinutes,
          staleMinutes,
        });
        notificationSummary = await dispatchNotifications(msg.subject, msg.text, msg.html);
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
      stateUpdate.last_alert_deployment_id = currentDeploymentId;
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
  const unauthorized = verifyCronSecret(request);
  if (unauthorized) return unauthorized;

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

  // Idempotency: keepalive runs every 10 min; refuse reruns under 5 min.
  const { data: claimed } = await supabase.rpc('claim_cron_run', {
    p_route: 'keepalive',
    p_min_interval_ms: 5 * 60 * 1000,
  });
  if (!claimed) {
    return NextResponse.json({
      ok: true,
      skipped: 'idempotent',
      timestamp: new Date().toISOString(),
    });
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
