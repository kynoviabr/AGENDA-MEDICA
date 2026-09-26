-- Query and operational indexes for the 100 -> 1,000 clinic growth phase.
-- Tenant isolation remains based on clinic_id + RLS; no per-clinic schema is
-- required at this scale.

CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_messages_clinic_created
  ON public.whatsapp_ai_messages (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_messages_clinic_direction_created
  ON public.whatsapp_ai_messages (clinic_id, direction, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_conversations_clinic_status_activity
  ON public.whatsapp_ai_conversations (clinic_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_clinic_status
  ON public.whatsapp_connections (clinic_id, status);

-- Provider message IDs are globally unique and form the idempotency key used
-- when Meta retries a webhook delivery.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_ai_messages_provider_any
  ON public.whatsapp_ai_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

COMMENT ON INDEX public.idx_whatsapp_ai_messages_provider_any IS
  'Prevents duplicate processing when Meta retries an inbound or status event.';
