BEGIN;

DO $$
DECLARE
  manager_nullable text;
  reception_nullable text;
  manager_fk_count integer;
  reception_fk_count integer;
  admin_update_policy_count integer;
BEGIN
  SELECT is_nullable INTO manager_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'clinics' AND column_name = 'administrative_manager_name';

  SELECT is_nullable INTO reception_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'clinics' AND column_name = 'reception_contact_name';

  IF manager_nullable IS DISTINCT FROM 'YES' OR reception_nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'TEST_FAILED: administrative contact columns must exist and remain nullable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clinics'::regclass
      AND conname = 'clinics_administrative_manager_name_length'
      AND pg_get_constraintdef(oid) LIKE '%160%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clinics'::regclass
      AND conname = 'clinics_reception_contact_name_length'
      AND pg_get_constraintdef(oid) LIKE '%160%'
  ) THEN
    RAISE EXCEPTION 'TEST_FAILED: administrative contact length constraints are missing';
  END IF;

  SELECT count(*) INTO manager_fk_count
  FROM information_schema.key_column_usage usage
  JOIN information_schema.table_constraints constraint_info
    ON constraint_info.constraint_name = usage.constraint_name
   AND constraint_info.constraint_schema = usage.constraint_schema
  WHERE usage.table_schema = 'public' AND usage.table_name = 'clinics'
    AND usage.column_name = 'administrative_manager_name'
    AND constraint_info.constraint_type = 'FOREIGN KEY';

  SELECT count(*) INTO reception_fk_count
  FROM information_schema.key_column_usage usage
  JOIN information_schema.table_constraints constraint_info
    ON constraint_info.constraint_name = usage.constraint_name
   AND constraint_info.constraint_schema = usage.constraint_schema
  WHERE usage.table_schema = 'public' AND usage.table_name = 'clinics'
    AND usage.column_name = 'reception_contact_name'
    AND constraint_info.constraint_type = 'FOREIGN KEY';

  IF manager_fk_count <> 0 OR reception_fk_count <> 0 THEN
    RAISE EXCEPTION 'TEST_FAILED: administrative contact names must not reference users or staff';
  END IF;

  SELECT count(*) INTO admin_update_policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'clinics'
    AND cmd = 'UPDATE' AND policyname = 'Admin can update their clinic';

  IF admin_update_policy_count <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: existing tenant-scoped clinic admin update policy changed';
  END IF;
END;
$$;

ROLLBACK;
