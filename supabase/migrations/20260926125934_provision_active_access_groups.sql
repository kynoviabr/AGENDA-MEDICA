-- Provision active access groups after the legacy menu modules were removed.
-- Idempotent by design: existing groups, permissions and assignments are preserved.

WITH clinics AS (
  SELECT id AS clinic_id FROM public.clinics
),
base_groups AS (
  SELECT clinic_id, 'Admin'::text AS name, 'admin'::text AS code
  FROM clinics
  UNION ALL SELECT clinic_id, 'Gestor', 'gestor' FROM clinics
  UNION ALL SELECT clinic_id, 'Comercial', 'comercial' FROM clinics
  UNION ALL SELECT clinic_id, 'Recepção', 'recepcao' FROM clinics
  UNION ALL SELECT clinic_id, 'Profissionais', 'profissionais' FROM clinics
  UNION ALL SELECT clinic_id, 'Financeiro', 'financeiro' FROM clinics
  UNION ALL SELECT clinic_id, 'Operação', 'operacao' FROM clinics
  UNION ALL SELECT clinic_id, 'Somente Consulta', 'consulta' FROM clinics
)
INSERT INTO public.access_groups (clinic_id, name, code, is_system, status)
SELECT clinic_id, name, code, true, 'active'
FROM base_groups
ON CONFLICT (clinic_id, code) DO NOTHING;

WITH active_permissions(permission_key) AS (
  VALUES
    ('dashboard.view'), ('crm.view'), ('whatsapp_ai.view'), ('patients.view'),
    ('treatments.view'), ('appointments.view'), ('settings.view')
),
allowed(code, permission_key) AS (
  SELECT 'admin', permission_key FROM active_permissions
  UNION ALL SELECT 'gestor', permission_key FROM active_permissions
  UNION ALL SELECT 'comercial', permission_key FROM active_permissions
    WHERE permission_key IN ('dashboard.view', 'crm.view', 'whatsapp_ai.view', 'patients.view', 'treatments.view')
  UNION ALL SELECT 'recepcao', permission_key FROM active_permissions
    WHERE permission_key IN ('dashboard.view', 'crm.view', 'whatsapp_ai.view', 'patients.view', 'treatments.view', 'appointments.view')
  UNION ALL SELECT 'profissionais', permission_key FROM active_permissions
    WHERE permission_key IN ('dashboard.view', 'patients.view', 'treatments.view', 'appointments.view')
  UNION ALL SELECT 'financeiro', permission_key FROM active_permissions
    WHERE permission_key = 'dashboard.view'
  UNION ALL SELECT 'operacao', permission_key FROM active_permissions
    WHERE permission_key IN ('dashboard.view', 'patients.view', 'appointments.view')
  UNION ALL SELECT 'consulta', permission_key FROM active_permissions
    WHERE permission_key = 'dashboard.view'
)
INSERT INTO public.access_group_permissions (clinic_id, group_id, permission_key, can_view)
SELECT ag.clinic_id, ag.id, allowed.permission_key, true
FROM public.access_groups ag
JOIN allowed ON allowed.code = ag.code
WHERE ag.is_system = true AND ag.status = 'active'
ON CONFLICT (group_id, permission_key) DO NOTHING;

INSERT INTO public.user_access_groups (clinic_id, user_id, group_id, is_active)
SELECT ur.clinic_id, ur.user_id, ag.id, true
FROM public.user_roles ur
JOIN public.access_groups ag
  ON ag.clinic_id = ur.clinic_id
 AND ag.code = CASE ur.role::text
   WHEN 'admin' THEN 'admin'
   WHEN 'sales' THEN 'comercial'
   WHEN 'receptionist' THEN 'recepcao'
   WHEN 'professional' THEN 'profissionais'
   ELSE 'consulta'
 END
WHERE ur.is_active = true
ON CONFLICT (clinic_id, user_id, group_id) DO UPDATE
SET is_active = EXCLUDED.is_active;
