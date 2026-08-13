import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

type InboundMessage = {
  messageId: string | null;
  from: string;
  text: string;
  contactName: string | null;
  raw: Record<string, unknown>;
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

      for (const rawMessage of rawMessages) {
        const text = String(rawMessage?.text?.body || "").trim();
        const from = normalizePhone(String(rawMessage?.from || ""));
        if (!text || !from) continue;

        const contact = contacts.find((item: Record<string, unknown>) => {
          return normalizePhone(String(item?.wa_id || "")) === from;
        });

        messages.push({
          messageId: rawMessage?.id ? String(rawMessage.id) : null,
          from,
          text,
          contactName: contact?.profile?.name ? String(contact.profile.name).trim() : null,
          raw: rawMessage,
        });
      }
    }
  }

  return messages;
}

async function verifyMetaSignature(req: Request, rawBody: string) {
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) return true;

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

async function sendWhatsAppText(to: string, body: string) {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!accessToken || !phoneNumberId) {
    throw new Error("WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID not configured");
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
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
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`meta_cloud_api ${response.status}: ${JSON.stringify(payload)}`);
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
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`openai ${response.status}: ${JSON.stringify(payload)}`);
  }

  const text = extractOpenAIText(payload);
  if (!text) throw new Error("openai_empty_response");

  return {
    text,
    model,
    usage: payload.usage || {},
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
    const clinicId = Deno.env.get("WHATSAPP_AI_DEFAULT_CLINIC_ID");
    if (!supabaseUrl || !serviceRole) throw new Error("SUPABASE env vars not configured");
    if (!clinicId) throw new Error("WHATSAPP_AI_DEFAULT_CLINIC_ID not configured");

    const rawBody = await req.text();
    if (!(await verifyMetaSignature(req, rawBody))) {
      return json({ ok: false, reason: "invalid_meta_signature" }, 401);
    }

    const body = JSON.parse(rawBody || "{}");
    const inboundMessages = extractInboundMessages(body);
    if (!inboundMessages.length) {
      return json({ ok: true, ignored: true, reason: "no_text_messages" });
    }

    const admin = createClient(supabaseUrl, serviceRole);
    const processed: Record<string, unknown>[] = [];

    const { data: clinic, error: clinicError } = await admin
      .from("clinics")
      .select("id, name")
      .eq("id", clinicId)
      .maybeSingle();
    if (clinicError) throw clinicError;
    if (!clinic) throw new Error("clinic_not_found");

    const { data: settings } = await admin
      .from("whatsapp_ai_settings")
      .select("is_enabled, openai_model, default_goal, handoff_message")
      .eq("clinic_id", clinicId)
      .maybeSingle();

    const { data: treatments } = await admin
      .from("treatments")
      .select("name")
      .eq("clinic_id", clinicId)
      .eq("is_active", true)
      .order("name")
      .limit(20);

    for (const inbound of inboundMessages) {
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
        body: inbound.text,
        provider_message_id: inbound.messageId,
        raw_payload: inbound.raw,
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

      const { data: recentMessages } = await admin
        .from("whatsapp_ai_messages")
        .select("direction, body")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(10);

      const aiReply = await generateLeadReply({
        clinicName: clinic.name,
        treatments: (treatments || []).map((item: { name: string }) => item.name),
        recentMessages: [...(recentMessages || [])].reverse(),
        userText: inbound.text,
        modelOverride: settings?.openai_model,
        defaultGoal: settings?.default_goal,
        handoffMessage: settings?.handoff_message,
      });

      const whatsappResponse = await sendWhatsAppText(inbound.from, aiReply.text);
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
        raw_payload: whatsappResponse,
        ai_model: aiReply.model,
        prompt_tokens: usage.input_tokens || usage.prompt_tokens || null,
        completion_tokens: usage.output_tokens || usage.completion_tokens || null,
        total_tokens: usage.total_tokens || null,
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
        notes: `Lead: ${inbound.text}\n\nIA: ${aiReply.text}`,
      });

      processed.push({
        messageId: inbound.messageId,
        leadId: lead.id,
        conversationId: conversation.id,
        status: "replied",
      });
    }

    return json({ ok: true, processed });
  } catch (error) {
    return json({ ok: false, error: (error as Error).message }, 500);
  }
});
