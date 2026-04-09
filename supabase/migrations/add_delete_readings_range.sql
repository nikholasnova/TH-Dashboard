-- Migration: Add delete_readings_range RPC function
-- Safe to run: creates a new function only, does NOT modify or delete any existing data.
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

-- Scoped deletion of readings by device and time range.
-- Used by the Data Cleanup UI on the deployments page.
-- SECURITY DEFINER so it bypasses RLS (readings DELETE is service_role only).
CREATE OR REPLACE FUNCTION delete_readings_range(
  p_device_id TEXT,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_include_weather BOOLEAN DEFAULT TRUE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT := 0;
  v_sub BIGINT;
BEGIN
  DELETE FROM public.readings
    WHERE device_id = p_device_id
      AND created_at >= p_start
      AND created_at <= p_end;
  GET DIAGNOSTICS v_sub = ROW_COUNT;
  v_count := v_count + v_sub;

  IF p_include_weather THEN
    DELETE FROM public.readings
      WHERE device_id = 'weather_' || p_device_id
        AND created_at >= p_start
        AND created_at <= p_end;
    GET DIAGNOSTICS v_sub = ROW_COUNT;
    v_count := v_count + v_sub;
  END IF;

  RETURN v_count;
END;
$$;

-- Only authenticated users can call this (not anon, not public).
REVOKE EXECUTE ON FUNCTION public.delete_readings_range(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_readings_range(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated;
