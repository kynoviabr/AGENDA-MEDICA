ALTER TABLE public.treatment_categories
ADD COLUMN IF NOT EXISTS description text;
