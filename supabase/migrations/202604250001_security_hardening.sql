-- Security hardening migration for live databases.
--
-- Safe to run more than once. It does not delete or truncate data.
-- Existing nonconforming deployment rows are left in place; NOT VALID
-- constraints still protect future inserts/updates, and validation is only
-- attempted when current data already satisfies the rule.
--
-- After this migration, legacy deployments with owner_id IS NULL remain
-- admin-editable only. To give one user ownership of old deployments, run:
--
--   UPDATE public.deployments
--   SET owner_id = '<auth-user-uuid>'
--   WHERE owner_id IS NULL;

-- ---------------------------------------------------------------------------
-- Deployment ownership + owner/admin edit rules
-- ---------------------------------------------------------------------------

ALTER TABLE public.deployments
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.deployments
  ALTER COLUMN owner_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_deployments_owner
  ON public.deployments (owner_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deployments_owner_id_fkey'
      AND conrelid = 'public.deployments'::regclass
  ) THEN
    ALTER TABLE public.deployments
      ADD CONSTRAINT deployments_owner_id_fkey
      FOREIGN KEY (owner_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.deployments d
    LEFT JOIN auth.users u ON u.id = d.owner_id
    WHERE d.owner_id IS NOT NULL
      AND u.id IS NULL
  ) THEN
    ALTER TABLE public.deployments VALIDATE CONSTRAINT deployments_owner_id_fkey;
  ELSE
    RAISE NOTICE 'Leaving deployments_owner_id_fkey NOT VALID because legacy rows reference missing auth users.';
  END IF;
END $$;

ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated all" ON public.deployments;
DROP POLICY IF EXISTS "Allow authenticated select" ON public.deployments;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.deployments;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.deployments;
DROP POLICY IF EXISTS "Allow admin delete" ON public.deployments;
DROP POLICY IF EXISTS "Admins can insert deployments" ON public.deployments;
DROP POLICY IF EXISTS "Admins can update deployments" ON public.deployments;
DROP POLICY IF EXISTS "Admins can delete deployments" ON public.deployments;
DROP POLICY IF EXISTS "Signed-in can insert own deployments" ON public.deployments;
DROP POLICY IF EXISTS "Owners or admins can update deployments" ON public.deployments;
DROP POLICY IF EXISTS "Allow anonymous select" ON public.deployments;
DROP POLICY IF EXISTS "Allow anonymous insert" ON public.deployments;
DROP POLICY IF EXISTS "Allow anonymous update" ON public.deployments;
DROP POLICY IF EXISTS "Allow anonymous delete" ON public.deployments;

CREATE POLICY "Allow authenticated select" ON public.deployments
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Signed-in can insert own deployments" ON public.deployments
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners or admins can update deployments" ON public.deployments
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete deployments" ON public.deployments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Deployment metadata constraints.
-- NOT VALID avoids rejecting legacy live data. These constraints still apply
-- to new inserts and updates immediately.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deployments_device_id_format'
      AND conrelid = 'public.deployments'::regclass
  ) THEN
    ALTER TABLE public.deployments
      ADD CONSTRAINT deployments_device_id_format
      CHECK (device_id ~ '^[a-z0-9_-]{1,32}$' AND device_id NOT LIKE 'weather_%')
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deployments_text_bounds'
      AND conrelid = 'public.deployments'::regclass
  ) THEN
    ALTER TABLE public.deployments
      ADD CONSTRAINT deployments_text_bounds
      CHECK (
        btrim(name) <> ''
        AND length(name) <= 200
        AND btrim(location) <> ''
        AND length(location) <= 200
        AND length(COALESCE(notes, '')) <= 2000
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deployments_zip_code_format'
      AND conrelid = 'public.deployments'::regclass
  ) THEN
    ALTER TABLE public.deployments
      ADD CONSTRAINT deployments_zip_code_format
      CHECK (zip_code IS NULL OR zip_code ~ '^[0-9]{5}(-[0-9]{4})?$')
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deployments_time_order'
      AND conrelid = 'public.deployments'::regclass
  ) THEN
    ALTER TABLE public.deployments
      ADD CONSTRAINT deployments_time_order
      CHECK (ended_at IS NULL OR ended_at > started_at)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deployments_device_id_fkey'
      AND conrelid = 'public.deployments'::regclass
  ) THEN
    ALTER TABLE public.deployments
      ADD CONSTRAINT deployments_device_id_fkey
      FOREIGN KEY (device_id)
      REFERENCES public.devices(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.deployments
    WHERE device_id !~ '^[a-z0-9_-]{1,32}$'
       OR device_id LIKE 'weather_%'
  ) THEN
    ALTER TABLE public.deployments VALIDATE CONSTRAINT deployments_device_id_format;
  ELSE
    RAISE NOTICE 'Leaving deployments_device_id_format NOT VALID because legacy rows violate it.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.deployments
    WHERE btrim(name) = ''
       OR length(name) > 200
       OR btrim(location) = ''
       OR length(location) > 200
       OR length(COALESCE(notes, '')) > 2000
  ) THEN
    ALTER TABLE public.deployments VALIDATE CONSTRAINT deployments_text_bounds;
  ELSE
    RAISE NOTICE 'Leaving deployments_text_bounds NOT VALID because legacy rows violate it.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.deployments
    WHERE zip_code IS NOT NULL
      AND zip_code !~ '^[0-9]{5}(-[0-9]{4})?$'
  ) THEN
    ALTER TABLE public.deployments VALIDATE CONSTRAINT deployments_zip_code_format;
  ELSE
    RAISE NOTICE 'Leaving deployments_zip_code_format NOT VALID because legacy rows violate it.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.deployments
    WHERE ended_at IS NOT NULL
      AND ended_at <= started_at
  ) THEN
    ALTER TABLE public.deployments VALIDATE CONSTRAINT deployments_time_order;
  ELSE
    RAISE NOTICE 'Leaving deployments_time_order NOT VALID because legacy rows violate it.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.deployments d
    LEFT JOIN public.devices dv ON dv.id = d.device_id
    WHERE dv.id IS NULL
  ) THEN
    ALTER TABLE public.deployments VALIDATE CONSTRAINT deployments_device_id_fkey;
  ELSE
    RAISE NOTICE 'Leaving deployments_device_id_fkey NOT VALID because legacy rows reference missing devices.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_deployment_device()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1
    FROM public.devices
    WHERE id = NEW.device_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'deployment device_id must be an active registered device';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.device_id IS DISTINCT FROM OLD.device_id THEN
    RAISE EXCEPTION 'deployment device_id cannot be changed after creation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_deployment_device_change ON public.deployments;
DROP TRIGGER IF EXISTS trg_validate_deployment_device ON public.deployments;
CREATE TRIGGER trg_validate_deployment_device
  BEFORE INSERT OR UPDATE ON public.deployments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_deployment_device();

DROP FUNCTION IF EXISTS public.prevent_deployment_device_change();

-- ---------------------------------------------------------------------------
-- Keep get_deployments_with_counts aligned with owner_id.
-- This drop/recreate changes function metadata only; it does not touch table
-- data. Existing callers keep the same arguments.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_deployments_with_counts(TEXT, BOOLEAN);

CREATE FUNCTION public.get_deployments_with_counts(
  p_device_id TEXT DEFAULT NULL,
  p_active_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id BIGINT,
  device_id TEXT,
  name TEXT,
  location TEXT,
  notes TEXT,
  zip_code TEXT,
  owner_id UUID,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  reading_count BIGINT
)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT
    d.id,
    d.device_id,
    d.name,
    d.location,
    d.notes,
    d.zip_code,
    d.owner_id,
    d.started_at,
    d.ended_at,
    d.created_at,
    COUNT(r.id) AS reading_count
  FROM public.deployments d
  LEFT JOIN public.readings r
    ON r.device_id = d.device_id
    AND r.created_at >= d.started_at
    AND r.created_at <= COALESCE(d.ended_at, NOW())
  WHERE
    (p_device_id IS NULL OR d.device_id = p_device_id)
    AND (NOT p_active_only OR d.ended_at IS NULL)
  GROUP BY d.id
  ORDER BY d.started_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_deployments_with_counts(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_deployments_with_counts(TEXT, BOOLEAN) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Harden anonymous sensor inserts.
-- Registered active devices can insert readings. Brand-new device IDs are only
-- allowed when app_settings.device_auto_register = 'true', preserving the
-- existing optional auto-registration behavior.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_registered_sensor_device(p_device_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.devices d
    WHERE d.id = p_device_id
      AND d.is_active = true
      AND p_device_id NOT LIKE 'weather_%'
  )
  OR (
    p_device_id NOT LIKE 'weather_%'
    AND NOT EXISTS (
      SELECT 1
      FROM public.devices d
      WHERE d.id = p_device_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.app_settings s
      WHERE s.key = 'device_auto_register'
        AND s.value = 'true'
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_registered_sensor_device(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_registered_sensor_device(TEXT) TO anon, authenticated, service_role;

ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous insert" ON public.readings;
DROP POLICY IF EXISTS "Allow anonymous insert validated" ON public.readings;
-- Ghost policy from an earlier schema that grants anon SELECT on every reading.
-- The anon key is shipped to the browser, so this exposes all sensor data
-- without any auth. Drop it; the authenticated SELECT policy below covers the
-- legitimate dashboard use case.
DROP POLICY IF EXISTS "Allow anonymous select" ON public.readings;
DROP POLICY IF EXISTS "Allow anonymous update" ON public.readings;
DROP POLICY IF EXISTS "Allow anonymous delete" ON public.readings;

CREATE POLICY "Allow anonymous insert validated" ON public.readings
  FOR INSERT
  TO anon
  WITH CHECK (
    device_id ~ '^[a-z0-9_-]{1,32}$'
    AND device_id NOT LIKE 'weather_%'
    AND public.is_registered_sensor_device(device_id)
    AND temperature >= -50
    AND temperature <= 100
    AND humidity >= 0
    AND humidity <= 100
    AND source = 'sensor'
    AND deployment_id IS NULL
    AND zip_code IS NULL
    AND observed_at IS NULL
  );
