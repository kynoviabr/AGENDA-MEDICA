
-- 1. Add missing columns to clinics
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS support_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS white_label_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_name TEXT NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- 2. Create patient_portal_access table
CREATE TABLE public.patient_portal_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  access_status TEXT NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(patient_id, auth_user_id)
);

ALTER TABLE public.patient_portal_access ENABLE ROW LEVEL SECURITY;

-- Staff can manage portal access for their clinic
CREATE POLICY "Staff manages portal access"
  ON public.patient_portal_access FOR ALL
  TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id))
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

-- Patient can view own portal access
CREATE POLICY "Patient views own portal access"
  ON public.patient_portal_access FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- 3. Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  user_id UUID,
  channel TEXT NOT NULL DEFAULT 'in_app',
  title TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Staff can manage notifications for their clinic
CREATE POLICY "Staff manages notifications"
  ON public.notifications FOR ALL
  TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id))
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

-- Patient views own notifications
CREATE POLICY "Patient views own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (patient_id IN (SELECT get_patient_ids_for_user(auth.uid())));

-- Patient can mark own notifications as read
CREATE POLICY "Patient updates own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (patient_id IN (SELECT get_patient_ids_for_user(auth.uid())));

-- Indexes
CREATE INDEX idx_patient_portal_access_clinic ON public.patient_portal_access(clinic_id);
CREATE INDEX idx_patient_portal_access_patient ON public.patient_portal_access(patient_id);
CREATE INDEX idx_patient_portal_access_auth_user ON public.patient_portal_access(auth_user_id);
CREATE INDEX idx_notifications_clinic ON public.notifications(clinic_id);
CREATE INDEX idx_notifications_patient ON public.notifications(patient_id);
CREATE INDEX idx_notifications_status ON public.notifications(status);

-- Updated_at triggers
CREATE TRIGGER update_patient_portal_access_updated_at
  BEFORE UPDATE ON public.patient_portal_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
