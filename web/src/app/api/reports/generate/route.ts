import { NextResponse } from 'next/server';
import { getServerUser, enforceOrigin } from '@/lib/serverAuth';
import { reportLimiter } from '@/lib/rateLimiter';
import { getBundle, storeTex } from '@/lib/reportStore';
import { buildTexSource, type ReportOptions } from '@/lib/reportTemplate';
import { generateReportProse } from '@/lib/reportProse';
import {
  executeGetReportBundle,
  convertReportBundleToF,
} from '@/lib/aiTools';
import type { ReportBundle } from '@/lib/supabase/types';

export const maxDuration = 60;

function defaultAuthor(user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null): string {
  if (!user) return 'Author';
  const meta = user.user_metadata ?? {};
  const displayName = typeof meta.display_name === 'string' ? meta.display_name.trim() : '';
  if (displayName) return displayName;
  const fullName = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
  if (fullName) return fullName;
  const email = user.email ?? '';
  if (email) return email.split('@')[0];
  return 'Author';
}

function safeString(v: unknown, fallback: string, maxLen = 200): string {
  if (typeof v !== 'string') return fallback;
  const trimmed = v.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function safeBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  return fallback;
}

function yyyymmdd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function POST(req: Request) {
  const originErr = enforceOrigin(req);
  if (originErr) return originErr;

  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { success } = await reportLimiter.limit(user.id);
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. You can generate up to 5 reports per hour.' },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const contextId = body.context_id;
  if (typeof contextId !== 'string' || !/^[a-f0-9-]{36}$/i.test(contextId)) {
    return NextResponse.json({ error: 'context_id is required' }, { status: 400 });
  }

  const bundle = await getBundle(contextId);
  if (!bundle) {
    return NextResponse.json(
      { error: 'Report context expired or not found. Ask the assistant to generate a new report.' },
      { status: 404 },
    );
  }

  if (!bundle.has_sensor_data) {
    return NextResponse.json(
      { error: 'No sensor data in the selected window.' },
      { status: 400 },
    );
  }

  const answers = (body.answers as Record<string, unknown> | undefined) ?? {};

  // If the user narrowed the device list in the modal, re-fetch a bundle
  // scoped to just those devices. Otherwise reuse the cached all-devices
  // bundle from prepare_report.
  const allIds = (bundle.devices_info ?? []).map((d) => d.id);
  const rawSelected = Array.isArray(answers.selected_device_ids)
    ? (answers.selected_device_ids as unknown[]).filter(
        (v): v is string => typeof v === 'string',
      )
    : null;
  const selectedIds = rawSelected && rawSelected.length > 0
    ? rawSelected.filter((id) => allIds.includes(id))
    : null;

  let effectiveBundle: ReportBundle = bundle;
  if (selectedIds && selectedIds.length > 0 && selectedIds.length < allIds.length) {
    try {
      const filtered = await executeGetReportBundle({
        start: bundle.window.start,
        end: bundle.window.end,
        device_ids: selectedIds,
      });
      if (filtered.has_sensor_data) {
        effectiveBundle = convertReportBundleToF(filtered);
      }
    } catch (err) {
      console.error('Failed to re-fetch bundle for narrowed devices:', err);
    }
  }

  const opts: ReportOptions = {
    title: safeString(answers.title, `Data Report — ${yyyymmdd(effectiveBundle.window.start)} to ${yyyymmdd(effectiveBundle.window.end)}`),
    author: safeString(answers.author, defaultAuthor(user)),
    institution: safeString(answers.institution, 'Central Arizona College — EGR102'),
    include_gaps_note: safeBool(answers.include_gaps_note, effectiveBundle.gaps.length > 0),
    split_by_device: safeBool(answers.split_by_device, false),
    include_weather_section: safeBool(answers.include_weather_section, effectiveBundle.has_weather_data),
  };

  const prose = await generateReportProse(effectiveBundle, opts);
  const tex = buildTexSource(effectiveBundle, opts, prose);

  const reportId = crypto.randomUUID();
  const filename = `temp-humidity-report-${yyyymmdd(effectiveBundle.window.start)}-to-${yyyymmdd(effectiveBundle.window.end)}.tex`;

  const stored = await storeTex(reportId, tex, {
    filename,
    byte_size: tex.length,
    user_id: user.id,
    start: effectiveBundle.window.start,
    end: effectiveBundle.window.end,
  });

  if (!stored) {
    return NextResponse.json(
      { error: 'Unable to store report. Please try again.' },
      { status: 503 },
    );
  }

  return NextResponse.json({
    report_id: reportId,
    filename,
    byte_size: tex.length,
  });
}
