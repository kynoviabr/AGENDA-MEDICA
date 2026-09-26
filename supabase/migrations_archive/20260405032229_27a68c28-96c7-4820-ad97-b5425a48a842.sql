
CREATE TABLE sales_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) NOT NULL,
  user_id UUID NOT NULL,
  period_type TEXT NOT NULL,
  period_reference TEXT NOT NULL,
  goal_amount NUMERIC(12,2) NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clinic_id, user_id, period_type, period_reference)
);

ALTER TABLE sales_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_sales_goals" ON sales_goals
  FOR ALL USING (
    clinic_id = auth_clinic_id()
    AND auth_user_role() IN ('admin')
  );

CREATE POLICY "own_sales_goals" ON sales_goals
  FOR SELECT USING (
    clinic_id = auth_clinic_id()
    AND user_id = auth.uid()
  );
