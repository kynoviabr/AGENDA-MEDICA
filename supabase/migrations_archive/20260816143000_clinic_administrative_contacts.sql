-- Administrative contact names belong to the clinic and do not represent users or staff memberships.
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS administrative_manager_name text,
  ADD COLUMN IF NOT EXISTS reception_contact_name text;

ALTER TABLE public.clinics
  DROP CONSTRAINT IF EXISTS clinics_administrative_manager_name_length,
  ADD CONSTRAINT clinics_administrative_manager_name_length
    CHECK (administrative_manager_name IS NULL OR char_length(btrim(administrative_manager_name)) <= 160),
  DROP CONSTRAINT IF EXISTS clinics_reception_contact_name_length,
  ADD CONSTRAINT clinics_reception_contact_name_length
    CHECK (reception_contact_name IS NULL OR char_length(btrim(reception_contact_name)) <= 160);

COMMENT ON COLUMN public.clinics.administrative_manager_name IS
  'Optional administrative manager contact name. Does not reference an Aura user.';
COMMENT ON COLUMN public.clinics.reception_contact_name IS
  'Optional secretary or reception contact name. Does not reference an Aura user.';
