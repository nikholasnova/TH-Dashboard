import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

// IP-based rate limiter: 5 requests per 10 seconds
const guestRateMap = new Map<string, number[]>();
const GUEST_RATE_WINDOW_MS = 10_000;
const GUEST_RATE_MAX = 5;

function checkGuestRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (guestRateMap.get(ip) || []).filter(
    (t) => now - t < GUEST_RATE_WINDOW_MS
  );
  if (timestamps.length === 0) {
    guestRateMap.delete(ip);
  }
  if (timestamps.length >= GUEST_RATE_MAX) return false;
  timestamps.push(now);
  guestRateMap.set(ip, timestamps);
  return true;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

const ALLOWED_ACTIONS = new Set([
  'dashboard_live',
  'device_stats',
  'devices',
  'deployments',
  'active_deployments',
  'chart_samples',
  'deployment_stats',
  'deployment_readings',
  'readings',
  'all_readings',
  'all_readings_range',
  'alert_states',
  'distinct_locations',
  'deployment',
]);

export async function POST(request: NextRequest) {
  // Validate guest token
  const guestToken = request.cookies.get('guest_token')?.value;
  const validToken = process.env.GUEST_VIEW_TOKEN;
  if (!guestToken || !validToken || guestToken !== validToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit by IP
  const ip = getClientIp(request);
  if (!checkGuestRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please slow down.' },
      { status: 429 }
    );
  }

  const { action, params } = await request.json();
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  try {
    const supabase = getServerClient();
    const data = await executeAction(supabase, action, params || {});
    return NextResponse.json({ data });
  } catch (err) {
    console.error('Guest data error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeAction(supabase: any, action: string, params: any) {
  switch (action) {
    case 'devices': {
      const activeOnly = params.activeOnly ?? true;
      let query = supabase
        .from('devices')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

    case 'dashboard_live': {
      const { deviceIds, sparklineStart, sparklineBucketMinutes } = params;
      if (!deviceIds?.length) return [];
      const { data, error } = await supabase.rpc('get_dashboard_live', {
        p_device_ids: deviceIds,
        p_sparkline_start: sparklineStart,
        p_sparkline_bucket_minutes: sparklineBucketMinutes || 15,
      });
      if (error) throw error;
      return data || [];
    }

    case 'device_stats': {
      const { start, end, device_id } = params;
      const { data, error } = await supabase.rpc('get_device_stats', {
        p_start: start,
        p_end: end,
        p_device_id: device_id || null,
      });
      if (error) throw error;
      return data || [];
    }

    case 'deployments': {
      const { deviceId, activeOnly } = params;
      const { data, error } = await supabase.rpc(
        'get_deployments_with_counts',
        {
          p_device_id: deviceId || null,
          p_active_only: activeOnly || false,
        }
      );
      if (error) throw error;
      return data || [];
    }

    case 'active_deployments': {
      const { deviceIds } = params;
      if (!deviceIds?.length) return [];
      const { data, error } = await supabase
        .from('deployments')
        .select('*')
        .in('device_id', deviceIds)
        .is('ended_at', null)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }

    case 'chart_samples': {
      const { start, end, bucketSeconds, device_id, maxRows } = params;
      const bucketMinutes = Math.max(
        1,
        Math.round((bucketSeconds || 60) / 60)
      );
      let query = supabase.rpc('get_chart_samples', {
        p_start: start,
        p_end: end,
        p_bucket_minutes: bucketMinutes,
        p_device_id: device_id || null,
      });
      if (maxRows) query = query.limit(maxRows);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

    case 'deployment_stats': {
      const { deploymentIds } = params;
      if (!deploymentIds?.length) return [];
      const { data, error } = await supabase.rpc('get_deployment_stats', {
        deployment_ids: deploymentIds,
      });
      if (error) throw error;
      return data || [];
    }

    case 'deployment': {
      const { id } = params;
      const { data, error } = await supabase
        .from('deployments')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    case 'deployment_readings': {
      const { deploymentId, limit, options } = params;
      // Fetch the deployment first
      const { data: dep, error: depErr } = await supabase
        .from('deployments')
        .select('*')
        .eq('id', deploymentId)
        .single();
      if (depErr || !dep) return [];

      const depStartMs = new Date(dep.started_at).getTime();
      const depEndMs = new Date(dep.ended_at || new Date().toISOString()).getTime();
      const reqStartMs = options?.start ? new Date(options.start).getTime() : depStartMs;
      const reqEndMs = options?.end ? new Date(options.end).getTime() : depEndMs;
      if (!Number.isFinite(reqStartMs) || !Number.isFinite(reqEndMs)) return [];

      const clampedStart = new Date(Math.max(depStartMs, reqStartMs)).toISOString();
      const clampedEnd = new Date(Math.min(depEndMs, reqEndMs)).toISOString();
      if (new Date(clampedStart) > new Date(clampedEnd)) return [];

      const preferLatest = Boolean(limit) && (options?.preferLatest ?? false);

      if (limit) {
        const { data, error } = await supabase
          .from('readings')
          .select('*')
          .eq('device_id', dep.device_id)
          .gte('created_at', clampedStart)
          .lte('created_at', clampedEnd)
          .order('created_at', { ascending: !preferLatest })
          .order('id', { ascending: !preferLatest })
          .limit(limit);
        if (error) throw error;
        const rows = data || [];
        if (!preferLatest) return rows;
        return [...rows].sort(
          (a: { created_at: string }, b: { created_at: string }) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }

      // Paginated fetch (capped at 5000 for guests)
      const pageSize = 1000;
      const maxGuest = 5000;
      const rows: unknown[] = [];
      for (let from = 0; rows.length < maxGuest; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from('readings')
          .select('*')
          .eq('device_id', dep.device_id)
          .gte('created_at', clampedStart)
          .lte('created_at', clampedEnd)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        const page = data || [];
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      return rows;
    }

    case 'readings': {
      const { deviceId, hoursAgo, maxRows } = params;
      const since = new Date(Date.now() - hoursAgo * 3600_000).toISOString();
      let query = supabase
        .from('readings')
        .select('*')
        .eq('device_id', deviceId)
        .gte('created_at', since)
        .order('created_at', { ascending: true });
      if (maxRows) query = query.limit(maxRows);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

    case 'all_readings': {
      const { hoursAgo, maxRows } = params;
      const since = new Date(Date.now() - hoursAgo * 3600_000).toISOString();
      let query = supabase
        .from('readings')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: true });
      if (maxRows) query = query.limit(maxRows);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

    case 'all_readings_range': {
      const { start, end, device_id, maxRows } = params;
      let query = supabase
        .from('readings')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: true });
      if (device_id) query = query.eq('device_id', device_id);
      if (maxRows) query = query.limit(maxRows);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

    case 'alert_states': {
      const { deviceIds } = params;
      if (!deviceIds?.length) return [];
      const { data, error } = await supabase
        .from('device_alert_state')
        .select('device_id, status, last_seen_at, updated_at')
        .in('device_id', deviceIds);
      if (error) throw error;
      return data || [];
    }

    case 'distinct_locations': {
      const { data, error } = await supabase
        .from('deployments')
        .select('location')
        .order('location');
      if (error) throw error;
      return [...new Set((data || []).map((d: { location: string }) => d.location))];
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
