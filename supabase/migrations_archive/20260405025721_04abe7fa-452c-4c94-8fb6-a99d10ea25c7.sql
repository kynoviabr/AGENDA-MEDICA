
-- Combos comerciais
CREATE TABLE treatment_combos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics NOT NULL,
  name TEXT NOT NULL,
  promotional_price NUMERIC(10,2),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Itens do combo
CREATE TABLE treatment_combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID REFERENCES treatment_combos NOT NULL,
  treatment_id UUID REFERENCES treatments NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE treatment_combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_combo_items ENABLE ROW LEVEL SECURITY;

-- Policies for treatment_combos
CREATE POLICY "Staff views combos" ON treatment_combos FOR SELECT TO authenticated
  USING (is_clinic_staff(auth.uid(), clinic_id));

CREATE POLICY "Admin creates combos" ON treatment_combos FOR INSERT TO authenticated
  WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));

CREATE POLICY "Admin updates combos" ON treatment_combos FOR UPDATE TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

CREATE POLICY "Admin deletes combos" ON treatment_combos FOR DELETE TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- Policies for treatment_combo_items
CREATE POLICY "Staff views combo items" ON treatment_combo_items FOR SELECT TO authenticated
  USING (combo_id IN (SELECT id FROM treatment_combos WHERE is_clinic_staff(auth.uid(), clinic_id)));

CREATE POLICY "Admin creates combo items" ON treatment_combo_items FOR INSERT TO authenticated
  WITH CHECK (combo_id IN (SELECT id FROM treatment_combos WHERE has_clinic_role(auth.uid(), clinic_id, 'admin')));

CREATE POLICY "Admin updates combo items" ON treatment_combo_items FOR UPDATE TO authenticated
  USING (combo_id IN (SELECT id FROM treatment_combos WHERE has_clinic_role(auth.uid(), clinic_id, 'admin')));

CREATE POLICY "Admin deletes combo items" ON treatment_combo_items FOR DELETE TO authenticated
  USING (combo_id IN (SELECT id FROM treatment_combos WHERE has_clinic_role(auth.uid(), clinic_id, 'admin')));
