
-- =============================================
-- 1. ALTER patient_anamneses: add new columns
-- =============================================

ALTER TABLE public.patient_anamneses
  ADD COLUMN IF NOT EXISTS anamnese_number text,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'digital',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS filled_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS validity_days integer NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS document_url text,
  ADD COLUMN IF NOT EXISTS document_name text,
  ADD COLUMN IF NOT EXISTS document_mime_type text,
  ADD COLUMN IF NOT EXISTS document_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS validated_by uuid,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

-- Backfill anamnese_number for existing rows
UPDATE public.patient_anamneses
SET anamnese_number = 'ANM-' || to_char(COALESCE(created_at, now()), 'YYYY') || '-' || lpad(
  row_number::text, 6, '0'
)
FROM (
  SELECT id AS rid, row_number() OVER (ORDER BY created_at) AS row_number
  FROM public.patient_anamneses
) sub
WHERE patient_anamneses.id = sub.rid
  AND patient_anamneses.anamnese_number IS NULL;

-- Now add constraints
ALTER TABLE public.patient_anamneses
  ALTER COLUMN anamnese_number SET NOT NULL;

ALTER TABLE public.patient_anamneses
  ADD CONSTRAINT patient_anamneses_anamnese_number_key UNIQUE (anamnese_number);

-- Migrate existing data: file_url -> document_url, uploaded_at -> document_uploaded_at, valid_until -> expires_at
UPDATE public.patient_anamneses
SET document_url = file_url,
    document_uploaded_at = uploaded_at,
    expires_at = (valid_until::timestamptz)
WHERE document_url IS NULL AND file_url IS NOT NULL;

-- =============================================
-- 2. ALTER patients: add derived columns
-- =============================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS current_anamnese_id uuid,
  ADD COLUMN IF NOT EXISTS current_anamnese_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS current_anamnese_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS has_valid_anamnese boolean NOT NULL DEFAULT false;

-- =============================================
-- 3. INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_patient_anamneses_patient_id ON public.patient_anamneses(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_anamneses_status ON public.patient_anamneses(status);
CREATE INDEX IF NOT EXISTS idx_patient_anamneses_is_current ON public.patient_anamneses(is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_patient_anamneses_expires_at ON public.patient_anamneses(expires_at);
CREATE INDEX IF NOT EXISTS idx_patient_anamneses_clinic_patient ON public.patient_anamneses(clinic_id, patient_id);

-- =============================================
-- 4. FUNCTION: Generate anamnese_number
-- =============================================

CREATE OR REPLACE FUNCTION public.generate_anamnese_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year text;
  _seq int;
BEGIN
  _year := to_char(now(), 'YYYY');
  
  SELECT COALESCE(MAX(
    NULLIF(split_part(anamnese_number, '-', 3), '')::int
  ), 0) + 1
  INTO _seq
  FROM public.patient_anamneses
  WHERE anamnese_number LIKE 'ANM-' || _year || '-%';

  NEW.anamnese_number := 'ANM-' || _year || '-' || lpad(_seq::text, 6, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_anamnese_number
  BEFORE INSERT ON public.patient_anamneses
  FOR EACH ROW
  WHEN (NEW.anamnese_number IS NULL OR NEW.anamnese_number = '')
  EXECUTE FUNCTION public.generate_anamnese_number();

-- =============================================
-- 5. TRIGGER: updated_at
-- =============================================

CREATE TRIGGER trg_anamneses_updated_at
  BEFORE UPDATE ON public.patient_anamneses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 6. FUNCTION: Calculate expires_at & enforce single current
-- =============================================

CREATE OR REPLACE FUNCTION public.anamnese_before_upsert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-calculate expires_at when filled_at is set
  IF NEW.filled_at IS NOT NULL AND (
    TG_OP = 'INSERT' OR 
    OLD.filled_at IS DISTINCT FROM NEW.filled_at OR 
    OLD.validity_days IS DISTINCT FROM NEW.validity_days
  ) THEN
    NEW.expires_at := NEW.filled_at + (NEW.validity_days || ' days')::interval;
  END IF;

  -- Auto-expire if expires_at is in the past and status is filled/validated
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at < now() AND NEW.status IN ('filled', 'validated') THEN
    NEW.status := 'expired';
  END IF;

  -- Enforce single is_current per patient
  IF NEW.is_current = true THEN
    UPDATE public.patient_anamneses
    SET is_current = false
    WHERE patient_id = NEW.patient_id
      AND id IS DISTINCT FROM NEW.id
      AND is_current = true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_anamnese_before_upsert
  BEFORE INSERT OR UPDATE ON public.patient_anamneses
  FOR EACH ROW
  EXECUTE FUNCTION public.anamnese_before_upsert();

-- =============================================
-- 7. FUNCTION: Sync derived fields to patients
-- =============================================

CREATE OR REPLACE FUNCTION public.sync_patient_anamnese_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _patient_id uuid;
  _best RECORD;
BEGIN
  _patient_id := COALESCE(NEW.patient_id, OLD.patient_id);

  -- Find best anamnese: not archived/cancelled, prefer validated > filled > in_progress > pending, most recent
  SELECT id, status, expires_at
  INTO _best
  FROM public.patient_anamneses
  WHERE patient_id = _patient_id
    AND status NOT IN ('cancelled', 'archived')
  ORDER BY
    CASE status
      WHEN 'validated' THEN 1
      WHEN 'filled' THEN 2
      WHEN 'in_progress' THEN 3
      WHEN 'pending' THEN 4
      WHEN 'expired' THEN 5
      ELSE 6
    END,
    COALESCE(filled_at, created_at) DESC
  LIMIT 1;

  IF _best IS NULL THEN
    UPDATE public.patients
    SET current_anamnese_id = NULL,
        current_anamnese_status = 'none',
        current_anamnese_expires_at = NULL,
        has_valid_anamnese = false
    WHERE id = _patient_id;
  ELSE
    -- Mark this one as current
    UPDATE public.patient_anamneses
    SET is_current = false
    WHERE patient_id = _patient_id AND id != _best.id AND is_current = true;

    UPDATE public.patient_anamneses
    SET is_current = true
    WHERE id = _best.id AND is_current = false;

    UPDATE public.patients
    SET current_anamnese_id = _best.id,
        current_anamnese_expires_at = _best.expires_at,
        current_anamnese_status = CASE
          WHEN _best.status IN ('validated', 'filled') AND (_best.expires_at IS NULL OR _best.expires_at > now()) THEN 'valid'
          WHEN _best.status = 'expired' OR (_best.expires_at IS NOT NULL AND _best.expires_at <= now()) THEN 'expired'
          WHEN _best.status IN ('pending', 'in_progress') THEN 'pending'
          ELSE 'none'
        END,
        has_valid_anamnese = CASE
          WHEN _best.status IN ('validated', 'filled') AND (_best.expires_at IS NULL OR _best.expires_at > now()) THEN true
          ELSE false
        END
    WHERE id = _patient_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_patient_anamnese
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_anamneses
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_patient_anamnese_status();

-- =============================================
-- 8. RLS POLICIES (drop old ones first, recreate)
-- =============================================

DROP POLICY IF EXISTS "Staff creates anamneses" ON public.patient_anamneses;
DROP POLICY IF EXISTS "Staff updates anamneses" ON public.patient_anamneses;
DROP POLICY IF EXISTS "Staff views anamneses" ON public.patient_anamneses;

CREATE POLICY "Staff views anamneses"
  ON public.patient_anamneses FOR SELECT
  TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Staff creates anamneses"
  ON public.patient_anamneses FOR INSERT
  TO authenticated
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Staff updates anamneses"
  ON public.patient_anamneses FOR UPDATE
  TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Patient views own anamneses"
  ON public.patient_anamneses FOR SELECT
  TO authenticated
  USING (patient_id IN (SELECT get_patient_ids_for_user(auth.uid())));

-- =============================================
-- 9. STORAGE BUCKET
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-anamneses', 'patient-anamneses', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Staff uploads anamnese docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'patient-anamneses');

CREATE POLICY "Staff views anamnese docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'patient-anamneses');

CREATE POLICY "Patient views own anamnese docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'patient-anamneses'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT get_patient_ids_for_user(auth.uid())
    )
  );
