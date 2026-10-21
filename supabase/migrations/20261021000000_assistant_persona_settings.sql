-- Each clinic names its WhatsApp assistant and can describe how it talks.
ALTER TABLE public.whatsapp_ai_settings
  ADD COLUMN IF NOT EXISTS assistant_name text NOT NULL DEFAULT 'Aura',
  ADD COLUMN IF NOT EXISTS assistant_personality text;

ALTER TABLE public.whatsapp_ai_settings
  DROP CONSTRAINT IF EXISTS whatsapp_ai_settings_assistant_name_length,
  ADD CONSTRAINT whatsapp_ai_settings_assistant_name_length
    CHECK (char_length(btrim(assistant_name)) BETWEEN 1 AND 40),
  DROP CONSTRAINT IF EXISTS whatsapp_ai_settings_assistant_personality_length,
  ADD CONSTRAINT whatsapp_ai_settings_assistant_personality_length
    CHECK (assistant_personality IS NULL OR char_length(assistant_personality) <= 500);
