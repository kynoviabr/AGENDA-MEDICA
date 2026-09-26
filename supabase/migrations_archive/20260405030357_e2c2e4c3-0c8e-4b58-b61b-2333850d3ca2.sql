
-- NPS responses table
CREATE TABLE nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics NOT NULL,
  patient_id UUID REFERENCES patients NOT NULL,
  professional_user_id UUID,
  treatment_id UUID REFERENCES treatments,
  appointment_id UUID REFERENCES appointments,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD
CREATE POLICY "Admin manages NPS" ON nps_responses FOR ALL TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin'))
  WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- Staff (receptionist/professional): SELECT + INSERT
CREATE POLICY "Staff views NPS" ON nps_responses FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Staff creates NPS" ON nps_responses FOR INSERT TO authenticated
  WITH CHECK (is_clinic_staff(auth.uid(), clinic_id));

-- Patient: INSERT + SELECT own
CREATE POLICY "Patient creates own NPS" ON nps_responses FOR INSERT TO authenticated
  WITH CHECK (patient_id IN (SELECT get_patient_ids_for_user(auth.uid())));

CREATE POLICY "Patient views own NPS" ON nps_responses FOR SELECT TO authenticated
  USING (patient_id IN (SELECT get_patient_ids_for_user(auth.uid())));
