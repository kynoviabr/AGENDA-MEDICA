ALTER TABLE public.class_entities
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS linked_professionals text;

