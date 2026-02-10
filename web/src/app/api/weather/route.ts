import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeUsZipCode, toWeatherDeviceId } from '@/lib/weatherZip';

type ActiveDeployment = {
  id: number;
  device_id: string;
  zip_code: string | null;
  started_at: string;
};

type WeatherResponse = {
  current: {
    temp_c: number;
    humidity: number;
    last_updated_epoch?: number;
  };
};

type WeatherTarget = {
  deploymentId: number;
  deviceId: string;
  zipCode: string;
};

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return {
      client: null,
      error:
        'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    } as const;
  }

  return { client: createClient(url, serviceKey), error: null } as const;
}

export function getUtcHourBucketRange(now = new Date()) {
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function buildWeatherTargets(activeDeployments: ActiveDeployment[]) {
  const latestByDevice = new Map<
    string,
    WeatherTarget & { startedAtMs: number }
  >();
  let invalidZipCount = 0;
  let duplicateActiveDeviceCount = 0;

  for (const dep of activeDeployments) {
    const normalizedZip = normalizeUsZipCode(dep.zip_code);
    if (!normalizedZip) {
      invalidZipCount++;
      continue;
    }

    const startedAtMs = new Date(dep.started_at).getTime();
    const normalizedStartedAtMs = Number.isFinite(startedAtMs) ? startedAtMs : 0;

    const existing = latestByDevice.get(dep.device_id);
    if (!existing || normalizedStartedAtMs > existing.startedAtMs) {
      if (existing) duplicateActiveDeviceCount++;
      latestByDevice.set(dep.device_id, {
        deploymentId: dep.id,
        deviceId: dep.device_id,
        zipCode: normalizedZip,
        startedAtMs: normalizedStartedAtMs,
      });
      continue;
    }

    duplicateActiveDeviceCount++;
  }

  const targetsByZip = new Map<string, WeatherTarget[]>();
  for (const target of latestByDevice.values()) {
    const existing = targetsByZip.get(target.zipCode) || [];
    existing.push({
      deploymentId: target.deploymentId,
      deviceId: target.deviceId,
      zipCode: target.zipCode,
    });
    targetsByZip.set(target.zipCode, existing);
  }

  return {
    targetsByZip,
    invalidZipCount,
    duplicateActiveDeviceCount,
  };
}

// Fetched by Vercel cron every 30 min to pull outdoor weather for active deployments.
// Protected by CRON_SECRET — only trusted callers should invoke this route.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');

  const expectedSecret = process.env.CRON_SECRET;
  const providedSecret = authHeader?.replace('Bearer ', '') || querySecret;

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // If missing, return early — don't break the cron
  const weatherApiKey = process.env.WEATHER_API_KEY;
  if (!weatherApiKey) {
    return NextResponse.json({
      ok: false,
      error: 'WEATHER_API_KEY not configured',
      timestamp: new Date().toISOString(),
    });
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
    // Query active deployments that have a zip code set
    const { data: deployments, error: deployError } = await supabase
      .from('deployments')
      .select('id, device_id, zip_code, started_at')
      .is('ended_at', null)
      .not('zip_code', 'is', null)
      .order('started_at', { ascending: false });

    if (deployError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to query deployments: ${deployError.message}`,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    const activeDeployments = (deployments || []) as ActiveDeployment[];
    const { targetsByZip, invalidZipCount, duplicateActiveDeviceCount } =
      buildWeatherTargets(activeDeployments);

    if (targetsByZip.size === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No active deployments with zip codes',
        invalid_zip_count: invalidZipCount,
        duplicate_active_device_count: duplicateActiveDeviceCount,
        timestamp: new Date().toISOString(),
      });
    }

    let fetchedCount = 0;
    let insertedCount = 0;
    let skippedExistingCount = 0;
    const errors: string[] = [];
    const { startIso: hourStartIso, endIso: hourEndIso } =
      getUtcHourBucketRange();

    // Fetch weather for each unique zip code
    for (const [zipCode, targets] of targetsByZip) {
      try {
        const encodedZip = encodeURIComponent(zipCode);
        const url = `https://api.weatherapi.com/v1/current.json?key=${weatherApiKey}&q=${encodedZip}`;
        const res = await fetch(url);

        if (!res.ok) {
          const body = await res.text();
          errors.push(`WeatherAPI error for ${zipCode}: ${res.status} ${body}`);
          continue;
        }

        const weather: WeatherResponse = await res.json();
        const tempC = weather.current.temp_c;
        const humidity = weather.current.humidity;

        if (!Number.isFinite(tempC) || !Number.isFinite(humidity)) {
          errors.push(`Invalid weather payload for ${zipCode}`);
          continue;
        }

        const observedAtIso = Number.isFinite(weather.current.last_updated_epoch)
          ? new Date((weather.current.last_updated_epoch as number) * 1000).toISOString()
          : new Date().toISOString();

        fetchedCount++;

        for (const target of targets) {
          const weatherDeviceId = toWeatherDeviceId(target.deviceId);
          const { count: existingCount, error: existingError } = await supabase
            .from('readings')
            .select('id', { count: 'exact', head: true })
            .eq('device_id', weatherDeviceId)
            .eq('source', 'weather')
            .gte('created_at', hourStartIso)
            .lt('created_at', hourEndIso);

          if (existingError) {
            errors.push(
              `Duplicate-check failed for ${weatherDeviceId}: ${existingError.message}`
            );
            continue;
          }

          if ((existingCount || 0) > 0) {
            skippedExistingCount++;
            continue;
          }

          const { error: insertError } = await supabase
            .from('readings')
            .insert({
              device_id: weatherDeviceId,
              temperature: tempC,
              humidity,
              source: 'weather',
              deployment_id: target.deploymentId,
              zip_code: target.zipCode,
              observed_at: observedAtIso,
            });

          if (insertError) {
            if (insertError.code === '23505') {
              skippedExistingCount++;
            } else {
              errors.push(
                `Insert failed for ${weatherDeviceId}: ${insertError.message}`
              );
            }
          } else {
            insertedCount++;
          }
        }
      } catch (fetchErr) {
        const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        errors.push(`Fetch failed for ${zipCode}: ${message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      fetched_count: fetchedCount,
      inserted_count: insertedCount,
      skipped_existing_count: skippedExistingCount,
      invalid_zip_count: invalidZipCount,
      duplicate_active_device_count: duplicateActiveDeviceCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      error: `Unexpected error: ${message}`,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
