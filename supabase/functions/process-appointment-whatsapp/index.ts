import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Command = "confirm" | "cancel" | "reschedule" | "unknown";

function extractInbound(body: Record<string, unknown>): { text: string; from: string | null } {
  const directText = String(body?.message || body?.text || "");
  const directFrom = body?.phone ? String(body.phone) : (body?.from ? String(body.from) : null);
  if (directText) return { text: directText, from: directFrom };

  const entry = Array.isArray(body?.entry) ? body.entry[0] as Record<string, unknown> : null;
  const changes = entry && Array.isArray(entry?.changes) ? entry.changes[0] as Record<string, unknown> : null;
  const value = changes?.value as Record<string, unknown> | undefined;
  const messages = value && Array.isArray(value?.messages) ? value.messages : [];
  const message = messages[0] as Record<string, unknown> | undefined;
  const nestedText = String((message?.text as Record<string, unknown> | undefined)?.body || "");
  const nestedFrom = message?.from ? String(message.from) : null;

  return { text: nestedText, from: nestedFrom };
}

function parseCommand(text: string): { action: Command; token: string | null } {
  const content = String(text || "");
  const normalized = content.toLowerCase();
  const token = content.match(/#([a-zA-Z0-9_-]{6,64})/)?.[1] ?? null;

  if (/\b(remarcar|reagendar)\b/.test(normalized)) return { action: "reschedule", token };
  if (/\b(cancelar|cancelo|cancelado)\b/.test(normalized)) return { action: "cancel", token };
  if (/\b(confirmar|confirmo|ok)\b/.test(normalized)) return { action: "confirm", token };
  return { action: "unknown", token };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const expectedWebhookToken = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN") || "";

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") || "";
    if (mode === "subscribe" && token && expectedWebhookToken && token === expectedWebhookToken) {
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("SUPABASE env vars not configured");
    const admin = createClient(supabaseUrl, serviceRole);

    const bearerHeader = req.headers.get("authorization");
    const tokenHeader = req.headers.get("x-webhook-token");
    const bearerToken = bearerHeader?.toLowerCase().startsWith("bearer ")
      ? bearerHeader.slice(7).trim()
      : null;
    const providedToken = tokenHeader || bearerToken || "";

    if (expectedWebhookToken && providedToken !== expectedWebhookToken) {
      return new Response(JSON.stringify({ ok: false, reason: "unauthorized_webhook" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const body = await req.json();
    const inbound = extractInbound((body || {}) as Record<string, unknown>);
    const incomingText = inbound.text;
    const sourcePhone = inbound.from;
    const parsed = parseCommand(incomingText);
    if (!parsed.token) {
      return new Response(JSON.stringify({ ok: false, reason: "token_missing", parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { data: tokenRow, error: tokenError } = await admin
      .from("appointment_whatsapp_tokens")
      .select("*")
      .eq("token", parsed.token)
      .maybeSingle();
    if (tokenError) throw tokenError;
    if (!tokenRow) {
      return new Response(JSON.stringify({ ok: false, reason: "token_not_found", parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const isExpired = new Date(tokenRow.expires_at).getTime() < Date.now();
    if (isExpired || tokenRow.status !== "pending") {
      await admin.from("appointment_whatsapp_tokens")
        .update({ status: isExpired ? "expired" : tokenRow.status })
        .eq("id", tokenRow.id);
      return new Response(JSON.stringify({ ok: false, reason: "token_expired_or_consumed", parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    let appointmentStatus: "confirmed" | "cancelled" | null = null;
    if (parsed.action === "confirm") appointmentStatus = "confirmed";
    if (parsed.action === "cancel") appointmentStatus = "cancelled";

    if (appointmentStatus) {
      const appointmentPatch: Record<string, unknown> = { status: appointmentStatus };
      if (appointmentStatus === "confirmed") appointmentPatch["confirmed_at"] = new Date().toISOString();
      if (appointmentStatus === "cancelled") appointmentPatch["cancelled_reason"] = "Cancelado via WhatsApp";

      const { error: appointmentError } = await admin
        .from("appointments")
        .update(appointmentPatch)
        .eq("id", tokenRow.appointment_id)
        .eq("clinic_id", tokenRow.clinic_id);
      if (appointmentError) throw appointmentError;
    }

    await admin.from("appointment_whatsapp_tokens").update({
      status: parsed.action === "confirm" ? "confirmed" : parsed.action === "cancel" ? "cancelled" : "pending",
      consumed_at: new Date().toISOString(),
      consumed_command: parsed.action,
    }).eq("id", tokenRow.id);

    await admin.from("whatsapp_command_logs").insert({
      clinic_id: tokenRow.clinic_id,
      appointment_id: tokenRow.appointment_id,
      token_id: tokenRow.id,
      source_phone: sourcePhone,
      incoming_text: incomingText,
      parsed_command: parsed.action,
      result_status: appointmentStatus ? "applied" : parsed.action === "reschedule" ? "needs_manual_followup" : "ignored",
      details: { token: parsed.token },
    });

    return new Response(JSON.stringify({
      ok: true,
      action: parsed.action,
      appointmentStatus,
      appointmentId: tokenRow.appointment_id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
