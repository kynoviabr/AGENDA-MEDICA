ALTER TABLE public.sales_goals
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.sales_goals
  ADD COLUMN IF NOT EXISTS goal_type text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS category_id uuid NULL REFERENCES public.treatment_categories(id),
  ADD COLUMN IF NOT EXISTS treatment_id uuid NULL REFERENCES public.treatments(id),
  ADD COLUMN IF NOT EXISTS team_name text NULL,
  ADD COLUMN IF NOT EXISTS period_start date NULL,
  ADD COLUMN IF NOT EXISTS period_end date NULL,
  ADD COLUMN IF NOT EXISTS notes text NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

UPDATE public.sales_goals
SET goal_type = COALESCE(goal_type, 'user'),
    status = COALESCE(status, 'active')
WHERE goal_type IS NULL
   OR status IS NULL;

ALTER TABLE public.sales_goals
  DROP CONSTRAINT IF EXISTS sales_goals_unique_scope;

DROP INDEX IF EXISTS idx_sales_goals_unique_scope_expr;
CREATE UNIQUE INDEX idx_sales_goals_unique_scope_expr
  ON public.sales_goals (
    clinic_id,
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    goal_type,
    period_type,
    period_reference,
    COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(treatment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(team_name, '')
  );

CREATE INDEX IF NOT EXISTS idx_sales_goals_status ON public.sales_goals (clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_goals_period ON public.sales_goals (clinic_id, period_type, period_reference);
