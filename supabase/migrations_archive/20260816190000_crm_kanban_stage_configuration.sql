-- Tenant-safe configuration of the canonical Micro CRM stages.
-- Reuses clinic_settings.crm_kanban_stages and atomically relocates current
-- cards before a stage becomes inactive.

CREATE OR REPLACE FUNCTION public.save_crm_stage_settings(
  p_clinic_id uuid,
  p_settings jsonb,
  p_relocations jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_allowed_keys constant text[] := ARRAY[
    'new_lead',
    'contacted',
    'proposal_sent',
    'scheduled',
    'closed_won',
    'closed_lost'
  ];
  v_entry jsonb;
  v_key text;
  v_target text;
  v_active_count integer;
  v_source_count integer;
  v_moved_count integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.has_clinic_role(v_actor, p_clinic_id, 'admin') THEN
    RAISE EXCEPTION 'CRM_STAGE_SETTINGS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_settings) <> 'array' OR jsonb_array_length(p_settings) <> cardinality(v_allowed_keys) THEN
    RAISE EXCEPTION 'CRM_STAGE_SETTINGS_INVALID';
  END IF;

  IF p_relocations IS NULL OR jsonb_typeof(p_relocations) <> 'object' THEN
    RAISE EXCEPTION 'CRM_STAGE_RELOCATIONS_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_settings) AS item
    WHERE jsonb_typeof(item->'code') IS DISTINCT FROM 'string'
       OR NOT (item->>'code' = ANY(v_allowed_keys))
       OR jsonb_typeof(item->'label') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'is_active') IS DISTINCT FROM 'boolean'
  ) OR (
    SELECT count(DISTINCT item->>'code')
    FROM jsonb_array_elements(p_settings) AS item
  ) <> cardinality(v_allowed_keys) THEN
    RAISE EXCEPTION 'CRM_STAGE_KEYS_INVALID';
  END IF;

  SELECT count(*) INTO v_active_count
  FROM jsonb_array_elements(p_settings) AS item
  WHERE (item->>'is_active')::boolean;

  IF v_active_count < 1 THEN
    RAISE EXCEPTION 'CRM_STAGE_AT_LEAST_ONE_ACTIVE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_settings) AS item
    WHERE (item->>'is_active')::boolean
      AND (length(btrim(item->>'label')) = 0 OR length(btrim(item->>'label')) > 60)
  ) THEN
    RAISE EXCEPTION 'CRM_STAGE_LABEL_INVALID';
  END IF;

  IF EXISTS (
    SELECT lower(btrim(item->>'label'))
    FROM jsonb_array_elements(p_settings) AS item
    WHERE (item->>'is_active')::boolean
    GROUP BY lower(btrim(item->>'label'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CRM_STAGE_LABEL_DUPLICATED';
  END IF;

  -- Serialize concurrent administrative saves for the same clinic.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinic_id::text, 0));

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_settings)
  LOOP
    v_key := v_entry->>'code';

    IF NOT (v_entry->>'is_active')::boolean THEN
      SELECT count(*) INTO v_source_count
      FROM public.leads
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND CASE kanban_stage
          WHEN 'attended' THEN 'proposal_sent'
          WHEN 'negotiating' THEN 'proposal_sent'
          WHEN 'follow_up' THEN 'closed_won'
          WHEN 'lost' THEN 'closed_lost'
          ELSE kanban_stage
        END = v_key;

      IF v_source_count > 0 THEN
        v_target := p_relocations->>v_key;

        IF v_target IS NULL OR v_target = v_key OR NOT (v_target = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'CRM_STAGE_RELOCATION_REQUIRED:%', v_key;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_settings) AS destination
          WHERE destination->>'code' = v_target
            AND (destination->>'is_active')::boolean
        ) THEN
          RAISE EXCEPTION 'CRM_STAGE_RELOCATION_TARGET_INACTIVE:%', v_key;
        END IF;

        UPDATE public.leads
        SET kanban_stage = v_target
        WHERE clinic_id = p_clinic_id
          AND deleted_at IS NULL
          AND CASE kanban_stage
            WHEN 'attended' THEN 'proposal_sent'
            WHEN 'negotiating' THEN 'proposal_sent'
            WHEN 'follow_up' THEN 'closed_won'
            WHEN 'lost' THEN 'closed_lost'
            ELSE kanban_stage
          END = v_key;

        GET DIAGNOSTICS v_source_count = ROW_COUNT;
        v_moved_count := v_moved_count + v_source_count;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.clinic_settings (clinic_id, key, value)
  VALUES (p_clinic_id, 'crm_kanban_stages', p_settings::text)
  ON CONFLICT (clinic_id, key)
  DO UPDATE SET value = EXCLUDED.value;

  RETURN jsonb_build_object(
    'clinic_id', p_clinic_id,
    'active_stage_count', v_active_count,
    'moved_lead_count', v_moved_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_crm_stage_settings(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_crm_stage_settings(uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_crm_stage_settings(uuid, jsonb, jsonb) IS
  'Validates and saves canonical CRM stage presentation per clinic, atomically relocating current leads before stage deactivation.';
