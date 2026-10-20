-- Commercial team role. The internal value stays 'sales' because the
-- role -> access group mapping (sales -> comercial) already relies on it.
-- Kept alone in its own migration: a new enum value cannot be used in the
-- transaction that adds it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales';
