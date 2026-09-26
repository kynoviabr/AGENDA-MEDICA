import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeOperationalCode } from "../../../src/ai/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function decryptToken(payload: string) {
  const secret = Deno.env.get("WHATSAPP_TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) throw new Error("platform_encryption_key_not_configured");
  const [version, ivValue, encryptedValue] = payload.split(".");
  if (version !== "v1" || !ivValue || !encryptedValue) throw new Error("invalid_connection_token");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivValue) }, key, fromBase64(encryptedValue));
  return new TextDecoder().decode(decrypted);
}

async function sendText(to: string, body: string, token: string, phoneNumberId: string) {
  const version = Deno.env.get("META_GRAPH_API_VERSION") || "v23.0";
  const result = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body } }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(`meta_cloud_api_${result.status}`);
  return payload as { messages?: Array<{ id?: string }> };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ ok: false, reason: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = req.headers.get("authorization") || "";
  if (!url || !anon || !service || !authorization) return response({ ok: false, reason: "unauthorized" }, 401);

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response({ ok: false, reason: "unauthorized" }, 401);

  const payload = await req.json().catch(() => ({})) as { clinicId?: string; conversationId?: string; body?: string };
  const body = String(payload.body || "").trim();
  if (!payload.clinicId || !payload.conversationId || !body || body.length > 2000) {
    return response({ ok: false, reason: "invalid_request" }, 400);
  }

  const { data: authorized } = await userClient.rpc("authorize_human_conversation_outbound", {
    p_clinic_id: payload.clinicId, p_conversation_id: payload.conversationId,
  });
  if (authorized !== true) return response({ ok: false, reason: "handoff_not_owned" }, 403);

  const { data: conversation } = await admin.from("whatsapp_ai_conversations")
    .select("id,clinic_id,lead_id,phone,control_mode,active_handoff_id")
    .eq("id", payload.conversationId).eq("clinic_id", payload.clinicId).maybeSingle();
  const { data: connection } = await admin.from("whatsapp_connections")
    .select("phone_number_id,token_ciphertext,status")
    .eq("clinic_id", payload.clinicId).eq("status", "connected").maybeSingle();
  if (!conversation || conversation.control_mode !== "human_active" || !connection) {
    return response({ ok: false, reason: "conversation_unavailable" }, 409);
  }

  const correlationId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    await admin.rpc('record_ai_operational_event', {
      p_clinic_id: payload.clinicId, p_conversation_id: payload.conversationId, p_correlation_id: correlationId,
      p_channel: 'whatsapp', p_event_type: 'outbound_attempt', p_component: 'outbound', p_outcome: 'success',
      p_error_code: null, p_error_category: null, p_retryable: null, p_latency_ms: null,
    }).catch(() => undefined);
    const token = await decryptToken(connection.token_ciphertext);
    const meta = await sendText(conversation.phone, body, token, connection.phone_number_id);
    await admin.from("whatsapp_ai_messages").insert({
      clinic_id: payload.clinicId, conversation_id: payload.conversationId, lead_id: conversation.lead_id,
      direction: "outbound", role: "assistant", body,
      provider_message_id: meta.messages?.[0]?.id || null,
      raw_payload: { provider: "meta_cloud_api", message_type: "text" },
      message_origin: "human", actor_user_id: authData.user.id,
    });
    await admin.from("whatsapp_ai_conversations").update({
      last_outbound_at: new Date().toISOString(), last_message_at: new Date().toISOString(),
    }).eq("id", payload.conversationId).eq("clinic_id", payload.clinicId);
    await admin.rpc('record_ai_operational_event', {
      p_clinic_id: payload.clinicId, p_conversation_id: payload.conversationId, p_correlation_id: correlationId,
      p_channel: 'whatsapp', p_event_type: 'outbound_success', p_component: 'outbound', p_outcome: 'success',
      p_error_code: null, p_error_category: null, p_retryable: null, p_latency_ms: Date.now() - startedAt,
    }).catch(() => undefined);
    return response({ ok: true });
  } catch (error) {
    if (conversation.active_handoff_id) await admin.from("ai_handoff_events").insert({
      clinic_id: payload.clinicId, conversation_id: payload.conversationId,
      handoff_id: conversation.active_handoff_id, action: "outbound_failed",
      actor_user_id: authData.user.id, reason: "provider_delivery_failed",
    });
    console.error("whatsapp_human_outbound_failed", {
      clinicId: payload.clinicId, conversationId: payload.conversationId,
      errorCode: normalizeOperationalCode(error instanceof Error ? error.message : undefined, 'WHATSAPP_SEND_FAILURE'),
    });
    await admin.rpc('record_ai_operational_event', {
      p_clinic_id: payload.clinicId, p_conversation_id: payload.conversationId, p_correlation_id: correlationId,
      p_channel: 'whatsapp', p_event_type: 'outbound_failure', p_component: 'outbound', p_outcome: 'failure',
      p_error_code: 'WHATSAPP_SEND_FAILURE', p_error_category: 'whatsapp_send_failure', p_retryable: true, p_latency_ms: Date.now() - startedAt,
    }).catch(() => undefined);
    return response({ ok: false, reason: "delivery_failed" }, 502);
  }
});
