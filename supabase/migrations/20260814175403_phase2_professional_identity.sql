-- Phase 2: make public.professionals the canonical identity used by the agenda.
--
-- Safety strategy:
--   1. map every legacy auth.users id to professionals.id inside the same clinic;
--   2. abort the whole transaction if any agenda row cannot be mapped;
--   3. only then replace the foreign keys;
--   4. preserve professionals without a valid login by setting user_id to NULL.

LOCK TABLE public.professionals,
  public.appointments,
  public.professional_availability,
  public.appointment_blocks,
  public.appointment_waitlist,
  public.waitlist_notifications
IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  invalid_login_count bigint;
  agenda_reference_count bigint;
BEGIN
  SELECT count(*) INTO invalid_login_count
  FROM public.professionals AS professional
  WHERE professional.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = professional.user_id);

  SELECT
    (SELECT count(*) FROM public.appointments WHERE professional_id IS NOT NULL) +
    (SELECT count(*) FROM public.professional_availability) +
    (SELECT count(*) FROM public.appointment_blocks WHERE professional_id IS NOT NULL) +
    (SELECT count(*) FROM public.appointment_waitlist WHERE preferred_professional_id IS NOT NULL) +
    (SELECT count(*) FROM public.waitlist_notifications WHERE matched_professional_id IS NOT NULL)
  INTO agenda_reference_count;

  RAISE NOTICE 'Phase 2 preflight: % agenda references; % professionals with invalid login ids will be detached',
    agenda_reference_count, invalid_login_count;
END
$$;

-- The old foreign keys would reject professionals.id during the backfill.
-- Dropping them is safe here because the migration is atomic and rolls back on
-- any unresolved reference or later error.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_professional_id_fkey;
ALTER TABLE public.professional_availability
  DROP CONSTRAINT IF EXISTS professional_availability_professional_id_fkey;
ALTER TABLE public.appointment_blocks
  DROP CONSTRAINT IF EXISTS appointment_blocks_professional_id_fkey;
ALTER TABLE public.appointment_waitlist
  DROP CONSTRAINT IF EXISTS appointment_waitlist_preferred_professional_id_fkey;
ALTER TABLE public.waitlist_notifications
  DROP CONSTRAINT IF EXISTS waitlist_notifications_matched_professional_id_fkey;

-- Convert legacy agenda references while professionals.user_id still contains
-- the old auth identity, including legacy demo identities absent from auth.users.
UPDATE public.appointments AS appointment
SET professional_id = professional.id
FROM public.professionals AS professional
WHERE appointment.professional_id = professional.user_id
  AND appointment.clinic_id = professional.clinic_id;

UPDATE public.professional_availability AS availability
SET professional_id = professional.id
FROM public.professionals AS professional
WHERE availability.professional_id = professional.user_id
  AND availability.clinic_id = professional.clinic_id;

UPDATE public.appointment_blocks AS block
SET professional_id = professional.id
FROM public.professionals AS professional
WHERE block.professional_id = professional.user_id
  AND block.clinic_id = professional.clinic_id;

UPDATE public.appointment_waitlist AS waitlist
SET preferred_professional_id = professional.id
FROM public.professionals AS professional
WHERE waitlist.preferred_professional_id = professional.user_id
  AND waitlist.clinic_id = professional.clinic_id;

UPDATE public.waitlist_notifications AS notification
SET matched_professional_id = professional.id
FROM public.professionals AS professional
WHERE notification.matched_professional_id = professional.user_id
  AND notification.clinic_id = professional.clinic_id;

-- Do not silently discard an agenda relationship. A failed check rolls back all
-- updates above and reports which relation still contains legacy/unmapped ids.
DO $$
DECLARE
  unresolved jsonb;
BEGIN
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'appointments', NULLIF((SELECT count(*) FROM public.appointments a
      WHERE a.professional_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = a.professional_id AND p.clinic_id = a.clinic_id)), 0),
    'professional_availability', NULLIF((SELECT count(*) FROM public.professional_availability a
      WHERE NOT EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = a.professional_id AND p.clinic_id = a.clinic_id)), 0),
    'appointment_blocks', NULLIF((SELECT count(*) FROM public.appointment_blocks b
      WHERE b.professional_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = b.professional_id AND p.clinic_id = b.clinic_id)), 0),
    'appointment_waitlist', NULLIF((SELECT count(*) FROM public.appointment_waitlist w
      WHERE w.preferred_professional_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = w.preferred_professional_id AND p.clinic_id = w.clinic_id)), 0),
    'waitlist_notifications', NULLIF((SELECT count(*) FROM public.waitlist_notifications n
      WHERE n.matched_professional_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = n.matched_professional_id AND p.clinic_id = n.clinic_id)), 0)
  )) INTO unresolved;

  IF unresolved <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Phase 2 aborted. Unmapped professional references: %', unresolved;
  END IF;
END
$$;

-- A login is optional. Invalid legacy/demo login ids are retained as
-- professionals but detached from Supabase Auth.
ALTER TABLE public.professionals ALTER COLUMN user_id DROP NOT NULL;

UPDATE public.professionals AS professional
SET user_id = NULL
WHERE professional.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = professional.user_id
  );

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_user_id_fkey;

ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Replace auth.users foreign keys with professionals foreign keys.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_professional_id_fkey;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_professional_id_fkey
  FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE RESTRICT;

ALTER TABLE public.professional_availability
  DROP CONSTRAINT IF EXISTS professional_availability_professional_id_fkey;
ALTER TABLE public.professional_availability
  ADD CONSTRAINT professional_availability_professional_id_fkey
  FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE CASCADE;

ALTER TABLE public.appointment_blocks
  DROP CONSTRAINT IF EXISTS appointment_blocks_professional_id_fkey;
ALTER TABLE public.appointment_blocks
  ADD CONSTRAINT appointment_blocks_professional_id_fkey
  FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE CASCADE;

ALTER TABLE public.appointment_waitlist
  DROP CONSTRAINT IF EXISTS appointment_waitlist_preferred_professional_id_fkey;
ALTER TABLE public.appointment_waitlist
  ADD CONSTRAINT appointment_waitlist_preferred_professional_id_fkey
  FOREIGN KEY (preferred_professional_id) REFERENCES public.professionals(id) ON DELETE SET NULL;

ALTER TABLE public.waitlist_notifications
  DROP CONSTRAINT IF EXISTS waitlist_notifications_matched_professional_id_fkey;
ALTER TABLE public.waitlist_notifications
  ADD CONSTRAINT waitlist_notifications_matched_professional_id_fkey
  FOREIGN KEY (matched_professional_id) REFERENCES public.professionals(id) ON DELETE SET NULL;

-- The simple foreign keys protect identity; these triggers additionally ensure
-- the referenced professional belongs to the same tenant as the agenda row.
CREATE OR REPLACE FUNCTION public.enforce_agenda_professional_clinic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  professional_column text := TG_ARGV[0];
  professional_value uuid;
BEGIN
  professional_value := NULLIF(to_jsonb(NEW) ->> professional_column, '')::uuid;
  IF professional_value IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.professionals AS professional
    WHERE professional.id = professional_value
      AND professional.clinic_id = NEW.clinic_id
  ) THEN
    RAISE EXCEPTION 'Professional % does not belong to clinic %', professional_value, NEW.clinic_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.enforce_agenda_professional_clinic() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_appointments_professional_clinic
  BEFORE INSERT OR UPDATE OF clinic_id, professional_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('professional_id');

CREATE TRIGGER enforce_availability_professional_clinic
  BEFORE INSERT OR UPDATE OF clinic_id, professional_id ON public.professional_availability
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('professional_id');

CREATE TRIGGER enforce_blocks_professional_clinic
  BEFORE INSERT OR UPDATE OF clinic_id, professional_id ON public.appointment_blocks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('professional_id');

CREATE TRIGGER enforce_waitlist_professional_clinic
  BEFORE INSERT OR UPDATE OF clinic_id, preferred_professional_id ON public.appointment_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('preferred_professional_id');

CREATE TRIGGER enforce_waitlist_notification_professional_clinic
  BEFORE INSERT OR UPDATE OF clinic_id, matched_professional_id ON public.waitlist_notifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('matched_professional_id');

-- Indexes match the tenant-scoped lookups used by the UI and jobs.
CREATE INDEX IF NOT EXISTS idx_professionals_clinic_status_name
  ON public.professionals (clinic_id, status, full_name);
CREATE INDEX IF NOT EXISTS idx_professionals_user_id
  ON public.professionals (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_professional_start
  ON public.appointments (clinic_id, professional_id, start_time);
CREATE INDEX IF NOT EXISTS idx_professional_availability_clinic_professional_day
  ON public.professional_availability (clinic_id, professional_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_appointment_blocks_clinic_professional_start
  ON public.appointment_blocks (clinic_id, professional_id, start_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_clinic_professional_status
  ON public.appointment_waitlist (clinic_id, preferred_professional_id, status);

COMMENT ON COLUMN public.professionals.user_id IS
  'Optional Supabase Auth login. The professional can operate in the agenda without a user account.';
COMMENT ON COLUMN public.appointments.professional_id IS
  'Canonical professional identity; references public.professionals.id.';
