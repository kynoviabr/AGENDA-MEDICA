import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AiMediaProcessingError,
  AiMessageIngestionService,
  AudioMessageProcessor,
  DEFAULT_AI_MODEL_CONFIGURATION,
  DocumentMessageProcessor,
  ImageMessageProcessor,
  OpenAiConversationInterpreter,
  OpenAiTranscriptionProvider,
  OpenAiVisionProvider,
  SupabaseAiClinicConfigLoader,
  SupabaseAiConversationHistoryLoader,
  SupabaseAiConversationStateRepository,
  SupabaseAiUsageRecorder,
  TextMessageProcessor,
  WhatsappAuraAiBridge,
  AuraAiOrchestrator,
  AuraConversationEngine,
  AuraSchedulingToolExecutor,
  AuraToolCoordinator,
  ConversationStateToolPlanner,
  OpenAiToolResponseComposer,
  SupabaseAiToolAuditRecorder,
  SupabaseAiToolMutationGuard,
  decideWhatsappAiExecution,
  type AiInboundMessage,
  type AiLoadedMedia,
  type AiMediaLoader,
  type AiMessageType,
  type AiSupabaseClientLike,
  type WhatsappAiEngineMode,
} from "../../../src/ai/index.ts";
import { SchedulingService } from "../../../src/scheduling/services/SchedulingService.ts";
import { InternalSchedulingProvider } from "../../../src/scheduling/providers/internal/InternalSchedulingProvider.ts";
import { SupabaseInternalSchedulingDataSource } from "../../../src/scheduling/providers/internal/SupabaseInternalSchedulingDataSource.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

type InboundMessage = {
  messageId: string | null;
  from: string;
  text: string;
  messageType: AiMessageType;
  mediaId: string | null;
  mimeType: string | null;
  fileName: string | null;
  contactName: string | null;
  phoneNumberId: string;
};

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractInboundMessages(body: Record<string, unknown>): InboundMessage[] {
  const entry = Array.isArray(body.entry) ? body.entry : [];
  const messages: InboundMessage[] = [];

  for (const entryItem of entry) {
    const changes = Array.isArray(entryItem?.changes) ? entryItem.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const rawMessages = Array.isArray(value.messages) ? value.messages : [];
      const phoneNumberId = String(value?.metadata?.phone_number_id || "");

      for (const rawMessage of rawMessages) {
        const messageType = String(rawMessage?.type || "text") as AiMessageType;
        if (!["text", "audio", "image", "document"].includes(messageType)) continue;
        const mediaPayload = messageType === "text" ? null : rawMessage?.[messageType];
        const text = messageType === "text" ? String(rawMessage?.text?.body || "").trim() : "";
        const from = normalizePhone(String(rawMessage?.from || ""));
        const mediaId = mediaPayload?.id ? String(mediaPayload.id) : null;
        if ((!text && !mediaId) || !from || !phoneNumberId) continue;

        const contact = contacts.find((item: Record<string, unknown>) => {
          return normalizePhone(String(item?.wa_id || "")) === from;
        });

        messages.push({
          messageId: rawMessage?.id ? String(rawMessage.id) : null,
          from,
          text,
          messageType,
          mediaId,
          mimeType: mediaPayload?.mime_type ? String(mediaPayload.mime_type) : null,
          fileName: mediaPayload?.filename ? String(mediaPayload.filename) : null,
          contactName: contact?.profile?.name ? String(contact.profile.name).trim() : null,
          phoneNumberId,
        });
      }
    }
  }

  return messages;
}

class MetaWhatsAppMediaLoader implements AiMediaLoader {
  constructor(private readonly accessToken: string, private readonly graphVersion: string) {}

  async load(mediaId: string, signal?: AbortSignal): Promise<AiLoadedMedia> {
    const metadataResponse = await fetch(`https://graph.facebook.com/${this.graphVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }, signal,
    });
    if (!metadataResponse.ok) throw new AiMediaProcessingError("WhatsApp media metadata could not be loaded.");
    const metadata = await metadataResponse.json() as Record<string, unknown>;
    const mediaUrl = typeof metadata.url === "string" ? metadata.url : "";
    if (!mediaUrl) throw new AiMediaProcessingError("WhatsApp media URL was not returned.");
    const declaredSize = Number(metadata.file_size || 0);
    if (declaredSize > 16 * 1024 * 1024) throw new AiMediaProcessingError("WhatsApp media exceeds the platform limit.");

    const mediaResponse = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` }, signal,
    });
    if (!mediaResponse.ok) throw new AiMediaProcessingError("WhatsApp media could not be downloaded.");
    const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
    if (bytes.byteLength > 16 * 1024 * 1024) throw new AiMediaProcessingError("WhatsApp media exceeds the platform limit.");
    return {
      bytes,
      size: bytes.byteLength,
      mimeType: String(metadata.mime_type || mediaResponse.headers.get("content-type") || "application/octet-stream"),
    };
  }
}

async function verifyMetaSignature(req: Request, rawBody: string) {
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) return false;

  const signature = req.headers.get("x-hub-signature-256") || "";
  const expectedPrefix = "sha256=";
  if (!signature.startsWith(expectedPrefix)) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signature.slice(expectedPrefix.length) === hash;
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
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivValue) },
    key,
    fromBase64(encryptedValue),
  );
  return new TextDecoder().decode(decrypted);
}

async function sendWhatsAppText(to: string, body: string, accessToken: string, phoneNumberId: string) {

  const graphVersion = Deno.env.get("META_GRAPH_API_VERSION") || "v23.0";
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`meta_cloud_api_${response.status}`);
  }
  return payload;
}

function extractOpenAIText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();

  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const contentItem of content) {
      if (typeof contentItem?.text === "string") parts.push(contentItem.text);
    }
  }
  return parts.join("\n").trim();
}

async function generateLeadReply(params: {
  clinicName: string;
  treatments: string[];
  recentMessages: Array<{ direction: string; body: string }>;
  userText: string;
  modelOverride?: string | null;
  defaultGoal?: string | null;
  handoffMessage?: string | null;
}) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const model = params.modelOverride || Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna";
  const instructions = [
    `Voce e a assistente de WhatsApp da clinica ${params.clinicName}.`,
    `Objetivo: ${params.defaultGoal || "responder leads com cordialidade, tirar duvidas gerais e conduzir para uma avaliacao."}`,
    "Estilo: portugues do Brasil, humano, curto, profissional e caloroso. Use no maximo 3 frases.",
    "Nao diagnostique, nao prometa resultado estetico e nao invente precos ou disponibilidade.",
    "Quando houver interesse, colete nome, procedimento de interesse e melhor horario para contato.",
    `Se a pessoa relatar urgencia medica, reacao adversa, dor intensa ou reclamacao seria, responda: ${params.handoffMessage || "Vou chamar uma pessoa da equipe para te ajudar melhor."}`,
    params.treatments.length ? `Tratamentos cadastrados: ${params.treatments.join(", ")}.` : "Ainda nao ha lista confiavel de tratamentos cadastrada.",
  ].join("\n");

  const input = [
    ...params.recentMessages.slice(-10).map((message) => ({
      role: message.direction === "outbound" ? "assistant" : "user",
      content: message.body,
    })),
    {
      role: "user",
      content: params.userText,
    },
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      max_output_tokens: 220,
      store: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`openai_${response.status}`);
  }

  const text = extractOpenAIText(payload);
  if (!text) throw new Error("openai_empty_response");

  return {
    text,
    model,
    usage: payload.usage || {},
  };
}

function createAuraBridge(
  admin: ReturnType<typeof createClient>,
  accessToken: string,
  modelOverride?: string | null,
) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("openai_key_not_configured");
  const graphVersion = Deno.env.get("META_GRAPH_API_VERSION") || "v23.0";
  const mediaLoader = new MetaWhatsAppMediaLoader(accessToken, graphVersion);
  const transcription = new OpenAiTranscriptionProvider(
    { apiKey },
    Deno.env.get("OPENAI_TRANSCRIPTION_MODEL") || DEFAULT_AI_MODEL_CONFIGURATION.transcriptionModel,
  );
  const vision = new OpenAiVisionProvider(
    { apiKey },
    Deno.env.get("OPENAI_VISION_MODEL") || DEFAULT_AI_MODEL_CONFIGURATION.visionModel,
  );
  const ingestion = new AiMessageIngestionService({
    text: new TextMessageProcessor(),
    audio: new AudioMessageProcessor(mediaLoader, transcription),
    image: new ImageMessageProcessor(mediaLoader, vision),
    document: new DocumentMessageProcessor(),
  });
  const aiClient = admin as unknown as AiSupabaseClientLike;
  const usageRecorder = new SupabaseAiUsageRecorder(aiClient);
  const stateRepository = new SupabaseAiConversationStateRepository(aiClient);
  const conversationModel = modelOverride || Deno.env.get("OPENAI_MODEL") || DEFAULT_AI_MODEL_CONFIGURATION.llmModel;
  const conversationEngine = new AuraConversationEngine(
    new OpenAiConversationInterpreter({ apiKey }, conversationModel),
    stateRepository,
    new SupabaseAiConversationHistoryLoader(aiClient),
    usageRecorder,
    {
      historyLimit: DEFAULT_AI_MODEL_CONFIGURATION.historyLimit,
      executionPolicy: { timeoutMs: DEFAULT_AI_MODEL_CONFIGURATION.llmTimeoutMs, maxAttempts: 2 },
    },
  );
  const schedulingService = new SchedulingService(new InternalSchedulingProvider(
    new SupabaseInternalSchedulingDataSource(admin as never),
  ));
  const toolCoordinator = new AuraToolCoordinator(
    new ConversationStateToolPlanner(),
    new AuraSchedulingToolExecutor(
      schedulingService,
      undefined,
      new SupabaseAiToolAuditRecorder(aiClient),
      undefined,
      new SupabaseAiToolMutationGuard(aiClient),
    ),
    new OpenAiToolResponseComposer({ apiKey }, conversationModel),
    stateRepository,
    usageRecorder,
    { timeoutMs: DEFAULT_AI_MODEL_CONFIGURATION.llmTimeoutMs, maxAttempts: 2 },
  );
  const orchestrator = new AuraAiOrchestrator(
    conversationEngine,
    new SupabaseAiClinicConfigLoader(aiClient),
    usageRecorder,
    {},
    toolCoordinator,
  );
  return new WhatsappAuraAiBridge(ingestion, orchestrator, usageRecorder);
}

function toAuraInbound(
  inbound: InboundMessage,
  clinicId: string,
  conversationId: string,
): AiInboundMessage {
  return {
    id: inbound.messageId || crypto.randomUUID(),
    clinicId,
    conversationId,
    channel: "whatsapp",
    senderId: inbound.from,
    messageType: inbound.messageType,
    receivedAt: new Date().toISOString(),
    text: inbound.messageType === "text" ? inbound.text : undefined,
    media: inbound.messageType === "text" || !inbound.mediaId ? undefined : {
      mediaId: inbound.mediaId,
      mimeType: inbound.mimeType || "application/octet-stream",
      kind: inbound.messageType,
      source: "whatsapp",
      fileName: inbound.fileName || undefined,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const verifyToken = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN") || "";
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") || "";
    if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("SUPABASE env vars not configured");

    const rawBody = await req.text();
    if (!(await verifyMetaSignature(req, rawBody))) {
      return json({ ok: false, reason: "invalid_meta_signature" }, 401);
    }

    const body = JSON.parse(rawBody || "{}");
    const inboundMessages = extractInboundMessages(body);
    if (!inboundMessages.length) {
      return json({ ok: true, ignored: true, reason: "no_text_messages" });
    }

    const processing = (async () => {
      const admin = createClient(supabaseUrl, serviceRole);
      const processed: Record<string, unknown>[] = [];

      for (const inbound of inboundMessages) {
      const { data: connection, error: connectionError } = await admin
        .from("whatsapp_connections")
        .select("clinic_id, phone_number_id, token_ciphertext")
        .eq("phone_number_id", inbound.phoneNumberId)
        .eq("status", "connected")
        .maybeSingle();
      if (connectionError) throw connectionError;
      if (!connection) {
        processed.push({ messageId: inbound.messageId, status: "unknown_phone_number" });
        continue;
      }
      const clinicId = connection.clinic_id;
      const accessToken = await decryptToken(connection.token_ciphertext);
      const [{ data: clinic, error: clinicError }, { data: settings }, { data: treatments }] = await Promise.all([
        admin.from("clinics").select("id, name").eq("id", clinicId).maybeSingle(),
        admin.from("whatsapp_ai_settings").select("is_enabled, openai_model, default_goal, handoff_message, ai_engine_mode, preferred_language, response_style").eq("clinic_id", clinicId).maybeSingle(),
        admin.from("treatments").select("name").eq("clinic_id", clinicId).eq("is_active", true).order("name").limit(20),
      ]);
      if (clinicError) throw clinicError;
      if (!clinic) throw new Error("clinic_not_found");

      if (inbound.messageId) {
        const { data: existing } = await admin
          .from("whatsapp_ai_messages")
          .select("id")
          .eq("provider_message_id", inbound.messageId)
          .maybeSingle();
        if (existing) {
          processed.push({ messageId: inbound.messageId, status: "duplicate_ignored" });
          continue;
        }
      }

      const { data: existingLead, error: leadLookupError } = await admin
        .from("leads")
        .select("id, full_name, notes")
        .eq("clinic_id", clinicId)
        .eq("phone", inbound.from)
        .is("deleted_at", null)
        .maybeSingle();
      if (leadLookupError) throw leadLookupError;

      let lead = existingLead;
      if (!lead) {
        const { data: newLead, error: leadInsertError } = await admin
          .from("leads")
          .insert({
            clinic_id: clinicId,
            full_name: inbound.contactName || `Lead WhatsApp ${inbound.from}`,
            phone: inbound.from,
            source: "whatsapp_ai",
            kanban_stage: "new_lead",
            notes: "Lead criado automaticamente pela IA do WhatsApp.",
            last_interaction_at: new Date().toISOString(),
          })
          .select("id, full_name, notes")
          .single();
        if (leadInsertError) throw leadInsertError;
        lead = newLead;
      } else {
        await admin
          .from("leads")
          .update({ last_interaction_at: new Date().toISOString() })
          .eq("id", lead.id);
      }

      const { data: currentConversation, error: currentConversationError } = await admin
        .from("whatsapp_ai_conversations")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("phone", inbound.from)
        .maybeSingle();
      if (currentConversationError) throw currentConversationError;

      const conversationPayload = {
        clinic_id: clinicId,
        lead_id: lead.id,
        phone: inbound.from,
        contact_name: inbound.contactName || lead.full_name,
        last_inbound_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        metadata: { provider: "meta_cloud_api" },
      };

      const { data: conversation, error: conversationError } = currentConversation
        ? await admin
          .from("whatsapp_ai_conversations")
          .update(conversationPayload)
          .eq("id", currentConversation.id)
          .select("*")
          .single()
        : await admin
          .from("whatsapp_ai_conversations")
          .insert({
            ...conversationPayload,
            status: "open",
            ai_enabled: true,
          })
          .select("*")
          .single();

      if (conversationError) throw conversationError;

      const { error: inboundInsertError } = await admin.from("whatsapp_ai_messages").insert({
        clinic_id: clinicId,
        conversation_id: conversation.id,
        lead_id: lead.id,
        direction: "inbound",
        role: "user",
        body: inbound.text || `[${inbound.messageType}]`,
        provider_message_id: inbound.messageId,
        raw_payload: { provider: "meta_cloud_api", message_type: inbound.messageType },
      });
      if (inboundInsertError) throw inboundInsertError;

      if (settings?.is_enabled === false || !conversation.ai_enabled || conversation.status !== "open") {
        processed.push({
          messageId: inbound.messageId,
          leadId: lead.id,
          conversationId: conversation.id,
          status: "stored_without_reply",
          reason: settings?.is_enabled === false ? "clinic_ai_disabled" : conversation.ai_enabled ? conversation.status : "ai_disabled",
        });
        continue;
      }

      const engineMode = (settings?.ai_engine_mode || "legacy") as WhatsappAiEngineMode;
      const decision = decideWhatsappAiExecution(engineMode);
      const correlationId = crypto.randomUUID();
      let auraReply: Awaited<ReturnType<WhatsappAuraAiBridge["process"]>> | null = null;

      if (decision.runAura) {
        try {
          auraReply = await createAuraBridge(admin, accessToken, settings?.openai_model).process({
            clinicId,
            conversationId: conversation.id,
            channel: "whatsapp",
            correlationId,
            leadId: lead.id,
          }, toAuraInbound(inbound, clinicId, conversation.id));
          if (!decision.sendAura) {
            console.info("aura_ai_shadow_completed", {
              correlationId, clinicId, conversationId: conversation.id,
              messageType: inbound.messageType, intent: auraReply.conversationIntent,
              needsClarification: auraReply.requiresClarification,
              safetyDisposition: auraReply.safetyDisposition,
            });
          }
        } catch (error) {
          const errorCode = typeof error === "object" && error && "code" in error
            ? String((error as { code: unknown }).code)
            : "AI_PROCESSING_FAILED";
          console.error("aura_ai_processing_failed", {
            correlationId, clinicId, conversationId: conversation.id,
            messageType: inbound.messageType, errorCode,
          });
          if (decision.sendAura) {
            auraReply = {
              text: settings?.handoff_message || "Não consegui processar sua mensagem agora. Vou chamar uma pessoa da equipe para ajudar.",
              provider: "aura_fallback",
              model: "controlled-fallback",
              usage: {}, latencyMs: 0, safetyDisposition: "requires_handoff",
              requiresClarification: true, requiresHandoff: true,
            };
          }
        }
      }

      let legacyReply: Awaited<ReturnType<typeof generateLeadReply>> | null = null;
      if (decision.runLegacy && inbound.messageType === "text") {
        const { data: recentMessages } = await admin
          .from("whatsapp_ai_messages")
          .select("direction, body")
          .eq("clinic_id", clinicId)
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: false })
          .limit(10);
        legacyReply = await generateLeadReply({
          clinicName: clinic.name,
          treatments: (treatments || []).map((item: { name: string }) => item.name),
          recentMessages: [...(recentMessages || [])].reverse(),
          userText: inbound.text,
          modelOverride: settings?.openai_model,
          defaultGoal: settings?.default_goal,
          handoffMessage: settings?.handoff_message,
        });
      }

      const aiReply = decision.sendAura ? auraReply : legacyReply;
      if (!aiReply) {
        processed.push({
          messageId: inbound.messageId, leadId: lead.id, conversationId: conversation.id,
          status: "stored_without_reply", reason: "engine_mode_does_not_send_this_media_type",
        });
        continue;
      }

      const whatsappResponse = await sendWhatsAppText(inbound.from, aiReply.text, accessToken, connection.phone_number_id);
      const outboundMessageId = whatsappResponse?.messages?.[0]?.id ? String(whatsappResponse.messages[0].id) : null;
      const usage = aiReply.usage as Record<string, number | undefined>;

      await admin.from("whatsapp_ai_messages").insert({
        clinic_id: clinicId,
        conversation_id: conversation.id,
        lead_id: lead.id,
        direction: "outbound",
        role: "assistant",
        body: aiReply.text,
        provider_message_id: outboundMessageId,
        raw_payload: { provider: "meta_cloud_api", message_type: "text" },
        ai_model: aiReply.model,
        prompt_tokens: usage.inputTokens || usage.input_tokens || usage.prompt_tokens || null,
        completion_tokens: usage.outputTokens || usage.output_tokens || usage.completion_tokens || null,
        total_tokens: usage.totalTokens || usage.total_tokens || null,
      });

      await admin
        .from("whatsapp_ai_conversations")
        .update({
          lead_id: lead.id,
          last_outbound_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);

      await admin.from("lead_interactions").insert({
        clinic_id: clinicId,
        lead_id: lead.id,
        type: "whatsapp_ai_reply",
        notes: engineMode === "active"
          ? `Aura AI respondeu uma mensagem ${inbound.messageType}. Correlação: ${correlationId}.`
          : `Lead: ${inbound.text}\n\nIA: ${aiReply.text}`,
      });

      processed.push({
        messageId: inbound.messageId,
        leadId: lead.id,
        conversationId: conversation.id,
        status: "replied",
      });
      }

      console.info("whatsapp_ai_batch_completed", { count: processed.length, processed });
    })().catch((error) => {
      console.error("whatsapp_ai_batch_failed", {
        error: (error as Error).message,
        messageCount: inboundMessages.length,
      });
    });

    EdgeRuntime.waitUntil(processing);
    return json({ ok: true, accepted: inboundMessages.length });
  } catch (error) {
    return json({ ok: false, error: (error as Error).message }, 500);
  }
});
